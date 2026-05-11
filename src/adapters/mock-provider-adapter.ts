import type { ConfigRequest, PluginOperationRequest, ProviderAdapter, StepResult } from './provider-adapter'
import type {
  DesiredPluginState,
  ObservedPluginState,
  PluginManifest,
  Provider,
} from '../shared/types'

const mockDelay = (milliseconds = 80) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class InMemoryProviderAdapter implements ProviderAdapter {
  public readonly provider: Provider
  private readonly manifestById: Map<string, PluginManifest>
  private readonly pluginStateById: Map<string, ObservedPluginState>
  private readonly configById: Map<string, Record<string, unknown>>

  public constructor(
    provider: Provider,
    manifests: PluginManifest[],
    desiredPlugins: DesiredPluginState[],
  ) {
    this.provider = provider
    this.manifestById = new Map(manifests.map((manifest) => [manifest.pluginId, manifest]))
    this.pluginStateById = new Map<string, ObservedPluginState>()
    this.configById = new Map<string, Record<string, unknown>>()

    manifests.forEach((manifest) => {
      const desiredState = desiredPlugins.find(
        (plugin) =>
          plugin.provider === manifest.provider && plugin.pluginId === manifest.pluginId,
      )
      const isInstalled = Boolean(desiredState?.enabled)

      this.pluginStateById.set(manifest.pluginId, {
        provider: this.provider,
        pluginId: manifest.pluginId,
        installed: isInstalled,
        installedVersion: isInstalled ? manifest.defaultVersion : null,
        enabled: Boolean(desiredState?.enabled),
        health: isInstalled ? 'ok' : 'warn',
      })
      this.configById.set(manifest.pluginId, clone(desiredState?.configValues ?? {}))
    })
  }

  public async discover(): Promise<ObservedPluginState[]> {
    await mockDelay()
    return [...this.pluginStateById.values()].map((state) => clone(state))
  }

  public async install(request: PluginOperationRequest): Promise<StepResult> {
    return this.runStep(`Install ${request.pluginId}`, () => {
      const state = this.requireState(request.pluginId)
      const manifest = this.requireManifest(request.pluginId)
      state.installed = true
      state.enabled = false
      state.installedVersion = manifest.defaultVersion
      state.health = 'warn'
    })
  }

  public async uninstall(request: PluginOperationRequest): Promise<StepResult> {
    return this.runStep(`Uninstall ${request.pluginId}`, () => {
      const state = this.requireState(request.pluginId)
      state.installed = false
      state.enabled = false
      state.installedVersion = null
      state.health = 'warn'
    })
  }

  public async upgrade(request: PluginOperationRequest): Promise<StepResult> {
    return this.runStep(`Upgrade ${request.pluginId}`, () => {
      const state = this.requireState(request.pluginId)
      const manifest = this.requireManifest(request.pluginId)
      state.installed = true
      state.installedVersion = manifest.defaultVersion
      state.health = state.enabled ? 'ok' : 'warn'
    })
  }

  public async enable(request: PluginOperationRequest): Promise<StepResult> {
    return this.runStep(`Enable ${request.pluginId}`, () => {
      const state = this.requireState(request.pluginId)
      if (!state.installed) {
        state.installed = true
      }
      if (!state.installedVersion) {
        state.installedVersion = this.requireManifest(request.pluginId).defaultVersion
      }
      state.enabled = true
      state.health = 'ok'
    })
  }

  public async disable(request: PluginOperationRequest): Promise<StepResult> {
    return this.runStep(`Disable ${request.pluginId}`, () => {
      const state = this.requireState(request.pluginId)
      state.enabled = false
      state.health = state.installed ? 'warn' : 'warn'
    })
  }

  public async readConfig(request: PluginOperationRequest): Promise<Record<string, unknown>> {
    await mockDelay(40)
    return clone(this.configById.get(request.pluginId) ?? {})
  }

  public async writeConfig(request: ConfigRequest): Promise<StepResult> {
    return this.runStep(`Write config ${request.pluginId}`, () => {
      this.requireState(request.pluginId)
      this.configById.set(request.pluginId, clone(request.values))
    })
  }

  public async healthCheck(request: PluginOperationRequest) {
    await mockDelay(40)
    const state = this.requireState(request.pluginId)
    if (!state.installed) {
      return {
        health: 'warn' as const,
        message: `${request.pluginId} is not installed`,
      }
    }
    if (!state.enabled) {
      return {
        health: 'warn' as const,
        message: `${request.pluginId} is installed but disabled`,
      }
    }
    return {
      health: 'ok' as const,
      message: `${request.pluginId} is healthy`,
    }
  }

  private async runStep(message: string, action: () => void): Promise<StepResult> {
    const startTime = performance.now()
    await mockDelay()
    action()
    return {
      success: true,
      message,
      durationMs: Math.round(performance.now() - startTime),
    }
  }

  private requireManifest(pluginId: string): PluginManifest {
    const manifest = this.manifestById.get(pluginId)
    if (!manifest) {
      throw new Error(`[${this.provider}] Unknown plugin manifest: ${pluginId}`)
    }
    return manifest
  }

  private requireState(pluginId: string): ObservedPluginState {
    const state = this.pluginStateById.get(pluginId)
    if (!state) {
      throw new Error(`[${this.provider}] Unknown plugin state: ${pluginId}`)
    }
    return state
  }
}

export const createMockProviderAdapters = (
  manifests: PluginManifest[],
  desiredPlugins: DesiredPluginState[],
): ProviderAdapter[] => {
  const providers: Provider[] = ['codex', 'claude', 'cc-switch']
  return providers.map(
    (provider) =>
      new InMemoryProviderAdapter(
        provider,
        manifests.filter((manifest) => manifest.provider === provider),
        desiredPlugins.filter((plugin) => plugin.provider === provider),
      ),
  )
}
