# Git Sync and cc-switch Mock Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a front-end and TypeScript mock runtime cockpit for Git conflict handling and cc-switch lifecycle actions.

**Architecture:** Keep `MockOrchestrator` as the state owner and expose richer snapshot data to React pages. Extend shared types for Git change previews and cc-switch lifecycle state, then add focused UI to `SyncPage` and `PluginsPage` without introducing real Git, SQLite, or Tauri lifecycle integration.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tauri 2 shell, ESLint 9 flat config.

---

## File Structure

- Modify `src/shared/types.ts` for Git preview, cc-switch lifecycle, and lifecycle action types.
- Modify `src/shared/mock-data.ts` for mock Git preview entries and cc-switch lifecycle seed state.
- Modify `src/core/orchestrator.ts` for snapshot data, Git action feedback, and cc-switch lifecycle operations.
- Modify `src/adapters/ccswitch-provider-adapter.ts` for in-memory lifecycle simulation.
- Modify `src/ui/hooks/use-orchestrator.ts` for lifecycle action callbacks.
- Modify `src/ui/pages/sync-page.tsx` for status cards, change previews, strategy cards, and result feedback.
- Modify `src/ui/pages/plugins-page.tsx` for cc-switch lifecycle controls.
- Modify `src/App.tsx` to pass new snapshot data and callbacks.
- Modify `src/App.css` for dense cockpit layout components.
- Modify `eslint.config.js` and `.gitignore` to exclude generated Tauri and companion artifacts.

## Task 1: Restore Validation Baseline

**Files:**
- Modify: `eslint.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Update ESLint global ignores**

Change `eslint.config.js` so `globalIgnores` excludes generated and dependency directories:

```js
globalIgnores(['dist', 'dist-ssr', 'node_modules', 'src-tauri/target', '.superpowers'])
```

- [ ] **Step 2: Update ignored generated artifacts**

Add these entries to `.gitignore`:

```gitignore
src-tauri/target
.superpowers
```

- [ ] **Step 3: Run baseline lint**

Run: `npm run lint`

Expected: no parse errors from `src-tauri/target`.

## Task 2: Add Snapshot Types and Mock Seeds

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/mock-data.ts`

- [ ] **Step 1: Add Git preview types**

Add `GitChangePreview`, `GitSyncOperationSummary`, and extend `GitSyncStatus` with:

```ts
localChanges: GitChangePreview[]
remoteChanges: GitChangePreview[]
lastOperationSummary?: GitSyncOperationSummary
```

- [ ] **Step 2: Add cc-switch lifecycle types**

Add `CcSwitchLifecycleStatus`, `CcSwitchLifecycleAction`, `CcSwitchLifecycleState`, and extend `AppSnapshot` with:

```ts
ccSwitchLifecycle: CcSwitchLifecycleState[]
```

- [ ] **Step 3: Seed mock Git previews**

Update `mockSyncStatus` with local and remote preview entries that exercise clean, blocked, and diverged UI states after mock operations.

- [ ] **Step 4: Seed cc-switch lifecycle**

Add `mockCcSwitchLifecycle` with one `switch-core` record: installed, enabled, current version `1.4.0`, latest version `1.5.0`, and status `update-available`.

## Task 3: Extend cc-switch Mock Lifecycle

**Files:**
- Modify: `src/adapters/ccswitch-provider-adapter.ts`

- [ ] **Step 1: Store lifecycle state in adapter**

Add a private lifecycle map keyed by plugin id, seeded from constructor input.

- [ ] **Step 2: Update discovery from lifecycle state**

Make `discover()` report installed, enabled, version, and health from lifecycle state in non-Tauri runtime.

- [ ] **Step 3: Implement mock install/uninstall/upgrade**

In browser mock runtime:

```ts
install -> installed=true, enabled=true, currentVersion=latestVersion
uninstall -> installed=false, enabled=false, currentVersion=null
upgrade -> installed=true, currentVersion=latestVersion
```

Unsupported Tauri real lifecycle remains non-automated.

- [ ] **Step 4: Keep enable/config behavior compatible**

Ensure enable/disable and config writes keep existing fallback settings in sync with lifecycle state.

## Task 4: Orchestrator Operations

**Files:**
- Modify: `src/core/orchestrator.ts`

- [ ] **Step 1: Include cc-switch lifecycle in snapshot**

Expose cloned lifecycle state through `getSnapshot()`.

- [ ] **Step 2: Add lifecycle operation method**

Add:

```ts
runCcSwitchLifecycleAction(pluginId: string, action: CcSwitchLifecycleAction): Promise<void>
```

It should call the adapter method matching the action, refresh observed state, record local changes, and write operation details.

- [ ] **Step 3: Improve Git operation summaries**

Set `lastOperationSummary` for pull, push, keep-local, and accept-remote with title, result, and details that the Sync page can render.

- [ ] **Step 4: Maintain preview list consistency**

When push succeeds, clear local changes. When pull or resolve consumes remote changes, clear remote changes. When local operations occur, append one local preview entry.

## Task 5: Hook and App Wiring

**Files:**
- Modify: `src/ui/hooks/use-orchestrator.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add hook callback**

Expose:

```ts
runCcSwitchLifecycleAction(pluginId: string, action: CcSwitchLifecycleAction)
```

- [ ] **Step 2: Pass snapshot data**

Pass `snapshot.syncStatus`, `snapshot.ccSwitchLifecycle`, lifecycle callback, and existing busy/error state into the relevant pages.

## Task 6: Git Sync Cockpit UI

**Files:**
- Modify: `src/ui/pages/sync-page.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add status strip**

Render repository, branch, ahead, behind, conflict state, and last sync as compact cards.

- [ ] **Step 2: Add change previews**

Render local and remote preview lists with path, summary, and timestamp. Show empty states when lists are clear.

- [ ] **Step 3: Add strategy cards**

Render "Keep local changes" and "Accept remote state" with impact text and buttons. Disable actions when there is no blocked or diverged state.

- [ ] **Step 4: Add operation feedback**

Render `lastOperationSummary` as a result panel with details.

## Task 7: cc-switch Lifecycle UI

**Files:**
- Modify: `src/ui/pages/plugins-page.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add lifecycle prop**

Accept `ccSwitchLifecycle` and `onRunCcSwitchLifecycleAction`.

- [ ] **Step 2: Render lifecycle panel**

When selected plugin provider is `cc-switch`, render installed state, enabled state, current version, latest version, SQLite status, and last action.

- [ ] **Step 3: Add action buttons**

Add Install, Uninstall, Upgrade, Enable, and Disable buttons with disabled states based on lifecycle status and `isBusy`.

- [ ] **Step 4: Preserve existing JSON config editing**

Keep the current config editor below lifecycle details.

## Task 8: Validate and Tidy

**Files:**
- Validate all changed files.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: pass.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Review generated artifacts**

Confirm generated output remains ignored and no real runtime config files were touched.

## Notes

This workspace has no `.git` directory, so commit steps are intentionally omitted. Do not run real Git pull/push or real cc-switch install/uninstall commands for this plan.
