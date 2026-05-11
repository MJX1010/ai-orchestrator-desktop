# Git Sync and cc-switch Mock Cockpit Design

## Scope

This pass improves the existing desktop control plane through front-end and TypeScript mock runtime changes only. It does not run real Git commands, touch remote repositories, read real SQLite files, or install/uninstall real cc-switch components.

## Goals

- Make Git Sync conflict handling understandable before an operator clicks a destructive action.
- Add a cc-switch lifecycle surface that demonstrates install, uninstall, and upgrade workflows.
- Keep the implementation aligned with the current `MockOrchestrator`, provider adapter, and page-based UI structure.
- Restore baseline validation by excluding generated Tauri artifacts from linting.

## Git Sync Design

The Sync page will become an operational cockpit with four areas:

1. Status summary with repository, branch, ahead/behind counts, conflict state, and last action.
2. Local and remote change preview cards derived from mock sync state.
3. Resolution strategy cards for "keep local changes" and "accept remote state", with consequences shown inline.
4. Operation feedback through existing operation logs and a page-level result area.

Pull and push stay simulated. Push remains blocked when the mock remote is ahead. Accepting remote requires confirmation because it represents discarding local unpushed changes in the mock model.

## cc-switch Lifecycle Design

The cc-switch adapter will expose a simulated SQLite-backed lifecycle model for the `switch-core` manifest. The model tracks:

- Installed state.
- Enabled state.
- Current version.
- Latest available version.
- Lifecycle status such as available, installed, update available, or missing settings.

The Plugins page will show cc-switch lifecycle actions for install, uninstall, upgrade, enable, and disable. Operations update the mock runtime state and feed back through the existing operation log.

## Data Flow

`MockOrchestrator` owns the app snapshot. It calls provider adapters for discovery and lifecycle mutations. The cc-switch adapter keeps the simulated SQLite lifecycle state in memory for browser runtime and continues to use Tauri commands only for existing settings-file enable/config operations when running inside Tauri.

The app snapshot will carry enough information for UI previews without requiring direct adapter access from React components.

## Error Handling

- Invalid operations return failed step results and are surfaced in the existing error banner.
- Destructive mock actions require confirmation.
- Missing or unsupported lifecycle operations should show a clear operation message instead of silently doing nothing.

## Validation

- `npm run lint` must pass after generated directories are ignored.
- `npm run build` must pass for the TypeScript and Vite frontend.

## Out of Scope

- Real Git pull, push, merge, or rebase.
- Real SQLite reads or writes.
- Real cc-switch package download, installation, or deletion.
- New Rust/Tauri command implementation for these workflows.
