import { invoke } from '@tauri-apps/api/core'
import type {
  ConfigRequest,
  PluginOperationRequest,
  ProviderAdapter,
  StepResult,
} from './provider-adapter'
import type {
  DesiredPluginState,
  ObservedPluginState,
  PluginManifest,
  Provider,
} from '../shared/types'
import { isTauriRuntime } from '../shared/tauri'

interface ClaudeInstalledPlugin {
  key: string
  version: string
}

interface ClaudeRuntimeState {
  installed_plugins: ClaudeInstalledPlugin[]
  enabled_plugins: Record<string, boolean>
  plugin_configs: Record<string, unknown>
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


const normalizePluginConfigs = (
  desiredPlugins: DesiredPluginState[],
  manifests: PluginManifest[],
) => {
  const pluginConfigsByKey: Record<string, Record<string, unknown>> = {}
  const manifestByPluginId = new Map(manifests.map((manifest) => [manifest.pluginId, manifest]))
  desiredPlugins.forEach((desiredPlugin) => {
    const manifest = manifestByPluginId.get(desiredPlugin.pluginId)
    const pluginKey = manifest?.externalId ?? desiredPlugin.pluginId
    pluginConfigsByKey[pluginKey] = clone(desiredPlugin.configValues)
  })
  return pluginConfigsByKey
}

export class ClaudeProviderAdapter implements ProviderAdapter {
  public readonly provider: Provider = 'claude'
  private readonly manifests: PluginManifest[]
  private readonly manifestByPluginId: Map<string, PluginManifest>
  private readonly configDir: string
  private fallbackRuntime: ClaudeRuntimeState

  public constructor(
    manifests: PluginManifest[],
    desiredPlugins: DesiredPluginState[],
    configDir: string,
  ) {
    this.manifests = manifests
    this.manifestByPluginId = new Map(manifests.map((manifest) => [manifest.pluginId, manifest]))
    this.configDir = configDir

    const installedPlugins = manifests.map((manifest) => ({
      key: manifest.externalId ?? `${manifest.pluginId}@unknown`,
      version: manifest.defaultVersion,
    }))

    const enabledPlugins: Record<string, boolean> = {}
    desiredPlugins.forEach((plugin) => {
      const manifest = this.manifestByPluginId.get(plugin.pluginId)
      const pluginKey = manifest?.externalId ?? plugin.pluginId
      enabledPlugins[pluginKey] = plugin.enabled
    })

    this.fallbackRuntime = {
      installed_plugins: installedPlugins,
      enabled_plugins: enabledPlugins,
      plugin_configs: normalizePluginConfigs(desiredPlugins, manifests),
    }
  }

  public async discover(): Promise<ObservedPluginState[]> {
    const runtime = await this.readRuntime()
    return this.manifests.map((manifest) => {
      const pluginKey = this.resolvePluginKey(manifest, runtime)
      const installedEntry = runtime.installed_plugins.find((item) => item.key === pluginKey)
      const installed = Boolean(installedEntry)
      const enabled = installed ? Boolean(runtime.enabled_plugins[pluginKey]) : false
      return {
        provider: 'claude',
        pluginId: manifest.pluginId,
        installed,
        installedVersion: installedEntry?.version ?? null,
        enabled,
        health: installed ? (enabled ? 'ok' : 'warn') : 'warn',
        lastError: installed ? undefined : 'Plugin not found in installed_plugins.json',
      }
    })
  }

  public async install(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    return toStepResult(
      startTime,
      false,
      `Install is not automated yet for ${manifest.displayName}. Please install via Claude CLI/plugin marketplace first.`,
    )
  }

  public async uninstall(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    return toStepResult(
      startTime,
      false,
      `Uninstall is not automated yet for ${manifest.displayName}.`,
    )
  }

  public async upgrade(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    return toStepResult(startTime, true, `Upgrade check skipped for ${manifest.displayName}.`)
  }

  public async enable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const pluginKey = this.resolvePluginKey(manifest, runtime)
    const exists = runtime.installed_plugins.some((plugin) => plugin.key === pluginKey)
    if (!exists) {
      return toStepResult(
        startTime,
        false,
        `Cannot enable ${manifest.displayName}: plugin is not installed in Claude.`,
      )
    }

    await this.setEnabledPlugin(pluginKey, true)
    return toStepResult(startTime, true, `Enabled ${manifest.displayName}.`)
  }

  public async disable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const pluginKey = this.resolvePluginKey(manifest, runtime)
    await this.setEnabledPlugin(pluginKey, false)
    return toStepResult(startTime, true, `Disabled ${manifest.displayName}.`)
  }

  public async readConfig(request: PluginOperationRequest): Promise<Record<string, unknown>> {
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const pluginKey = this.resolvePluginKey(manifest, runtime)
    const rawConfig = runtime.plugin_configs[pluginKey]

    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      return {}
    }

    return clone(rawConfig as Record<string, unknown>)
  }

  public async writeConfig(request: ConfigRequest): Promise<StepResult> {
    const startTime = nowMs()
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const pluginKey = this.resolvePluginKey(manifest, runtime)
    await this.setPluginConfig(pluginKey, request.values)
    return toStepResult(startTime, true, `Saved config for ${manifest.displayName}.`)
  }

  public async healthCheck(request: PluginOperationRequest) {
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const pluginKey = this.resolvePluginKey(manifest, runtime)
    const installedEntry = runtime.installed_plugins.find((item) => item.key === pluginKey)
    if (!installedEntry) {
      return {
        health: 'warn' as const,
        message: `${manifest.displayName} is not installed`,
      }
    }
    const enabled = Boolean(runtime.enabled_plugins[pluginKey])
    return {
      health: enabled ? ('ok' as const) : ('warn' as const),
      message: enabled
        ? `${manifest.displayName} is enabled`
        : `${manifest.displayName} is installed but disabled`,
    }
  }

  private requireManifest(pluginId: string): PluginManifest {
    const manifest = this.manifestByPluginId.get(pluginId)
    if (!manifest) {
      throw new Error(`[claude] Unknown plugin manifest: ${pluginId}`)
    }
    return manifest
  }

  private resolvePluginKey(manifest: PluginManifest, runtime: ClaudeRuntimeState): string {
    if (manifest.externalId) {
      return manifest.externalId
    }

    const prefix = `${manifest.pluginId}@`
    const matchedPlugin = runtime.installed_plugins.find((plugin) =>
      plugin.key.startsWith(prefix),
    )
    return matchedPlugin?.key ?? manifest.pluginId
  }

  private async readRuntime(): Promise<ClaudeRuntimeState> {
    if (!isTauriRuntime()) {
      return clone(this.fallbackRuntime)
    }

    const runtime = await invoke<ClaudeRuntimeState>('claude_read_runtime', {
      claudeConfigDir: this.configDir,
    })
    this.fallbackRuntime = clone(runtime)
    return runtime
  }

  private async setEnabledPlugin(pluginKey: string, enabled: boolean): Promise<void> {
    if (!isTauriRuntime()) {
      this.fallbackRuntime.enabled_plugins[pluginKey] = enabled
      return
    }

    await invoke<string>('claude_set_enabled_plugin', {
      claudeConfigDir: this.configDir,
      pluginKey,
      enabled,
    })
  }

  private async setPluginConfig(
    pluginKey: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!isTauriRuntime()) {
      this.fallbackRuntime.plugin_configs[pluginKey] = clone(config)
      return
    }

    await invoke<string>('claude_set_plugin_config', {
      claudeConfigDir: this.configDir,
      pluginKey,
      config,
    })
  }
}
