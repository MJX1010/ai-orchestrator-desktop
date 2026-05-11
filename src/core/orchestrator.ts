import { invoke } from '@tauri-apps/api/core'
import { createProviderAdapters } from '../adapters/create-provider-adapters'
import { CcSwitchProviderAdapter } from '../adapters/ccswitch-provider-adapter'
import {
  readCcSwitchSqliteSnapshot,
  readGitReadOnlyStatus,
} from '../adapters/read-only-runtime-adapter'
import type {
  ConfigRequest,
  PluginOperationRequest,
  ProviderAdapter,
  StepResult,
} from '../adapters/provider-adapter'
import { buildReconcilePlan } from './planner'
import {
  mockCcSwitchLifecycle,
  mockDesiredState,
  mockManifests,
  mockProfiles,
  mockSettings,
  mockSyncStatus,
} from '../shared/mock-data'
import type {
  AppSnapshot,
  CcSwitchLifecycleAction,
  DesiredPluginState,
  DesiredState,
  GitDivergenceResolution,
  GitReadOnlyStatus,
  GitSyncStatus,
  ObservedState,
  OperationLog,
  PluginManifest,
  Provider,
  ReconcileAction,
  ReconcilePlanItem,
  VersionPolicy,
} from '../shared/types'
import { createLocalChangePreview, applyGitSyncTransition } from '../shared/git-sync'
import { createUnavailableGitStatus } from '../shared/real-integrations'
import { isTauriRuntime } from '../shared/tauri'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const now = () => new Date().toISOString()

const randomId = () => `op-${Math.random().toString(16).slice(2, 10)}`

interface ClaudeInstalledPlugin {
  key: string
  version: string
}

interface ClaudeRuntimeState {
  installed_plugins: ClaudeInstalledPlugin[]
  enabled_plugins: Record<string, boolean>
  plugin_configs: Record<string, unknown>
}

const staticNonClaudeManifests = mockManifests.filter((m) => m.provider !== 'claude')

const staticClaudeManifestsByExternalId = new Map(
  mockManifests
    .filter((m) => m.provider === 'claude' && m.externalId)
    .map((m) => [m.externalId!, m]),
)

function claudeKeyToManifest(key: string, version: string): PluginManifest {
  const atIndex = key.indexOf('@')
  const pluginId = atIndex >= 0 ? key.slice(0, atIndex) : key
  const displayName = pluginId
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return {
    pluginId,
    provider: 'claude',
    displayName,
    externalId: key,
    source: 'registry',
    defaultVersion: version,
    configSchemaRef: `schemas/dynamic/${pluginId}.schema.json`,
    configPath: `${mockSettings.paths.claudeConfigDir}/plugins/${pluginId}`,
  }
}

async function buildRuntimeManifests(): Promise<PluginManifest[]> {
  if (!isTauriRuntime()) {
    return clone(mockManifests)
  }
  try {
    const runtime = await invoke<ClaudeRuntimeState>('claude_read_runtime', {
      claudeConfigDir: mockSettings.paths.claudeConfigDir,
    })
    const claudeManifests = runtime.installed_plugins.map((p) =>
      staticClaudeManifestsByExternalId.get(p.key) ?? claudeKeyToManifest(p.key, p.version),
    )
    return [...staticNonClaudeManifests, ...claudeManifests]
  } catch {
    return clone(mockManifests)
  }
}

async function loadSavedDesiredState(): Promise<DesiredState | null> {
  if (!isTauriRuntime()) {
    return null
  }
  try {
    const state = await invoke<DesiredState | null>('orchestrator_read_state', {
      configDir: mockSettings.paths.claudeConfigDir,
    })
    return state ?? null
  } catch {
    return null
  }
}

function mergeDesiredState(base: DesiredState, manifests: PluginManifest[]): DesiredState {
  const existingKeys = new Set(base.plugins.map((p) => `${p.provider}:${p.pluginId}`))
  const newPlugins: DesiredPluginState[] = manifests
    .filter((m) => !existingKeys.has(`${m.provider}:${m.pluginId}`))
    .map((m) => ({
      provider: m.provider,
      pluginId: m.pluginId,
      versionPolicy: 'latest' as VersionPolicy,
      enabled: false,
      configValues: {},
    }))
  return { ...base, plugins: [...base.plugins, ...newPlugins] }
}

export class MockOrchestrator {
  private readonly adapters: Map<Provider, ProviderAdapter>
  private readonly profiles: string[]
  private readonly settings = clone(mockSettings)
  private readonly manifests: PluginManifest[]
  private desiredState: DesiredState
  private observedState: ObservedState
  private operations: OperationLog[]
  private lastPlan: ReconcilePlanItem[]
  private syncStatus: GitSyncStatus
  private gitReadOnlyStatus: GitReadOnlyStatus

  private constructor(manifests: PluginManifest[], desiredState: DesiredState) {
    this.manifests = manifests
    const adapters = createProviderAdapters(
      manifests,
      desiredState.plugins,
      this.settings,
      mockCcSwitchLifecycle,
    )
    this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]))
    this.profiles = [...mockProfiles]
    this.desiredState = clone(desiredState)
    this.observedState = { plugins: [] }
    this.operations = []
    this.lastPlan = []
    this.syncStatus = clone(mockSyncStatus)
    this.gitReadOnlyStatus = createUnavailableGitStatus(
      this.settings.paths.gitRepoDir,
      'Real Git status has not been read yet.',
    )
    this.recomputeSyncHealth()
  }

  public static async bootstrap(): Promise<MockOrchestrator> {
    const [manifests, savedState] = await Promise.all([
      buildRuntimeManifests(),
      loadSavedDesiredState(),
    ])

    const desiredState = savedState ?? mergeDesiredState(mockDesiredState, manifests)
    const orchestrator = new MockOrchestrator(manifests, desiredState)

    await Promise.all([
      orchestrator.refreshObserved(),
      orchestrator.refreshReadOnlyIntegrations(),
    ])
    return orchestrator
  }

  public getSnapshot(): AppSnapshot {
    return clone({
      manifests: this.manifests,
      profiles: this.profiles,
      desiredState: this.desiredState,
      observedState: this.observedState,
      operations: this.operations,
      lastPlan: this.lastPlan,
      syncStatus: this.syncStatus,
      gitReadOnlyStatus: this.gitReadOnlyStatus,
      ccSwitchLifecycle: this.getCcSwitchAdapter().getLifecycleStates(),
      settings: this.settings,
    })
  }

  public async refreshObserved(): Promise<void> {
    const discoveredByProvider = await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.discover()),
    )
    this.observedState.plugins = discoveredByProvider.flat()
  }

  public async refreshReadOnlyIntegrations(): Promise<void> {
    const [gitStatus, sqliteSnapshot] = await Promise.all([
      readGitReadOnlyStatus(this.settings.paths.gitRepoDir),
      readCcSwitchSqliteSnapshot(this.settings.paths.ccSwitchConfigDir),
    ])

    this.gitReadOnlyStatus = gitStatus

    if (gitStatus.available) {
      this.syncStatus.ahead = gitStatus.ahead
      this.syncStatus.behind = gitStatus.behind
      this.syncStatus.localChanges = gitStatus.localChanges
      this.syncStatus.remoteChanges = gitStatus.remoteChanges
      this.syncStatus.branch = gitStatus.branch ?? this.syncStatus.branch
      this.syncStatus.lastSyncAt = gitStatus.lastReadAt
      this.syncStatus.lastOperationSummary = {
        title: 'Read local Git status',
        result: 'success',
        details: [
          `Repo: ${gitStatus.repoPath}`,
          `Ahead/behind: ${gitStatus.ahead}/${gitStatus.behind}`,
        ],
        timestamp: now(),
      }
      this.recomputeSyncHealth()
    }

    if (sqliteSnapshot) {
      this.getCcSwitchAdapter().applySqliteSnapshot(sqliteSnapshot)
    }
  }

  public async setPluginEnabled(
    provider: Provider,
    pluginId: string,
    enabled: boolean,
  ): Promise<void> {
    const operationLog = this.beginOperation(
      `${enabled ? 'Enable' : 'Disable'} plugin`,
      provider,
      pluginId,
    )

    try {
      const adapter = this.requireAdapter(provider)
      const observedPlugin = this.findObserved(provider, pluginId)
      const request: PluginOperationRequest = { pluginId }

      if (enabled) {
        if (!observedPlugin?.installed) {
          const installResult = await adapter.install(request)
          this.ensureStepSuccess(installResult, `Install ${provider}/${pluginId}`)
          operationLog.details.push(installResult.message)
        }
        const enableResult = await adapter.enable(request)
        this.ensureStepSuccess(enableResult, `Enable ${provider}/${pluginId}`)
        operationLog.details.push(enableResult.message)
      } else {
        const disableResult = await adapter.disable(request)
        this.ensureStepSuccess(disableResult, `Disable ${provider}/${pluginId}`)
        operationLog.details.push(disableResult.message)
      }

      const healthResult = await adapter.healthCheck(request)
      operationLog.details.push(`Health check: ${healthResult.message}`)

      this.upsertDesired({
        provider,
        pluginId,
        enabled,
      })

      await this.refreshObserved()
      this.observedState.lastReconciledAt = now()
      this.recordLocalChanges(1, `${enabled ? 'Enabled' : 'Disabled'} plugin`, provider, pluginId)
      operationLog.result = 'success'
      this.endOperation(operationLog)
    } catch (error) {
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : 'Unknown operation error',
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  public async savePluginConfig(
    provider: Provider,
    pluginId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    const operationLog = this.beginOperation('Update plugin config', provider, pluginId)

    try {
      const adapter = this.requireAdapter(provider)
      const request: ConfigRequest = { pluginId, values }
      const result = await adapter.writeConfig(request)
      this.ensureStepSuccess(result, `Write config ${provider}/${pluginId}`)
      operationLog.details.push(result.message)

      this.upsertDesired({
        provider,
        pluginId,
        configValues: values,
      })

      await this.refreshObserved()
      this.recordLocalChanges(1, 'Updated plugin config', provider, pluginId)
      operationLog.result = 'success'
      this.endOperation(operationLog)
    } catch (error) {
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : 'Failed to save config',
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  public async runReconcile(dryRun: boolean): Promise<ReconcilePlanItem[]> {
    const operationLog = this.beginOperation(dryRun ? 'Dry-run reconcile' : 'Apply reconcile')

    try {
      const plan = buildReconcilePlan(this.desiredState, this.observedState, mockManifests)
      this.lastPlan = plan
      operationLog.details.push(`Generated ${plan.length} plan item(s)`)

      if (!dryRun) {
        const actionableItems = plan.filter((item) => item.action !== 'noop')
        for (const item of actionableItems) {
          await this.executePlanItem(item)
          operationLog.details.push(`Applied ${item.action} -> ${item.provider}/${item.pluginId}`)
        }
        this.observedState.lastReconciledAt = now()
        this.recordLocalChanges(actionableItems.length, 'Applied reconcile plan')
      }

      operationLog.result = 'success'
      this.endOperation(operationLog)
      return clone(plan)
    } catch (error) {
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : 'Reconcile execution failed',
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  public async gitSync(action: 'pull' | 'push'): Promise<void> {
    const operationLog = this.beginOperation(`Git ${action}`)

    try {
      if (isTauriRuntime()) {
        const repoDir = this.settings.paths.gitRepoDir
        if (action === 'pull') {
          const result = await invoke<string>('git_pull', { repoDir })
          operationLog.details.push(result || 'Pull complete')
        } else {
          const message = `AI Orchestrator sync ${now()}`
          const result = await invoke<string>('git_commit_and_push', { repoDir, message })
          operationLog.details.push(result || 'Push complete')
        }
        await this.refreshReadOnlyIntegrations()
      } else {
        await new Promise((resolve) => setTimeout(resolve, 120))
        this.syncStatus = applyGitSyncTransition(this.syncStatus, action, now())
        operationLog.details.push(
          ...(this.syncStatus.lastOperationSummary?.details ?? [`Git ${action} completed`]),
        )
      }
      operationLog.result = 'success'
      this.endOperation(operationLog)
    } catch (error) {
      this.syncStatus.health = 'error'
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : `Git ${action} failed`,
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  public async resolveGitDivergence(strategy: GitDivergenceResolution): Promise<void> {
    const operationLog = this.beginOperation(`Resolve divergence (${strategy})`)

    try {
      await new Promise((resolve) => setTimeout(resolve, 120))
      this.syncStatus = applyGitSyncTransition(this.syncStatus, strategy, now())
      operationLog.details.push(
        ...(this.syncStatus.lastOperationSummary?.details ?? ['Resolve divergence completed']),
      )
      operationLog.result = 'success'
      this.endOperation(operationLog)
    } catch (error) {
      this.syncStatus.health = 'error'
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : 'Resolve divergence failed',
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  public async runCcSwitchLifecycleAction(
    pluginId: string,
    action: CcSwitchLifecycleAction,
  ): Promise<void> {
    const operationLog = this.beginOperation(`cc-switch ${action}`, 'cc-switch', pluginId)

    try {
      await new Promise((resolve) => setTimeout(resolve, 120))
      const result = this.getCcSwitchAdapter().runLifecycleAction(pluginId, action)
      this.ensureStepSuccess(result, `cc-switch ${action} ${pluginId}`)
      operationLog.details.push(result.message)

      await this.refreshObserved()
      this.recordLocalChanges(1, `cc-switch ${action}`, 'cc-switch', pluginId)
      operationLog.result = 'success'
      this.endOperation(operationLog)
    } catch (error) {
      operationLog.result = 'failed'
      operationLog.details.push(
        error instanceof Error ? error.message : `cc-switch ${action} failed`,
      )
      this.endOperation(operationLog)
      throw error
    }
  }

  private recordLocalChanges(
    changeCount: number,
    summary = 'Updated orchestrator state',
    provider = 'orchestrator',
    pluginId = 'workspace',
  ): void {
    if (changeCount <= 0) {
      return
    }
    const timestamp = now()
    this.syncStatus.ahead += changeCount
    this.syncStatus.localChanges = [
      createLocalChangePreview(summary, provider, pluginId, timestamp),
      ...this.syncStatus.localChanges,
    ]
    this.recomputeSyncHealth()
  }

  private recomputeSyncHealth(): void {
    const isDiverged = this.syncStatus.ahead > 0 && this.syncStatus.behind > 0
    const isBlocked = this.syncStatus.ahead === 0 && this.syncStatus.behind > 0

    if (isDiverged) {
      this.syncStatus.conflictState = 'diverged'
      this.syncStatus.health = 'warn'
      return
    }

    if (isBlocked) {
      this.syncStatus.conflictState = 'blocked'
      this.syncStatus.health = 'warn'
      return
    }

    this.syncStatus.conflictState = 'clean'
    this.syncStatus.health = 'ok'
  }

  private beginOperation(
    title: string,
    provider?: Provider,
    pluginId?: string,
  ): OperationLog {
    return {
      operationId: randomId(),
      title,
      timestamp: now(),
      provider,
      pluginId,
      result: 'running',
      details: [],
    }
  }

  private endOperation(operationLog: OperationLog): void {
    operationLog.completedAt = now()
    this.operations = [operationLog, ...this.operations].slice(0, 50)
  }

  private async executePlanItem(planItem: ReconcilePlanItem): Promise<void> {
    const adapter = this.requireAdapter(planItem.provider)
    const request: PluginOperationRequest = { pluginId: planItem.pluginId }

    switch (planItem.action as ReconcileAction) {
      case 'install':
        this.ensureStepSuccess(
          await adapter.install(request),
          `Install ${planItem.provider}/${planItem.pluginId}`,
        )
        this.ensureStepSuccess(
          await adapter.enable(request),
          `Enable ${planItem.provider}/${planItem.pluginId}`,
        )
        break
      case 'upgrade':
        this.ensureStepSuccess(
          await adapter.upgrade(request),
          `Upgrade ${planItem.provider}/${planItem.pluginId}`,
        )
        break
      case 'enable':
        this.ensureStepSuccess(
          await adapter.enable(request),
          `Enable ${planItem.provider}/${planItem.pluginId}`,
        )
        break
      case 'disable':
        this.ensureStepSuccess(
          await adapter.disable(request),
          `Disable ${planItem.provider}/${planItem.pluginId}`,
        )
        break
      case 'noop':
        break
      default:
        throw new Error(`Unsupported action: ${planItem.action}`)
    }
  }

  private findObserved(provider: Provider, pluginId: string) {
    return this.observedState.plugins.find(
      (plugin) => plugin.provider === provider && plugin.pluginId === pluginId,
    )
  }

  private upsertDesired(
    partialState: Pick<DesiredPluginState, 'provider' | 'pluginId'> &
      Partial<Omit<DesiredPluginState, 'provider' | 'pluginId'>>,
  ): void {
    const targetPlugin = this.desiredState.plugins.find(
      (plugin) =>
        plugin.provider === partialState.provider && plugin.pluginId === partialState.pluginId,
    )

    if (targetPlugin) {
      Object.assign(targetPlugin, partialState)
    } else {
      this.desiredState.plugins.push({
        provider: partialState.provider,
        pluginId: partialState.pluginId,
        enabled: partialState.enabled ?? false,
        versionPolicy: partialState.versionPolicy ?? 'latest',
        configValues: partialState.configValues ?? {},
      })
    }

    this.persistDesiredState()
  }

  private persistDesiredState(): void {
    if (!isTauriRuntime()) {
      return
    }
    const state = this.desiredState
    invoke('orchestrator_write_state', {
      configDir: mockSettings.paths.claudeConfigDir,
      state,
    }).catch(() => {})
    invoke('git_write_desired_state', {
      repoDir: this.settings.paths.gitRepoDir,
      state,
    }).catch(() => {})
  }

  private requireAdapter(provider: Provider): ProviderAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new Error(`Adapter not found: ${provider}`)
    }
    return adapter
  }

  private getCcSwitchAdapter(): CcSwitchProviderAdapter {
    const adapter = this.requireAdapter('cc-switch')
    if (!(adapter instanceof CcSwitchProviderAdapter)) {
      throw new Error('cc-switch adapter has unexpected implementation')
    }
    return adapter
  }

  private ensureStepSuccess(stepResult: StepResult, fallbackMessage: string): void {
    if (!stepResult.success) {
      throw new Error(stepResult.message || `${fallbackMessage} failed`)
    }
  }
}
