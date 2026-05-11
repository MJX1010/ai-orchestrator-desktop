# AI Orchestrator Desktop · 使用与维护说明书

> 版本：0.1.1（Windows V1）
> 最后更新：2026-04-29
> 适用：本仓库的 Tauri 2 + React 19 + TypeScript 桌面应用

本应用是一个**多 Provider 插件编排控制台**，用统一界面管理三个上游 AI 工具的插件态：`Codex CLI`、`Claude Code CLI`、`cc-switch`。

---

## 目录

1. [快速开始](#1-快速开始)
2. [一图看架构](#2-一图看架构)
3. [项目结构](#3-项目结构)
4. [五个页面功能](#4-五个页面功能)
5. [核心数据模型](#5-核心数据模型)
6. [Tauri 后端命令（11 个）](#6-tauri-后端命令11-个)
7. [前端适配器层](#7-前端适配器层)
8. [业务流程时序](#8-业务流程时序)
9. [路径与配置](#9-路径与配置)
10. [测试](#10-测试)
11. [已知限制与下一步迭代](#11-已知限制与下一步迭代)
12. [故障排查 FAQ](#12-故障排查-faq)

---

## 1. 快速开始

### 环境依赖

| 依赖 | 用途 | 校验命令 |
|---|---|---|
| Node.js ≥ 20 | 前端 / Vite / Tauri CLI | `node -v` |
| npm ≥ 10 | 包管理 | `npm -v` |
| Rust ≥ 1.77.2 | Tauri 后端编译 | `cargo --version` |
| WebView2 Runtime | Win 桌面渲染 | Win11 自带；老 Win10 需安装 [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) |

### 三种运行方式

```bash
# 1. 仅前端（浏览器调试，所有真实 Tauri 命令降级为 Mock）
npm install
npm run dev               # 默认监听 5173

# 2. 完整桌面 dev（拉起 Vite + Rust + Tauri 窗口，文件热更新）
npm run tauri dev

# 3. 构建 release 安装包
npm run tauri build       # 完整产物：app.exe + .msi + setup.exe
npm run tauri build -- --no-bundle    # 只产 app.exe
```

### Release 产物位置

| 产物 | 路径 |
|---|---|
| 独立 exe | `src-tauri/target/release/app.exe` |
| MSI | `src-tauri/target/release/bundle/msi/AI Orchestrator Desktop_<ver>_x64_en-US.msi` |
| NSIS | `src-tauri/target/release/bundle/nsis/AI Orchestrator Desktop_<ver>_x64-setup.exe` |

---

## 2. 一图看架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                       React 19 UI（src/）                              │
│                                                                        │
│  App.tsx ── useOrchestrator()                                          │
│      │                                                                 │
│      ├─ Dashboard / Plugins / Profiles / Sync / Settings 五个页面       │
│      │                                                                 │
│      └─ MockOrchestrator（核心状态机，src/core/orchestrator.ts）        │
│            ├─ ProviderAdapter[]                                        │
│            │     ├─ CodexProviderAdapter      ← invoke('codex_*')      │
│            │     ├─ ClaudeProviderAdapter     ← invoke('claude_*')     │
│            │     └─ CcSwitchProviderAdapter   ← invoke('ccswitch_*')   │
│            └─ ReadOnly Bridge ← invoke('git_read_status' / sqlite)     │
│                                                                        │
│            （非 Tauri runtime → 全部 fallback 到内存 Mock 数据）         │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  @tauri-apps/api/core invoke
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Rust 后端（src-tauri/src/lib.rs）                     │
│                                                                        │
│  11 个 #[tauri::command]：                                              │
│    Codex   ── 调用 manage-superpowers.ps1                              │
│    Claude  ── 读写 ~/.claude/plugins/installed_plugins.json + settings  │
│    cc-switch ── 读写 settings.json + 只读 plugins.db (sqlite)           │
│    Git     ── 调用系统 git 二进制读 status / log（只读）                  │
└──────────────────────────────────────────────────────────────────────┘
```

**关键设计**

- **统一三态模型**：`DesiredState`（用户想要）/ `ObservedState`（外部系统真实情况）/ `ReconcilePlan`（前者推后者的步骤），跟 Kubernetes Operator 思路同构。
- **写操作经 adapter，读 Git/SQLite 走 read-only bridge**：写真实生效（修改 PowerShell 白名单 / JSON 配置），读 Git 只读（解析 `git status` / `git log`）。
- **Mock 优先 + Tauri 增强**：Web 模式所有 adapter 用纯内存 Mock，桌面模式自动切换到真实命令；任一命令失败会回落到 Mock 路径，不阻塞 UI。

---

## 3. 项目结构

```
ai-orchestrator-desktop/
├── src/                                    # React 前端
│   ├── App.tsx                             # 主壳：sidebar + topbar + 5 页路由（useState 切换）
│   ├── main.tsx                            # createRoot 入口
│   ├── App.css / index.css                 # 全部样式
│   │
│   ├── shared/
│   │   ├── types.ts                        # 全部 TS 类型定义（领域模型 + DTO）
│   │   ├── mock-data.ts                    # 默认 Manifest / Profile / Settings / SyncStatus 等种子
│   │   ├── git-sync.ts                     # 纯函数：applyGitSyncTransition（pull/push/keep-local/accept-remote）
│   │   ├── git-sync.test.ts                # node --test
│   │   ├── ccswitch-lifecycle.ts           # 纯函数：deriveLifecycleStatus + applyLifecycleAction
│   │   ├── ccswitch-lifecycle.test.ts
│   │   ├── real-integrations.ts            # 实战集成 helper（GitStatus 默认值、SQLite 状态归一化）
│   │   └── real-integrations.test.ts
│   │
│   ├── core/
│   │   ├── orchestrator.ts                 # MockOrchestrator 类（状态机 + operation log）
│   │   └── planner.ts                      # buildReconcilePlan(desired, observed, manifests)
│   │
│   ├── adapters/
│   │   ├── provider-adapter.ts             # ProviderAdapter 接口（9 个方法）
│   │   ├── create-provider-adapters.ts     # 工厂：根据 manifest 拆分到 3 个 adapter
│   │   ├── codex-provider-adapter.ts       # 真实：管控 manage-superpowers.ps1 白名单
│   │   ├── claude-provider-adapter.ts      # 真实：读写 installed_plugins.json + settings.json
│   │   ├── ccswitch-provider-adapter.ts    # 真实：读写 .cc-switch/settings.json + 只读 sqlite
│   │   ├── mock-provider-adapter.ts        # 通用 Mock fallback
│   │   └── read-only-runtime-adapter.ts    # 桥：调 git_read_status / ccswitch_read_lifecycle
│   │
│   └── ui/
│       ├── hooks/use-orchestrator.ts       # 唯一对外 hook：snapshot + 所有 action
│       └── pages/
│           ├── dashboard-page.tsx          # 概览
│           ├── plugins-page.tsx            # 插件列表 + 详情 + 配置编辑 + cc-switch 生命周期面板
│           ├── profiles-page.tsx           # Profile 切换 + Reconcile 计划
│           ├── sync-page.tsx               # Git Sync 引擎 + 冲突解决
│           └── settings-page.tsx           # 只读路径与执行策略展示
│
├── src-tauri/                              # Rust 后端
│   ├── Cargo.toml                          # tauri 2.10、serde、log、tauri-plugin-log
│   ├── tauri.conf.json                     # 窗口 800×600、devUrl: 5173、frontendDist: ../dist
│   ├── capabilities/                       # Tauri 2 capability 配置
│   ├── icons/                              # 32×32 ~ 256×256、.ico、.icns
│   └── src/
│       ├── main.rs                         # fn main → app_lib::run()
│       └── lib.rs                          # 11 个 command + 解析 helper（约 700 行）
│
├── docs/
│   ├── USER-GUIDE.md                       # ★ 本文件
│   └── superpowers/
│       ├── plans/                          # 历史规划文档（M1/M2 演进）
│       └── specs/                          # 设计 spec
│
├── public/                                 # Vite 静态资源（favicon 等）
├── dist/                                   # vite build 输出（被 Tauri 打包进 exe）
├── package.json                            # name: ai-orchestrator-desktop
├── vite.config.ts                          # @vitejs/plugin-react
├── tsconfig.{json,app,node}.json
├── eslint.config.js                        # flat config
├── README.md                               # 简版上手
└── index.html
```

---

## 4. 五个页面功能

> UI 路由由 `App.tsx` 中的 `activePage: useState` 驱动，没有 React Router；切换 = 重渲染对应 Page。所有页面共享顶部 `Refresh` 按钮（调 `refresh()`）和错误 banner。

### 4.1 Dashboard

**用途**：当前编排健康度的全局视图。

| 模块 | 数据来源 | 字段 |
|---|---|---|
| System Summary（4 卡片） | `observedState.plugins` 聚合 | Installed / Enabled / Errors / Pending Plan Items |
| Git Sync | `snapshot.syncStatus` | repoUrl / branch / ahead / behind / lastSync |
| Recent Operations | `snapshot.operations`（取前 6 条） | title / completedAt / 首条 details |

**操作**：无写操作，纯只读视图。

### 4.2 Plugins

**布局**：左侧 Plugin 表格 + 右侧 Plugin Config 详情面板。

**Plugin 表格**：

- Provider 过滤 chip：`all` / `codex` / `claude` / `cc-switch`
- 列：Plugin、Provider、Version、Health（badge：ok/warn/error）、Enabled、Action
- Action 按钮 `Enable` / `Disable` 直接调 `togglePluginEnabled`

**详情面板**：

- Manifest 元数据：displayName / configPath / configSchemaRef
- **cc-switch Lifecycle Panel**（仅当选中 provider=cc-switch 时显示）
  - 状态 badge：`available` / `installed` / `update-available` / `missing-settings`
  - SQLite 实读字段：realReadAvailable、realDbPath、realSkillsCount、Claude/Codex 启用计数
  - 5 个动作按钮：Install / Upgrade / Enable / Disable / Uninstall（Uninstall 有 confirm 弹窗）
- **Config 编辑器**：原始 JSON `<textarea>` 14 行
  - 校验：必须是合法 JSON object（解析失败显示 inline 错误）
  - 保存调用 `savePluginConfig`，写到对应 `configPath`

### 4.3 Profiles

**展示**：

- 当前 Profile + 可选 chip list（默认 `default` / `office` / `travel`，写死在 `mock-data.ts`）
- 上次 Reconcile 时间
- 当前 Plan 列表：`[provider] pluginId · ACTION` + reason

**操作**：

- `Dry Run Reconcile`：仅生成 plan 写入 `lastPlan`，不执行
- `Apply Reconcile`：执行 plan 中所有 `action !== 'noop'` 的项

> 当前版本 Profile 切换尚未连通（chip 仅展示）。Profile 持久化与切换是 §11 迭代项。

### 4.4 Sync

**展示**：

- 顶部 badge 三态：`Clean` / `Remote Ahead` / `Diverged`
- Real Git Read 信息条：available / repoPath / remote / lastReadAt（来自 `git_read_status` 命令）
- 4 张状态卡：Branch / Ahead / Behind / Last Sync
- 双栏变更预览：Local Preview vs Remote Preview（path / summary / timestamp）
- Last Operation 卡（success / blocked / failed / noop 配色不同）

**操作**：

- `Pull` / `Push`：调 `gitSync('pull' | 'push')`
  - Push 在 `behind > 0` 或 `ahead === 0` 时禁用
- `Keep Local` / `Accept Remote`（仅分歧或被远端阻塞时启用）
  - `Accept Remote` 有 confirm 弹窗（破坏性）
- 操作背后是 `applyGitSyncTransition` 纯函数（src/shared/git-sync.ts），覆盖了 4 种动作的所有边界条件（noop / blocked / 成功）

### 4.5 Settings

**展示**（仅展示，不可编辑）：

- 路径配置：codexScriptsDir / claudeConfigDir / ccSwitchConfigDir / ccSwitchDatabasePath / gitRepoUrl / gitRepoDir / gitBranch
- 执行策略：runMode（serial/parallel）、timeoutSeconds、autoRetry、requireConfirmForDestructive

> 默认值在 `src/shared/mock-data.ts` 的 `mockSettings`。要改路径目前需直接改源码（持久化设置见 §11）。

---

## 5. 核心数据模型

> 全部定义在 `src/shared/types.ts`。

### 5.1 三态控制平面

```ts
DesiredState {
  profileName: string
  plugins: DesiredPluginState[]   // versionPolicy / enabled / configValues
}

ObservedState {
  plugins: ObservedPluginState[]  // installed / installedVersion / enabled / health
  lastReconciledAt?: string
}

ReconcilePlanItem {
  provider, pluginId
  action: 'install' | 'upgrade' | 'enable' | 'disable' | 'noop'
  reason: string
}
```

### 5.2 操作日志

```ts
OperationLog {
  operationId: string                       // op-<8hex>
  title, timestamp, completedAt?
  provider?, pluginId?
  result: 'running' | 'success' | 'failed'
  details: string[]
}
```

> 由 Orchestrator 维护，最多保留 50 条（FIFO）。

### 5.3 Git Sync

```ts
GitSyncStatus {
  repositoryUrl, branch
  ahead, behind
  health: 'ok' | 'warn' | 'error'
  conflictState: 'clean' | 'blocked' | 'diverged'
  localChanges, remoteChanges: GitChangePreview[]
  lastSyncAt?, lastAction?, lastOperationSummary?
}

GitReadOnlyStatus {  // 来自 git_read_status 命令
  available, repoPath, branch?, remote?
  ahead, behind
  localChanges, remoteChanges
  lastReadAt?, error?
}
```

### 5.4 cc-switch Lifecycle

```ts
CcSwitchLifecycleState {
  provider: 'cc-switch', pluginId, displayName
  sqlitePath
  installed, enabled
  currentVersion, latestVersion
  status: 'available' | 'installed' | 'update-available' | 'missing-settings'
  // 来自 ccswitch_read_lifecycle 命令注入
  realReadAvailable?, realDbPath?, realSkillsCount?
  realEnabledClaudeCount?, realEnabledCodexCount?
  realLatestSkillUpdatedAt?, realSampleSkills?, realReadError?
  lastAction?, lastActionAt?, lastMessage?
}
```

### 5.5 全局快照

```ts
AppSnapshot {
  manifests, profiles, desiredState, observedState
  operations: OperationLog[]
  lastPlan: ReconcilePlanItem[]
  syncStatus: GitSyncStatus
  gitReadOnlyStatus: GitReadOnlyStatus
  ccSwitchLifecycle: CcSwitchLifecycleState[]
  settings: AppSettings
}
```

`useOrchestrator()` 返回的 `snapshot` 即此结构；UI 只渲染 snapshot，不直接访问 Orchestrator 内部状态。

---

## 6. Tauri 后端命令（11 个）

> 全部在 `src-tauri/src/lib.rs`，参数采用 camelCase（前端 invoke 传参时也是 camelCase）。

| # | 命令 | 输入 | 返回 | 用途 |
|---|---|---|---|---|
| 1 | `codex_list_superpowers` | `scriptsDir` | `Vec<SuperpowerSkill>` | 调 `manage-superpowers.ps1 -ListOnly`，列出 Codex 端 superpower skills |
| 2 | `codex_set_superpowers_enabled` | `scriptsDir, enabledSkills: string[]` | `String` | 调 PowerShell 写白名单 |
| 3 | `claude_read_runtime` | `claudeConfigDir` | `ClaudeRuntimeState` | 解析 `~/.claude/plugins/installed_plugins.json` + `settings.json` 得已装/启用/配置 |
| 4 | `claude_set_enabled_plugin` | `claudeConfigDir, pluginKey, enabled` | `String` | 写 `settings.json` 的 `enabledPlugins` |
| 5 | `claude_set_plugin_config` | `claudeConfigDir, pluginKey, config: Value` | `String` | 写 `settings.json` 的 `pluginConfigs[pluginKey]` |
| 6 | `git_read_status` | `repoDir` | `GitReadOnlyStatus` | 调 `git status --porcelain` 与 `git log @{u}..HEAD` 等 |
| 7 | `ccswitch_read_runtime` | `ccswitchConfigDir` | `CcSwitchRuntimeState` | 读 `.cc-switch/settings.json`，返回是否存在 + 内容 |
| 8 | `ccswitch_read_lifecycle` | `ccswitchConfigDir` | `CcSwitchSqliteSnapshot` | 只读 `.cc-switch/cc-switch.db`（SQLite），列出 skills 数量 + 启用计数 + 样本 |
| 9 | `ccswitch_set_enabled` | `ccswitchConfigDir, enabled: bool` | `String` | 写 `enableClaudePluginIntegration` |
| 10 | `ccswitch_set_ai_orchestrator_config` | `ccswitchConfigDir, config: Value` | `String` | 写 `aiOrchestrator` 字段 |
| 11 | `path_exists` | `path` | `bool` | 通用路径存在判断 |

**Helper 函数（lib.rs 私有）**

- `run_manage_superpowers(args, scriptsDir)`：spawn `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...`
- `run_git(repoDir, args)`：spawn 系统 `git` 二进制
- `run_sqlite_json(dbPath, query)`：spawn `sqlite3 db ".mode json" "<query>"`，反序列化为指定泛型
- `read_json_or_default` / `write_json`：JSON 文件 I/O，写时 `serde_json::to_string_pretty`
- `parse_git_local_changes` / `parse_git_remote_changes`：解析 porcelain / log 行成 `GitChangePreview`
- `parse_claude_installed_plugins` / `parse_enabled_plugins` / `parse_plugin_configs`：JSON 解析

**注册位置**：`pub fn run()` 末尾的 `.invoke_handler(tauri::generate_handler![...])`，11 项全部白名单注册；新增命令时也要加进去。

---

## 7. 前端适配器层

### 7.1 `ProviderAdapter` 接口（9 方法）

```ts
interface ProviderAdapter {
  provider: Provider
  discover(): Promise<ObservedPluginState[]>
  install(req): Promise<StepResult>
  uninstall(req): Promise<StepResult>
  upgrade(req): Promise<StepResult>
  enable(req): Promise<StepResult>
  disable(req): Promise<StepResult>
  readConfig(req): Promise<Record<string, unknown>>
  writeConfig(req: ConfigRequest): Promise<StepResult>
  healthCheck(req): Promise<HealthResult>
}
```

`StepResult = { success, message, durationMs }`，写操作都返回耗时，便于在 OperationLog 里展示。

### 7.2 三个真实适配器

| 适配器 | 真实数据源 | 命令依赖 |
|---|---|---|
| `CodexProviderAdapter` | `manage-superpowers.ps1` | `codex_list_superpowers`、`codex_set_superpowers_enabled` |
| `ClaudeProviderAdapter` | `~/.claude/plugins/installed_plugins.json` + `settings.json` | `claude_read_runtime`、`claude_set_enabled_plugin`、`claude_set_plugin_config` |
| `CcSwitchProviderAdapter` | `.cc-switch/settings.json`（写）+ `cc-switch.db`（只读） | `ccswitch_read_runtime`、`ccswitch_read_lifecycle`、`ccswitch_set_enabled`、`ccswitch_set_ai_orchestrator_config` |

**降级策略**：每个适配器先用 `isTauriRuntime()` 判断（检查 `__TAURI_INTERNALS__`），不是桌面环境则走 Mock 路径，保证 `npm run dev` 浏览器调试可用。

### 7.3 Mock fallback

`mock-provider-adapter.ts` 提供通用内存模拟，主要在浏览器模式或命令异常时被复用。

### 7.4 Read-only bridge

`read-only-runtime-adapter.ts` 仅暴露两个函数：

```ts
readGitReadOnlyStatus(repoDir)         // → invoke('git_read_status')
readCcSwitchSqliteSnapshot(configDir)  // → invoke('ccswitch_read_lifecycle')
```

它们在 Orchestrator 的 `refreshReadOnlyIntegrations()` 里被并行调用（`Promise.all`）。

---

## 8. 业务流程时序

### 8.1 启动 Bootstrap

```
useOrchestrator (mount)
  └─ MockOrchestrator.bootstrap()
       ├─ new MockOrchestrator()    // 用 mock-data 装填初始 state
       ├─ refreshObserved()         // 并行调每个 adapter.discover()
       └─ refreshReadOnlyIntegrations()
              ├─ readGitReadOnlyStatus()       → 写入 syncStatus.ahead/behind
              └─ readCcSwitchSqliteSnapshot()  → 写入 ccSwitchLifecycle 实读字段
  └─ setSnapshot(orchestrator.getSnapshot())
```

**约 100ms 内完成**（Mock 模式纯内存；真实模式取决于 PS1 / git / sqlite3 调用速度）。

### 8.2 启停插件

```
PluginsPage onClick Enable/Disable
  └─ togglePluginEnabled(provider, pluginId, enabled)
       └─ runAction(o => o.setPluginEnabled(...))
              ├─ beginOperation('Enable plugin', ...)
              ├─ adapter.install/enable/disable + healthCheck
              ├─ upsertDesired({ enabled })
              ├─ refreshObserved()
              ├─ recordLocalChanges(1, ...)        // ahead++ + push 到 localChanges
              └─ endOperation(success)
       └─ refreshSnapshot()                          // 触发 UI 重绘
```

**关键不变量**：每次写操作完成都会 `refreshObserved`，保证 UI 看到的就是最新真实态。

### 8.3 Reconcile

```
ProfilesPage Dry Run / Apply
  └─ reconcileDryRun() / reconcileApply()
       └─ runReconcile(dryRun)
              ├─ buildReconcilePlan(desired, observed, manifests)  // 纯函数
              ├─ lastPlan = plan
              └─ if (!dryRun)
                    └─ for each item where action !== 'noop':
                          executePlanItem(item)    // adapter.install/upgrade/enable/disable
```

**Plan 生成规则**（src/core/planner.ts）：

| 条件 | 动作 | 原因 |
|---|---|---|
| observed 缺失 | `install` | Plugin missing in observed state |
| desired enabled 但未安装 | `install` | Desired enabled but plugin is not installed |
| desired enabled、已装但未启用 | `enable` | Desired enabled but plugin is disabled |
| desired enabled + versionPolicy=latest + 版本漂移 | `upgrade` | Version drift: a → b |
| desired disabled 但启用中 | `disable` | Desired disabled but plugin is enabled |
| 其他 | `noop` | Already converged |

### 8.4 Git Sync

`gitSync('pull' | 'push')` → `applyGitSyncTransition`（纯函数）：

| 当前状态 | pull | push |
|---|---|---|
| `behind === 0` | `noop` "Already up to date" | — |
| `behind > 0 && ahead > 0` | `blocked` "Pull detected divergence" | `blocked` "Remote has newer commits" |
| `behind > 0 && ahead === 0` | `success` 清空 behind / remoteChanges | — |
| `ahead > 0 && behind === 0` | — | `success` 清空 ahead / localChanges |

**冲突解决**：

- `keep-local`：behind→0、清 remoteChanges、保留 localChanges
- `accept-remote`：全清 ahead/behind/local/remote

> 当前 push/pull 是 **Mock 模拟**（120ms setTimeout），不会真的 spawn `git push/pull`。真实 Git 写操作是 §11 的迭代项。

### 8.5 cc-switch 生命周期

```
PluginsPage cc-switch lifecycle 按钮
  └─ runCcSwitchLifecycleAction(pluginId, 'install' | 'upgrade' | 'enable' | 'disable' | 'uninstall')
       └─ ccSwitchAdapter.runLifecycleAction(...)
              └─ applyCcSwitchLifecycleAction(state, action)   // src/shared/ccswitch-lifecycle.ts
```

`applyCcSwitchLifecycleAction` 是纯函数，覆盖 5 个动作的状态转换（参见单测 `ccswitch-lifecycle.test.ts`）。

---

## 9. 路径与配置

### 9.1 默认路径（`src/shared/mock-data.ts`）

```ts
codexScriptsDir:       'D:/Projects/ai_projects/.codex/scripts'
claudeConfigDir:       'C:/Users/Admin/.claude'
ccSwitchConfigDir:     'C:/Users/Admin/.cc-switch'
ccSwitchDatabasePath:  'C:/Users/Admin/.cc-switch/cc-switch.db'
gitRepoUrl:            'https://github.com/MJX1010/AI_Plugins'
gitRepoDir:            'D:/Projects/ai_projects/AI_Plugins'
gitBranch:             'main'
```

### 9.2 路径要求

| 路径 | 必须存在的文件 | 命令依赖 |
|---|---|---|
| `codexScriptsDir/manage-superpowers.ps1` | 必须 | `codex_*` |
| `claudeConfigDir/plugins/installed_plugins.json` | 自动创建空对象 | `claude_read_runtime` |
| `claudeConfigDir/settings.json` | 自动创建空对象 | `claude_*_set_*` |
| `ccSwitchConfigDir/settings.json` | 不存在则 `exists=false` | `ccswitch_*` |
| `ccSwitchConfigDir/cc-switch.db` | 不存在则 `available=false` | `ccswitch_read_lifecycle` |
| `gitRepoDir/.git/` | 不存在则 `available=false` | `git_read_status` |

### 9.3 Tauri 配置（`src-tauri/tauri.conf.json`）

| 字段 | 当前值 |
|---|---|
| `productName` | `AI Orchestrator Desktop` |
| `identifier` | `com.mjx1010.aiorchestratordesktop` |
| `version` | `0.1.1` |
| `build.devUrl` | `http://localhost:5173` |
| `build.frontendDist` | `../dist` |
| `app.windows[0]` | 800×600，可缩放，非全屏 |
| `app.security.csp` | `null`（开发期）|

> **多项目并行端口冲突**：如果同时还在跑别的 Vite 项目，5173 可能被占用导致 `npm run tauri dev` 闪退。临时方案是改 `vite.config.ts` 为 `server: { port: 1420, strictPort: true }` 并把 `tauri.conf.json` 的 `devUrl` 同步改为 `http://localhost:1420`，或停掉其它项目。

---

## 10. 测试

### 10.1 运行

```bash
npm run lint              # eslint flat config
npm test                  # node --test --experimental-strip-types src/shared/*.test.ts
```

> 注意 `package.json` 的 `test` 脚本目前只跑 `src/shared/*.test.ts`，core / adapters 没单测。

### 10.2 已有单测

| 文件 | 覆盖 |
|---|---|
| `src/shared/git-sync.test.ts` | `applyGitSyncTransition` 的 4 类动作 × 各种 ahead/behind 边界 |
| `src/shared/ccswitch-lifecycle.test.ts` | `deriveLifecycleStatus` + `applyLifecycleAction` 5 个动作 |
| `src/shared/real-integrations.test.ts` | `createUnavailableGitStatus` + `normalizeSqliteLifecycle` |

### 10.3 测试缺口（迭代时补）

- `src/core/planner.ts`：未测
- `src/core/orchestrator.ts`：未测，依赖 mock adapter 注入
- 三个真实 adapter：未测，需 mock `invoke` 后再断言写出 JSON 内容

---

## 11. 已知限制与下一步迭代

> 来自 `README.md` 的 _Next Milestones_ 与代码现状综合。

| # | 缺口 | 落地建议 |
|---|---|---|
| 1 | Git push/pull 是 Mock | 在 `lib.rs` 加 `git_pull` / `git_push` 命令（spawn `git pull/push`），把 `MockOrchestrator.gitSync` 改为 `invoke` |
| 2 | Git divergence 解决也是 Mock | 同上，加 `git_resolve_keep_local`（用 `git rebase --strategy-option=ours` 或 patch+reset）和 `git_accept_remote`（`git reset --hard @{u}`） |
| 3 | cc-switch SQLite 写操作未支持 | `lib.rs` 增加 `ccswitch_write_lifecycle`（`rusqlite` 写）；目前只读 |
| 4 | Profile 切换不生效 | `desiredState.profileName` 当前不会触发重渲，`mockProfiles` 没有对应 plugins 集合；需 profile-scoped DesiredState 持久化 |
| 5 | Settings 页只读 | 增加表单 + 校验 + 写入 `localStorage` 或 `~/.ai-orchestrator/settings.json`（新增 Tauri 命令） |
| 6 | OperationLog 无持久化 | 应用关闭后丢失；如需审计落盘到 JSONL |
| 7 | 没有 i18n | UI 全英文，可加 `react-i18next` |
| 8 | 没有 toast 反馈 | 错误目前只展示在顶部 `error-banner`；建议接 `sonner` 或自写轻量 toast |
| 9 | 没有 e2e 测试 | 增加 Playwright 在 Tauri 模式下做关键流（启停 / Reconcile / Sync） |
| 10 | adapter 单测缺失 | 用 `vi.mock('@tauri-apps/api/core', ...)` 注入 invoke 桩 |

### 11.1 增加新 provider 的步骤

1. `src/shared/types.ts`：扩展 `providers` 元组
2. `src/adapters/`：新增 `<name>-provider-adapter.ts`，实现 `ProviderAdapter`
3. `src/adapters/create-provider-adapters.ts`：在工厂 return 中注册
4. `src-tauri/src/lib.rs`：加对应 `<name>_*` 命令并注册到 `invoke_handler`
5. `src/shared/mock-data.ts`：在 `mockManifests` 加该 provider 的种子
6. UI 自动支持（PluginsPage filter chip 会基于 `providers` 元组自动渲染）

### 11.2 增加新页面的步骤

1. `src/ui/pages/<name>-page.tsx`：复用 `panel`/`kv-grid`/`page-stack` 等已有 class
2. `src/App.tsx`：扩 `AppPage` union + `navigation` 数组 + `activePage === 'xxx' && <Page />`
3. 如需新数据，扩 `AppSnapshot` + Orchestrator 内部状态 + adapter 接口

---

## 12. 故障排查 FAQ

### Q1：`npm run tauri dev` 启动后窗口闪退

**最常见原因**：5173 被其他 Vite 占用，Vite fallback 到 5174，但 `tauri.conf.json.devUrl` 写死 5173 → Tauri 连不上前端 → 退出。

**确认**：

```bash
netstat -ano | grep ":5173"
```

**修复**：停掉占用方，或改 `vite.config.ts` + `tauri.conf.json` 同步换端口（推荐 1420）：

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true },
})
```

```json
// tauri.conf.json
"devUrl": "http://localhost:1420"
```

### Q2：Plugins 页所有插件都显示 `health=warn` / `installedVersion=-`

适配器 `discover()` 没拿到真实数据。检查：

- 桌面模式才会 invoke 真实命令；浏览器模式（`npm run dev`）只有 Mock 数据
- `Settings` 页的路径是否指向真实存在的目录
- 桌面模式打开 DevTools（右键 → Inspect）看 Console 是否有 invoke 失败

### Q3：`Pull` / `Push` 按钮没真的动 Git

当前是 Mock 实现（120ms setTimeout）。真实 Git 写操作见 §11.1 / 11.2。

### Q4：cc-switch lifecycle 面板的 `realReadAvailable=Unavailable`

`ccswitch_read_lifecycle` 调 `sqlite3` 失败。原因：

- `cc-switch.db` 不存在
- 系统 PATH 没装 `sqlite3`（Tauri 命令 spawn 系统 sqlite3）
- 数据库被其他进程独占

### Q5：Refresh 后操作很慢

`refreshObserved()` 并行调 3 个 adapter，但每个 adapter 内部可能串行调多个命令（如 Codex 调 PS1 启动开销 ~500ms）。是预期行为。

### Q6：构建包里的 app.exe 双击没反应

确认：

- `bundle/msi/*.msi` 或 `bundle/nsis/*-setup.exe` 是否安装过 WebView2
- 老 Win10 需要 [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/)
- 杀软误报：尝试加白名单（NSIS 安装器较易被误判）

### Q7：增量编译很慢

`src-tauri/target/` 体积膨胀过快，可清理：

```bash
cargo clean    # 在 src-tauri/ 目录下
```

或针对 release：

```bash
rm -rf src-tauri/target/release
```

下一次构建会重头编 Rust（5–15 分钟）。

---

## 维护备忘

- **数据流改动一致性**：改 `types.ts` 必须同步 `mock-data.ts` + `lib.rs` 的对应 Rust struct（`#[derive(Serialize)]`）+ 所有 adapter
- **新增命令一致性**：`lib.rs` 注册 + 前端 `invoke<T>('cmd_name', {...})` 参数 camelCase + 类型在 `types.ts` 添加
- **package.json** 的 `test` 命令依赖 Node 22.6+ 的 `--experimental-strip-types`，CI 注意 Node 版本
- **依赖升级**：Tauri 大版本升级请阅读 [migration guide](https://tauri.app/v2/guides/migrate/)，capabilities 配置可能需要调整

---

> 维护者：在改完关键模块后，请在对应章节末尾追加变更记录，便于追溯。
