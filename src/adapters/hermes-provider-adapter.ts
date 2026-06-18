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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const nowMs = () => performance.now()

const toStepResult = (startTime: number, message: string): StepResult => ({
  success: true,
  message,
  durationMs: Math.round(performance.now() - startTime),
})

const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface HermesRuntimeState {
  mcpServers: Array<{ name: string; command: string; args: string[] }>
  skillsCount: number
  enabledSkillsCount: number
}

export class HermesProviderAdapter implements ProviderAdapter {
  public readonly provider: Provider = 'hermes'
  private readonly manifests: PluginManifest[]
  private readonly manifestByPluginId: Map<string, PluginManifest>
  private readonly configDir: string
  private readonly skillsDir: string
  private fallbackRuntime: HermesRuntimeState

  public constructor(
    manifests: PluginManifest[],
    _desiredPlugins: DesiredPluginState[],
    configDir: string,
    skillsDir: string,
  ) {
    this.manifests = manifests
    this.manifestByPluginId = new Map(manifests.map((m) => [m.pluginId, m]))
    this.configDir = configDir
    this.skillsDir = skillsDir
    this.fallbackRuntime = {
      mcpServers: manifests.map((m) => ({
        name: m.pluginId,
        command: 'unknown',
        args: [],
      })),
      skillsCount: 0,
      enabledSkillsCount: 0,
    }
  }

  public async discover(): Promise<ObservedPluginState[]> {
    const runtime = await this.readRuntime()
    return this.manifests.map((manifest) => {
      const mcpEntry = runtime.mcpServers.find((s) => s.name === manifest.pluginId)
      const installed = Boolean(mcpEntry)
      return {
        provider: 'hermes',
        pluginId: manifest.pluginId,
        installed,
        installedVersion: installed ? manifest.defaultVersion : null,
        enabled: installed,
        health: installed ? 'ok' : 'warn',
        lastError: installed ? undefined : 'MCP server not found in Hermes config',
      }
    })
  }

  public async install(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Install not automated for Hermes plugin ${request.pluginId}`)
  }

  public async uninstall(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Uninstall not automated for Hermes plugin ${request.pluginId}`)
  }

  public async upgrade(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Upgrade check skipped for ${request.pluginId}`)
  }

  public async enable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Enable not automated for Hermes plugin ${request.pluginId}`)
  }

  public async disable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Disable not automated for Hermes plugin ${request.pluginId}`)
  }

  public async readConfig(_request: PluginOperationRequest): Promise<Record<string, unknown>> {
    return {}
  }

  public async writeConfig(_request: ConfigRequest): Promise<StepResult> {
    const startTime = nowMs()
    return toStepResult(startTime, 'Config write not supported for Hermes plugins')
  }

  public async healthCheck(request: PluginOperationRequest) {
    const manifest = this.requireManifest(request.pluginId)
    const runtime = await this.readRuntime()
    const found = runtime.mcpServers.some((s) => s.name === request.pluginId)
    return {
      health: found ? ('ok' as const) : ('warn' as const),
      message: found
        ? `${manifest.displayName} MCP server configured`
        : `${manifest.displayName} MCP server not found`,
    }
  }

  private requireManifest(pluginId: string): PluginManifest {
    const manifest = this.manifestByPluginId.get(pluginId)
    if (!manifest) {
      throw new Error(`[hermes] Unknown plugin: ${pluginId}`)
    }
    return manifest
  }

  private async readRuntime(): Promise<HermesRuntimeState> {
    if (!isTauriRuntime()) {
      return clone(this.fallbackRuntime)
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const runtime = await invoke<HermesRuntimeState>('hermes_read_runtime', {
        hermesConfigDir: this.configDir,
        hermesSkillsDir: this.skillsDir,
      })
      this.fallbackRuntime = clone(runtime)
      return runtime
    } catch {
      return clone(this.fallbackRuntime)
    }
  }
}
