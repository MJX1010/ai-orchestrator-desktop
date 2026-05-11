import { invoke } from '@tauri-apps/api/core'
import type {
  ConfigRequest,
  PluginOperationRequest,
  ProviderAdapter,
  StepResult,
} from './provider-adapter'
import type {
  CcSwitchLifecycleAction,
  CcSwitchLifecycleState,
  CcSwitchSqliteSnapshot,
  DesiredPluginState,
  ObservedPluginState,
  PluginManifest,
  Provider,
} from '../shared/types'
import { applyCcSwitchLifecycleAction } from '../shared/ccswitch-lifecycle'
import { normalizeSqliteLifecycle } from '../shared/real-integrations'
import { isTauriRuntime } from '../shared/tauri'

interface CcSwitchRuntimeState {
  exists: boolean
  settings: Record<string, unknown>
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const nowMs = () => performance.now()

const toStepResult = (
  startTime: number,
  success: boolean,
  message: string,
): StepResult => ({
  success,
  message,
  durationMs: Math.round(performance.now() - startTime),
})

const getRuntimeEnabled = (runtime: CcSwitchRuntimeState) =>
  Boolean(runtime.settings.enableClaudePluginIntegration)

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export class CcSwitchProviderAdapter implements ProviderAdapter {
  public readonly provider: Provider = 'cc-switch'
  private readonly manifests: PluginManifest[]
  private readonly manifestByPluginId: Map<string, PluginManifest>
  private readonly configDir: string
  private readonly lifecycleByPluginId: Map<string, CcSwitchLifecycleState>
  private fallbackRuntime: CcSwitchRuntimeState

  public constructor(
    manifests: PluginManifest[],
    desiredPlugins: DesiredPluginState[],
    configDir: string,
    lifecycleStates: CcSwitchLifecycleState[] = [],
  ) {
    this.manifests = manifests
    this.manifestByPluginId = new Map(manifests.map((manifest) => [manifest.pluginId, manifest]))
    this.configDir = configDir
    this.lifecycleByPluginId = new Map(
      manifests.map((manifest) => {
        const desiredPlugin = desiredPlugins.find((plugin) => plugin.pluginId === manifest.pluginId)
        const seededLifecycle = lifecycleStates.find(
          (state) => state.pluginId === manifest.pluginId,
        )
        return [
          manifest.pluginId,
          clone(
            seededLifecycle ?? {
              provider: 'cc-switch',
              pluginId: manifest.pluginId,
              displayName: manifest.displayName,
              sqlitePath: `${configDir}/plugins.db`,
              installed: Boolean(desiredPlugin?.enabled),
              enabled: Boolean(desiredPlugin?.enabled),
              currentVersion: desiredPlugin?.enabled ? manifest.defaultVersion : null,
              latestVersion: manifest.defaultVersion,
              status: desiredPlugin?.enabled ? 'installed' : 'available',
            },
          ),
        ]
      }),
    )

    const desiredSwitchCore = desiredPlugins.find((plugin) => plugin.pluginId === 'switch-core')
    this.fallbackRuntime = {
      exists: true,
      settings: {
        enableClaudePluginIntegration: Boolean(desiredSwitchCore?.enabled),
        aiOrchestrator: clone(desiredSwitchCore?.configValues ?? {}),
      },
    }
  }

  public async discover(): Promise<ObservedPluginState[]> {
    const runtime = await this.readRuntime()
    return this.manifests.map((manifest) => {
      const lifecycleState = this.requireLifecycle(manifest.pluginId)
      const installed = runtime.exists && lifecycleState.installed
      const enabled = installed ? lifecycleState.enabled : false
      return {
        provider: 'cc-switch',
        pluginId: manifest.pluginId,
        installed,
        installedVersion: installed ? lifecycleState.currentVersion : null,
        enabled,
        health: installed ? (enabled ? 'ok' : 'warn') : 'error',
        lastError: installed ? undefined : 'cc-switch settings.json not found',
      }
    })
  }

  public async install(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    this.applyLifecycleAction(request.pluginId, 'install')
    return toStepResult(startTime, true, `Simulated install for ${manifest.displayName}.`)
  }

  public async uninstall(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    this.applyLifecycleAction(request.pluginId, 'uninstall')
    return toStepResult(startTime, true, `Simulated uninstall for ${manifest.displayName}.`)
  }

  public async upgrade(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    this.applyLifecycleAction(request.pluginId, 'upgrade')
    return toStepResult(startTime, true, `Simulated upgrade for ${manifest.displayName}.`)
  }

  public async enable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    if (!runtime.exists) {
      return toStepResult(startTime, false, 'cc-switch settings file not found.')
    }

    await this.setEnabled(true)
    this.applyLifecycleAction(request.pluginId, 'enable')
    return toStepResult(startTime, true, 'Enabled cc-switch plugin integration.')
  }

  public async disable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    if (!runtime.exists) {
      return toStepResult(startTime, false, 'cc-switch settings file not found.')
    }

    await this.setEnabled(false)
    this.applyLifecycleAction(request.pluginId, 'disable')
    return toStepResult(startTime, true, 'Disabled cc-switch plugin integration.')
  }

  public async readConfig(request: PluginOperationRequest): Promise<Record<string, unknown>> {
    this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const aiOrchestratorConfig = runtime.settings.aiOrchestrator
    return clone(toObjectRecord(aiOrchestratorConfig))
  }

  public async writeConfig(request: ConfigRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    await this.setAiOrchestratorConfig(request.values)
    return toStepResult(startTime, true, 'Saved cc-switch aiOrchestrator config.')
  }

  public async healthCheck(request: PluginOperationRequest) {
    this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    if (!runtime.exists) {
      return {
        health: 'error' as const,
        message: 'cc-switch settings.json is missing',
      }
    }

    const enabled = getRuntimeEnabled(runtime)
    return {
      health: enabled ? ('ok' as const) : ('warn' as const),
      message: enabled
        ? 'cc-switch plugin integration is enabled'
        : 'cc-switch plugin integration is disabled',
    }
  }

  public getLifecycleStates(): CcSwitchLifecycleState[] {
    return [...this.lifecycleByPluginId.values()].map((state) => clone(state))
  }

  public applySqliteSnapshot(snapshot: CcSwitchSqliteSnapshot): void {
    for (const [pluginId, lifecycleState] of this.lifecycleByPluginId) {
      this.lifecycleByPluginId.set(pluginId, {
        ...lifecycleState,
        ...normalizeSqliteLifecycle(snapshot),
        lastMessage: snapshot.available
          ? `Read ${snapshot.skillsCount} skill row(s) from cc-switch SQLite.`
          : snapshot.error,
      })
    }
  }

  public runLifecycleAction(
    pluginId: string,
    action: CcSwitchLifecycleAction,
  ): StepResult {
    const startTime = nowMs()
    const manifest = this.requireManifest(pluginId)
    const nextState = this.applyLifecycleAction(pluginId, action)
    return toStepResult(
      startTime,
      true,
      nextState.lastMessage ?? `Simulated ${action} for ${manifest.displayName}.`,
    )
  }

  private requireManifest(pluginId: string): PluginManifest {
    const manifest = this.manifestByPluginId.get(pluginId)
    if (!manifest) {
      throw new Error(`[cc-switch] Unknown plugin manifest: ${pluginId}`)
    }
    return manifest
  }

  private requireLifecycle(pluginId: string): CcSwitchLifecycleState {
    const lifecycleState = this.lifecycleByPluginId.get(pluginId)
    if (!lifecycleState) {
      throw new Error(`[cc-switch] Unknown lifecycle state: ${pluginId}`)
    }
    return lifecycleState
  }

  private applyLifecycleAction(
    pluginId: string,
    action: CcSwitchLifecycleAction,
  ): CcSwitchLifecycleState {
    const lifecycleState = this.requireLifecycle(pluginId)
    const nextState = applyCcSwitchLifecycleAction(lifecycleState, action)
    this.lifecycleByPluginId.set(pluginId, nextState)

    this.fallbackRuntime.exists = action !== 'uninstall'
    this.fallbackRuntime.settings.enableClaudePluginIntegration = nextState.enabled

    return nextState
  }

  private async readRuntime(): Promise<CcSwitchRuntimeState> {
    if (!isTauriRuntime()) {
      return clone(this.fallbackRuntime)
    }

    const runtime = await invoke<CcSwitchRuntimeState>('ccswitch_read_runtime', {
      ccswitchConfigDir: this.configDir,
    })
    this.fallbackRuntime = clone(runtime)
    return runtime
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    if (!isTauriRuntime()) {
      this.fallbackRuntime.settings.enableClaudePluginIntegration = enabled
      return
    }

    await invoke<string>('ccswitch_set_enabled', {
      ccswitchConfigDir: this.configDir,
      enabled,
    })
  }

  private async setAiOrchestratorConfig(config: Record<string, unknown>): Promise<void> {
    if (!isTauriRuntime()) {
      this.fallbackRuntime.settings.aiOrchestrator = clone(config)
      return
    }

    await invoke<string>('ccswitch_set_ai_orchestrator_config', {
      ccswitchConfigDir: this.configDir,
      config,
    })
  }
}
