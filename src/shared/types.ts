export const providers = ['codex', 'claude', 'cc-switch'] as const

export type Provider = (typeof providers)[number]

export type PluginHealth = 'ok' | 'warn' | 'error'

export type VersionPolicy = 'latest' | 'pinned' | 'range'

export type ReconcileAction = 'install' | 'upgrade' | 'enable' | 'disable' | 'noop'

export type OperationResult = 'running' | 'success' | 'failed'

export interface PluginManifest {
  pluginId: string
  provider: Provider
  displayName: string
  externalId?: string
  source: 'registry' | 'git' | 'local'
  defaultVersion: string
  configSchemaRef: string
  configPath: string
}

export interface DesiredPluginState {
  pluginId: string
  provider: Provider
  versionPolicy: VersionPolicy
  enabled: boolean
  configValues: Record<string, unknown>
}

export interface DesiredState {
  profileName: string
  plugins: DesiredPluginState[]
}

export interface ObservedPluginState {
  pluginId: string
  provider: Provider
  installed: boolean
  installedVersion: string | null
  enabled: boolean
  health: PluginHealth
  lastError?: string
}

export interface ObservedState {
  plugins: ObservedPluginState[]
  lastReconciledAt?: string
}

export interface ReconcilePlanItem {
  provider: Provider
  pluginId: string
  action: ReconcileAction
  reason: string
}

export interface OperationLog {
  operationId: string
  title: string
  timestamp: string
  completedAt?: string
  provider?: Provider
  pluginId?: string
  result: OperationResult
  details: string[]
}

export interface ProviderPathConfig {
  codexScriptsDir: string
  claudeConfigDir: string
  ccSwitchConfigDir: string
  ccSwitchDatabasePath: string
  gitRepoUrl: string
  gitRepoDir: string
  gitBranch: string
}

export interface ExecutionSettings {
  runMode: 'serial' | 'parallel'
  timeoutSeconds: number
  autoRetry: boolean
  requireConfirmForDestructive: boolean
}

export interface AppSettings {
  paths: ProviderPathConfig
  execution: ExecutionSettings
}

export type GitDivergenceResolution = 'keep-local' | 'accept-remote'

export interface GitChangePreview {
  id: string
  path: string
  summary: string
  timestamp: string
}

export interface GitReadOnlyStatus {
  available: boolean
  repoPath: string
  branch?: string
  remote?: string
  ahead: number
  behind: number
  localChanges: GitChangePreview[]
  remoteChanges: GitChangePreview[]
  lastReadAt?: string
  error?: string
}

export interface GitSyncOperationSummary {
  title: string
  result: 'success' | 'failed' | 'blocked' | 'noop'
  details: string[]
  timestamp: string
}

export interface GitSyncStatus {
  repositoryUrl: string
  branch: string
  ahead: number
  behind: number
  health: PluginHealth
  conflictState: 'clean' | 'blocked' | 'diverged'
  localChanges: GitChangePreview[]
  remoteChanges: GitChangePreview[]
  lastSyncAt?: string
  lastAction?: 'pull' | 'push' | 'resolve-keep-local' | 'resolve-remote'
  lastOperationSummary?: GitSyncOperationSummary
}

export type CcSwitchLifecycleStatus =
  | 'available'
  | 'installed'
  | 'update-available'
  | 'missing-settings'

export type CcSwitchLifecycleAction =
  | 'install'
  | 'uninstall'
  | 'upgrade'
  | 'enable'
  | 'disable'

export interface CcSwitchLifecycleState {
  provider: 'cc-switch'
  pluginId: string
  displayName: string
  sqlitePath: string
  installed: boolean
  enabled: boolean
  currentVersion: string | null
  latestVersion: string
  status: CcSwitchLifecycleStatus
  realReadAvailable?: boolean
  realDbPath?: string
  realSkillsCount?: number
  realEnabledClaudeCount?: number
  realEnabledCodexCount?: number
  realLatestSkillUpdatedAt?: number
  realSampleSkills?: CcSwitchSqliteSkill[]
  realReadError?: string
  lastAction?: CcSwitchLifecycleAction
  lastActionAt?: string
  lastMessage?: string
}

export interface CcSwitchSqliteSkill {
  id: string
  name: string
  directory: string
  enabledClaude: boolean
  enabledCodex: boolean
  installedAt: number
  updatedAt: number
}

export interface CcSwitchSqliteSnapshot {
  available: boolean
  dbPath: string
  skillsCount: number
  enabledClaudeCount: number
  enabledCodexCount: number
  latestSkillUpdatedAt?: number
  sampleSkills: CcSwitchSqliteSkill[]
  error?: string
}

export interface AppSnapshot {
  manifests: PluginManifest[]
  profiles: string[]
  desiredState: DesiredState
  observedState: ObservedState
  operations: OperationLog[]
  lastPlan: ReconcilePlanItem[]
  syncStatus: GitSyncStatus
  gitReadOnlyStatus: GitReadOnlyStatus
  ccSwitchLifecycle: CcSwitchLifecycleState[]
  settings: AppSettings
}
