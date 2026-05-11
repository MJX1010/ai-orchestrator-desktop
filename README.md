# AI Orchestrator Desktop (Windows V1)

Desktop control plane for managing AI plugins across:

- `Codex CLI`
- `Claude Code CLI`
- `cc-switch`

Current build is an M1/M2 starter that includes:

- Multi-page desktop UI shell (`Dashboard`, `Plugins`, `Profiles`, `Sync`, `Settings`)
- Unified plugin data model (`DesiredState` / `ObservedState` / `ReconcilePlan`)
- Mock orchestrator loop (`dry-run`, `apply`, `toggle`, `config`, `git sync`)
- Adapter abstraction for provider-specific integrations
- Real `CodexAdapter` integration for `manage-superpowers.ps1` (list/set whitelist)
- Real `ClaudeAdapter` integration for `installed_plugins.json` + `settings.json` (enable state + plugin config)
- Real `CcSwitchAdapter` integration for `.cc-switch/settings.json` (integration toggle + aiOrchestrator config)

## Local Development

```bash
npm install
npm run dev
```

## Tauri Desktop Runtime

To run or build Tauri desktop binaries, install Rust first:

```bash
rustup-init.exe
```

Then run:

```bash
npm run tauri dev
```

## Important Paths (Windows)

- Codex scripts: `D:\Projects\.codex\scripts`
- Claude config: `C:\Users\Admin\.claude`
- Sync repo target: `https://github.com/MJX1010/AI_Plugins`

## Next Milestones

- Git reconcile conflict resolution UI
- cc-switch SQLite-backed plugin lifecycle (install/uninstall/upgrade)
