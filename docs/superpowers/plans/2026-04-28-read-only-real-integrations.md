# Read-Only Real Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only real Git and cc-switch SQLite discovery while preserving mock-only write operations.

**Architecture:** Add read-only Tauri commands for Git status/diff preview and cc-switch SQLite metadata. Frontend adapters call these commands in Tauri runtime and fall back to current mock state in browser runtime.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tauri 2, Rust std process calls, sqlite3 CLI.

---

## Tasks

- [ ] Add runtime types for read-only Git and SQLite evidence.
- [ ] Add TypeScript tests for read-only status normalization.
- [ ] Implement Rust commands that only read: `git_read_status` and `ccswitch_read_lifecycle`.
- [ ] Wire `MockOrchestrator` bootstrap to refresh read-only status in Tauri runtime.
- [ ] Render real integration evidence in Sync and cc-switch lifecycle panels.
- [ ] Verify with `npm test`, `npm run lint`, `npm run build`, and `cargo check`.

## Constraints

- No real Git mutation commands.
- No SQLite writes.
- No new network dependency unless unavoidable.
- Current workspace is not a Git repository, so no worktree or commit steps.
