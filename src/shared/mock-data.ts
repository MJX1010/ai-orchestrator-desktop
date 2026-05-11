import type {
  AppSettings,
  CcSwitchLifecycleState,
  DesiredState,
  GitSyncStatus,
  PluginManifest,
  Provider,
} from './types'

const providerConfigPath: Record<Provider, string> = {
  codex: 'D:/Projects/.codex',
  claude: 'C:/Users/Admin/.claude',
  'cc-switch': 'C:/Users/Admin/.cc-switch',
}

export const mockManifests: PluginManifest[] = [
  {
    pluginId: 'superpowers',
    provider: 'codex',
    displayName: 'Codex Superpowers',
    externalId: 'superpowers',
    source: 'local',
    defaultVersion: '5.0.7',
    configSchemaRef: 'schemas/superpowers.schema.json',
    configPath: `${providerConfigPath.codex}/skills/manage-superpowers-whitelist`,
  },
  {
    pluginId: 'superpowers',
    provider: 'claude',
    displayName: 'Claude Superpowers',
    externalId: 'superpowers@claude-plugins-official',
    source: 'registry',
    defaultVersion: '5.0.7',
    configSchemaRef: 'schemas/claude-superpowers.schema.json',
    configPath: `${providerConfigPath.claude}/plugins/superpowers`,
  },
  {
    pluginId: 'memsearch',
    provider: 'claude',
    displayName: 'MemSearch',
    externalId: 'memsearch@memsearch-plugins',
    source: 'registry',
    defaultVersion: '0.1.16',
    configSchemaRef: 'schemas/memsearch.schema.json',
    configPath: `${providerConfigPath.claude}/plugins/memsearch`,
  },
  {
    pluginId: 'claude-mem',
    provider: 'claude',
    displayName: 'Claude Mem',
    externalId: 'claude-mem@thedotmack',
    source: 'registry',
    defaultVersion: '10.5.2',
    configSchemaRef: 'schemas/claude-mem.schema.json',
    configPath: `${providerConfigPath.claude}/plugins/claude-mem`,
  },
  {
    pluginId: 'switch-core',
    provider: 'cc-switch',
    displayName: 'CC Switch Core',
    externalId: 'switch-core',
    source: 'git',
    defaultVersion: '1.4.0',
    configSchemaRef: 'schemas/cc-switch-core.schema.json',
    configPath: `${providerConfigPath['cc-switch']}/settings.json#aiOrchestrator`,
  },
]

export const mockProfiles = ['default', 'office', 'travel']

export const mockDesiredState: DesiredState = {
  profileName: 'default',
  plugins: [
    {
      provider: 'codex',
      pluginId: 'superpowers',
      versionPolicy: 'latest',
      enabled: true,
      configValues: {
        whitelist: ['brainstorming'],
      },
    },
    {
      provider: 'claude',
      pluginId: 'superpowers',
      versionPolicy: 'latest',
      enabled: true,
      configValues: {
        mode: 'default',
      },
    },
    {
      provider: 'claude',
      pluginId: 'memsearch',
      versionPolicy: 'latest',
      enabled: true,
      configValues: {
        maxResults: 25,
      },
    },
    {
      provider: 'claude',
      pluginId: 'claude-mem',
      versionPolicy: 'latest',
      enabled: true,
      configValues: {
        timeline: true,
      },
    },
    {
      provider: 'cc-switch',
      pluginId: 'switch-core',
      versionPolicy: 'latest',
      enabled: true,
      configValues: {
        fallbackProvider: 'codex',
      },
    },
  ],
}

export const mockSettings: AppSettings = {
  paths: {
    codexScriptsDir: 'D:/Projects/.codex/scripts',
    claudeConfigDir: 'C:/Users/Admin/.claude',
    ccSwitchConfigDir: 'C:/Users/Admin/.cc-switch',
    ccSwitchDatabasePath: 'C:/Users/Admin/.cc-switch/cc-switch.db',
    gitRepoUrl: 'https://github.com/MJX1010/AI_Plugins',
    gitRepoDir: 'D:/Projects/AI_Plugins',
    gitBranch: 'main',
  },
  execution: {
    runMode: 'serial',
    timeoutSeconds: 60,
    autoRetry: true,
    requireConfirmForDestructive: true,
  },
}

export const mockSyncStatus: GitSyncStatus = {
  repositoryUrl: 'https://github.com/MJX1010/AI_Plugins',
  branch: 'main',
  ahead: 1,
  behind: 2,
  health: 'warn',
  conflictState: 'diverged',
  localChanges: [
    {
      id: 'local-seed-default-profile',
      path: 'profiles/default.json',
      summary: 'Enabled Codex Superpowers in the default profile',
      timestamp: '2026-04-27T09:30:00.000Z',
    },
  ],
  remoteChanges: [
    {
      id: 'remote-seed-claude-mem',
      path: 'plugins/claude-mem.json',
      summary: 'Updated Claude Mem default version metadata',
      timestamp: '2026-04-27T10:10:00.000Z',
    },
    {
      id: 'remote-seed-memsearch',
      path: 'plugins/memsearch.json',
      summary: 'Adjusted MemSearch default max result policy',
      timestamp: '2026-04-27T10:20:00.000Z',
    },
  ],
  lastOperationSummary: {
    title: 'Mock divergence loaded',
    result: 'blocked',
    details: [
      'Local profile edits and remote plugin metadata both changed.',
      'Choose a resolution strategy before pushing.',
    ],
    timestamp: '2026-04-27T10:25:00.000Z',
  },
}

export const mockCcSwitchLifecycle: CcSwitchLifecycleState[] = [
  {
    provider: 'cc-switch',
    pluginId: 'switch-core',
    displayName: 'CC Switch Core',
    sqlitePath: 'C:/Users/Admin/.cc-switch/plugins.db',
    installed: true,
    enabled: true,
    currentVersion: '1.4.0',
    latestVersion: '1.5.0',
    status: 'update-available',
    lastMessage: 'Mock SQLite lifecycle discovered an available update.',
  },
]
