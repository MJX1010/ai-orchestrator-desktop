import type {
  AppSettings,
  CcSwitchLifecycleState,
  ConfigOwnershipEntry,
  DesiredState,
  GitSyncStatus,
  McpServerEntry,
  PluginManifest,
  Provider,
  RegistryPlugin,
  SkillEntry,
} from './types'

const providerConfigPath: Record<Provider, string> = {
  codex: 'D:/Projects/.codex',
  claude: 'C:/Users/Admin/.claude',
  'cc-switch': 'C:/Users/Admin/.cc-switch',
  hermes: 'C:/Users/Admin/AppData/Local/hermes',
}

export const mockManifests: PluginManifest[] = [
  // ── Codex Plugins ──────────────────────────────────────────────
  {
    pluginId: 'superpowers',
    provider: 'codex',
    displayName: 'Codex Superpowers',
    externalId: 'superpowers',
    source: 'local',
    defaultVersion: '5.0.7',
    configSchemaRef: 'schemas/superpowers.schema.json',
    configPath: `${providerConfigPath.codex}/skills/manage-superpowers-whitelist`,
    category: 'plugin',
    description:
      'Agentic skills framework providing TDD, debugging, and collaboration workflows for AI coding agents.',
    repoUrl: 'https://github.com/obra/superpowers',
    installCommand: 'npx @complexthings/superpowers-agent',
    stars: 225508,
  },
  {
    pluginId: 'browser',
    provider: 'codex',
    displayName: 'Browser (Bundled)',
    externalId: 'browser@openai-bundled',
    source: 'local',
    defaultVersion: 'bundled',
    configSchemaRef: 'schemas/browser.schema.json',
    configPath: `${providerConfigPath.codex}/browser`,
    category: 'bundled',
    description:
      'Browser view capability bundled within the OpenAI Codex CLI runtime. Provides web browsing/rendering within the agent environment.',
    repoUrl: 'https://github.com/openai/codex',
  },
  {
    pluginId: 'node_repl',
    provider: 'codex',
    displayName: 'Node REPL (Bundled)',
    externalId: 'node_repl',
    source: 'local',
    defaultVersion: 'bundled',
    configSchemaRef: 'schemas/node-repl.schema.json',
    configPath: `${providerConfigPath.codex}/node_repl`,
    category: 'bundled',
    description:
      'Sandboxed Node.js REPL integration bundled with the Codex runtime. Provides code evaluation as an MCP tool.',
    repoUrl: 'https://github.com/openai/codex',
  },

  // ── Claude Plugins ─────────────────────────────────────────────
  {
    pluginId: 'superpowers',
    provider: 'claude',
    displayName: 'Claude Superpowers',
    externalId: 'superpowers@claude-plugins-official',
    source: 'registry',
    defaultVersion: '5.0.7',
    configSchemaRef: 'schemas/claude-superpowers.schema.json',
    configPath: `${providerConfigPath.claude}/plugins/superpowers`,
    category: 'plugin',
    description:
      'Agentic skills framework providing TDD, debugging, and collaboration workflows for AI coding agents.',
    repoUrl: 'https://github.com/obra/superpowers',
    installCommand: 'npx @complexthings/superpowers-agent',
    stars: 225508,
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
    category: 'plugin',
    description:
      'Persistent, unified memory layer for all your AI agents, backed by Markdown and Milvus. Semantic memory search across sessions.',
    repoUrl: 'https://github.com/zilliztech/memsearch',
    installCommand: 'npx memsearch-cli',
    stars: 1963,
  },
  {
    pluginId: 'claude-mem',
    provider: 'claude',
    displayName: 'Claude Mem',
    externalId: 'claude-mem@thedotmack',
    source: 'registry',
    defaultVersion: '13.5.6',
    configSchemaRef: 'schemas/claude-mem.schema.json',
    configPath: `${providerConfigPath.claude}/plugins/claude-mem`,
    category: 'plugin',
    description:
      'Memory compression system for Claude Code — persist context across sessions. Works with Claude Code, Codex, Gemini, Hermes, Copilot, OpenCode.',
    repoUrl: 'https://github.com/thedotmack/claude-mem',
    installCommand: 'npm i -g claude-mem',
    stars: 81909,
  },

  // ── cc-switch ──────────────────────────────────────────────────
  {
    pluginId: 'switch-core',
    provider: 'cc-switch',
    displayName: 'CC Switch Core',
    externalId: 'switch-core',
    source: 'git',
    defaultVersion: '1.4.0',
    configSchemaRef: 'schemas/cc-switch-core.schema.json',
    configPath: `${providerConfigPath['cc-switch']}/settings.json#aiOrchestrator`,
    category: 'plugin',
    description:
      'Core integration for cc-switch provider management. Handles plugin state injection and statusLine configuration.',
  },

  // ── Hermes MCP Servers ─────────────────────────────────────────
  {
    pluginId: 'codegraph',
    provider: 'hermes',
    displayName: 'CodeGraph',
    externalId: 'codegraph',
    source: 'registry',
    defaultVersion: '0.9.9',
    configSchemaRef: 'schemas/codegraph.schema.json',
    configPath: `${providerConfigPath.hermes}/config.yaml#mcp_servers.codegraph`,
    category: 'mcp',
    description:
      'Pre-indexed code knowledge graph for Claude Code, Codex, Gemini, Cursor, and more. Fewer tokens, fewer tool calls, 100% local.',
    repoUrl: 'https://github.com/colbymchenry/codegraph',
    installCommand: 'npx @colbymchenry/codegraph',
    stars: 47939,
  },
  {
    pluginId: 'agentmemory',
    provider: 'hermes',
    displayName: 'Agent Memory',
    externalId: 'agentmemory',
    source: 'registry',
    defaultVersion: '0.9.27',
    configSchemaRef: 'schemas/agentmemory.schema.json',
    configPath: `${providerConfigPath.hermes}/config.yaml#mcp_servers.agentmemory`,
    category: 'mcp',
    description:
      '#1 Persistent memory for AI coding agents based on real-world benchmarks. Powered by iii-engine.',
    repoUrl: 'https://github.com/rohitg00/agentmemory',
    installCommand: 'npx @agentmemory/mcp',
    stars: 22469,
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
    hermesConfigDir: 'C:/Users/Admin/AppData/Local/hermes',
    hermesSkillsDir: 'C:/Users/Admin/AppData/Local/hermes/skills',
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

// ── MCP Server Entries (unified across apps) ───────────────────

export const mockMcpServers: McpServerEntry[] = [
  {
    id: 'mcp-codegraph',
    name: 'codegraph',
    command: 'codegraph',
    args: ['serve', '--mcp'],
    description:
      'Pre-indexed code knowledge graph. Fewer tokens, fewer tool calls, 100% local.',
    repoUrl: 'https://github.com/colbymchenry/codegraph',
    installCommand: 'npx @colbymchenry/codegraph',
    enabledClaude: false,
    enabledCodex: false,
    enabledHermes: true,
    source: 'registry',
    lastSyncAt: '2026-06-12T10:00:00Z',
  },
  {
    id: 'mcp-agentmemory',
    name: 'agentmemory',
    command: 'npx',
    args: ['@agentmemory/mcp'],
    description: '#1 Persistent memory for AI coding agents based on real-world benchmarks.',
    repoUrl: 'https://github.com/rohitg00/agentmemory',
    installCommand: 'npx @agentmemory/mcp',
    enabledClaude: false,
    enabledCodex: false,
    enabledHermes: true,
    source: 'registry',
    lastSyncAt: '2026-06-12T10:00:00Z',
  },
  {
    id: 'mcp-node-repl',
    name: 'node_repl',
    command: 'C:\\Users\\Admin\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\789504f803e82e2b\\bin\\node_repl.exe',
    args: [],
    description: 'Sandboxed Node.js REPL bundled with Codex runtime.',
    enabledClaude: false,
    enabledCodex: true,
    enabledHermes: false,
    source: 'local',
  },
]

// ── Skills (SSOT entries) ──────────────────────────────────────

export const mockSkills: SkillEntry[] = [
  {
    id: 'skill-superpowers',
    name: 'superpowers',
    description: 'Agentic skills framework: TDD, debugging, collaboration workflows.',
    sourceRepo: 'obra/superpowers',
    sourcePath: 'skills/',
    version: '5.0.7',
    contentHash: 'sha256:a1b2c3d4e5f6',
    installedAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    enabledClaude: true,
    enabledCodex: true,
    enabledHermes: false,
    syncMethod: 'symlink',
  },
  {
    id: 'skill-brainstorming',
    name: 'brainstorming',
    description: 'Structured brainstorming and idea generation skill.',
    sourceRepo: 'obra/superpowers',
    sourcePath: 'skills/brainstorming',
    version: '5.0.7',
    contentHash: 'sha256:b2c3d4e5f6a1',
    installedAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    enabledClaude: true,
    enabledCodex: true,
    enabledHermes: false,
    syncMethod: 'symlink',
  },
]

// ── Skill Repos ────────────────────────────────────────────────

export const mockSkillRepos = [
  {
    owner: 'obra',
    name: 'superpowers',
    branch: 'main',
    url: 'https://github.com/obra/superpowers',
    lastScannedAt: '2026-06-10T00:00:00Z',
  },
  {
    owner: 'ComposioHQ',
    name: 'awesome-claude-skills',
    branch: 'main',
    url: 'https://github.com/ComposioHQ/awesome-claude-skills',
    lastScannedAt: '2026-06-10T00:00:00Z',
  },
]

// ── Plugin Registry (marketplace catalog) ──────────────────────

export const mockRegistryPlugins: RegistryPlugin[] = [
  {
    id: 'reg-codegraph',
    name: 'CodeGraph',
    description:
      'Pre-indexed code knowledge graph for Claude Code, Codex, Gemini, Cursor, and more.',
    version: '0.9.9',
    author: 'colbymchenry',
    category: 'mcp',
    tags: ['code-analysis', 'knowledge-graph', 'local'],
    homepage: 'https://github.com/colbymchenry/codegraph',
    repoUrl: 'https://github.com/colbymchenry/codegraph',
    installCommand: 'npx @colbymchenry/codegraph',
    sha256: 'sha256:abc123...',
    stars: 47939,
    downloads: 125000,
    compatibleApps: ['claude', 'codex', 'hermes'],
    installed: true,
    installedVersion: '0.9.9',
    updateAvailable: false,
  },
  {
    id: 'reg-agentmemory',
    name: 'Agent Memory',
    description: '#1 Persistent memory for AI coding agents based on real-world benchmarks.',
    version: '0.9.27',
    author: 'rohitg00',
    category: 'mcp',
    tags: ['memory', 'persistence', 'context'],
    homepage: 'https://github.com/rohitg00/agentmemory',
    repoUrl: 'https://github.com/rohitg00/agentmemory',
    installCommand: 'npx @agentmemory/mcp',
    sha256: 'sha256:def456...',
    stars: 22469,
    downloads: 89000,
    compatibleApps: ['claude', 'codex', 'hermes'],
    installed: true,
    installedVersion: '0.9.27',
    updateAvailable: false,
  },
  {
    id: 'reg-claude-mem',
    name: 'Claude Mem',
    description:
      'Memory compression system for Claude Code — persist context across sessions.',
    version: '13.5.6',
    author: 'thedotmack',
    category: 'plugin',
    tags: ['memory', 'compression', 'context'],
    homepage: 'https://github.com/thedotmack/claude-mem',
    repoUrl: 'https://github.com/thedotmack/claude-mem',
    installCommand: 'npm i -g claude-mem',
    sha256: 'sha256:ghi789...',
    stars: 81909,
    downloads: 312000,
    compatibleApps: ['claude', 'codex', 'hermes'],
    installed: true,
    installedVersion: '13.5.6',
    updateAvailable: false,
  },
  {
    id: 'reg-memsearch',
    name: 'MemSearch',
    description:
      'Persistent, unified memory layer for all your AI agents, backed by Markdown and Milvus.',
    version: '1.4.1',
    author: 'zilliztech',
    category: 'plugin',
    tags: ['memory', 'search', 'vector-db'],
    homepage: 'https://github.com/zilliztech/memsearch',
    repoUrl: 'https://github.com/zilliztech/memsearch',
    installCommand: 'npx memsearch-cli',
    sha256: 'sha256:jkl012...',
    stars: 1963,
    downloads: 15000,
    compatibleApps: ['claude', 'codex'],
    installed: true,
    installedVersion: '1.4.1',
    updateAvailable: false,
  },
  {
    id: 'reg-superpowers',
    name: 'Superpowers',
    description:
      'An agentic skills framework & software development methodology that works.',
    version: '5.0.7',
    author: 'obra',
    category: 'plugin',
    tags: ['skills', 'tdd', 'workflow'],
    homepage: 'https://github.com/obra/superpowers',
    repoUrl: 'https://github.com/obra/superpowers',
    installCommand: 'npx @complexthings/superpowers-agent',
    sha256: 'sha256:mno345...',
    stars: 225508,
    downloads: 540000,
    compatibleApps: ['claude', 'codex'],
    installed: true,
    installedVersion: '5.0.7',
    updateAvailable: false,
  },
  {
    id: 'reg-context7',
    name: 'Context7',
    description: 'Up-to-date code documentation for LLMs. Fetch docs for any library on demand.',
    version: '1.0.0',
    author: 'upstash',
    category: 'mcp',
    tags: ['documentation', 'context', 'on-demand'],
    homepage: 'https://github.com/upstash/context7',
    repoUrl: 'https://github.com/upstash/context7',
    installCommand: 'npx -y @upstash/context7-mcp@latest',
    stars: 12800,
    downloads: 67000,
    compatibleApps: ['claude', 'codex', 'hermes'],
    installed: false,
    updateAvailable: false,
  },
  {
    id: 'reg-playwright',
    name: 'Playwright MCP',
    description: 'Browser automation MCP server using Playwright for web testing and scraping.',
    version: '0.1.0',
    author: 'microsoft',
    category: 'mcp',
    tags: ['browser', 'testing', 'automation'],
    homepage: 'https://github.com/microsoft/playwright-mcp',
    repoUrl: 'https://github.com/microsoft/playwright-mcp',
    installCommand: 'npx @anthropic-ai/playwright-mcp@latest',
    stars: 8500,
    downloads: 45000,
    compatibleApps: ['claude', 'codex'],
    installed: false,
    updateAvailable: false,
  },
]

// ── Config Ownership (multi-tool conflict prevention) ──────────

export const mockConfigOwnership: ConfigOwnershipEntry[] = [
  {
    configPath: 'C:/Users/Admin/.claude/settings.json',
    lastWriter: 'cc-switch',
    lastWrittenAt: '2026-06-12T09:30:00Z',
    fingerprint: 'sha256:x1y2z3...',
  },
  {
    configPath: 'C:/Users/Admin/.codex/config.toml',
    lastWriter: 'codex-cli',
    lastWrittenAt: '2026-06-12T08:15:00Z',
    fingerprint: 'sha256:a4b5c6...',
  },
  {
    configPath: 'C:/Users/Admin/AppData/Local/hermes/config.yaml',
    lastWriter: 'hermes-cli',
    lastWrittenAt: '2026-06-11T22:00:00Z',
    fingerprint: 'sha256:d7e8f9...',
  },
]
