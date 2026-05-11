import type {
  ObservedPluginState,
  PluginHealth,
  Provider,
} from '../shared/types'

export interface PluginOperationRequest {
  pluginId: string
}

export interface ConfigRequest extends PluginOperationRequest {
  values: Record<string, unknown>
}

export interface StepResult {
  success: boolean
  message: string
  durationMs: number
}

export interface HealthResult {
  health: PluginHealth
  message: string
}

export interface ProviderAdapter {
  provider: Provider
  discover(): Promise<ObservedPluginState[]>
  install(request: PluginOperationRequest): Promise<StepResult>
  uninstall(request: PluginOperationRequest): Promise<StepResult>
  upgrade(request: PluginOperationRequest): Promise<StepResult>
  enable(request: PluginOperationRequest): Promise<StepResult>
  disable(request: PluginOperationRequest): Promise<StepResult>
  readConfig(request: PluginOperationRequest): Promise<Record<string, unknown>>
  writeConfig(request: ConfigRequest): Promise<StepResult>
  healthCheck(request: PluginOperationRequest): Promise<HealthResult>
}
