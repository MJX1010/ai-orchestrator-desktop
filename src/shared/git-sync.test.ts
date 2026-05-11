import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyGitSyncTransition,
  createLocalChangePreview,
} from './git-sync.ts'
import type { GitSyncStatus } from './types.ts'

const cleanStatus = (): GitSyncStatus => ({
  repositoryUrl: 'https://github.com/MJX1010/AI_Plugins',
  branch: 'main',
  ahead: 1,
  behind: 2,
  health: 'warn',
  conflictState: 'diverged',
  localChanges: [
    {
      id: 'local-1',
      path: 'profiles/default.json',
      summary: 'Enabled Codex Superpowers',
      timestamp: '2026-04-27T10:00:00.000Z',
    },
  ],
  remoteChanges: [
    {
      id: 'remote-1',
      path: 'plugins/claude-mem.json',
      summary: 'Updated Claude Mem default version',
      timestamp: '2026-04-27T11:00:00.000Z',
    },
  ],
})

test('applyGitSyncTransition clears local and remote previews when accepting remote state', () => {
  const status = applyGitSyncTransition(cleanStatus(), 'accept-remote', '2026-04-27T12:00:00.000Z')

  assert.equal(status.ahead, 0)
  assert.equal(status.behind, 0)
  assert.equal(status.conflictState, 'clean')
  assert.deepEqual(status.localChanges, [])
  assert.deepEqual(status.remoteChanges, [])
  assert.equal(status.lastAction, 'resolve-remote')
  assert.equal(status.lastOperationSummary?.result, 'success')
})

test('createLocalChangePreview creates stable user-facing summaries', () => {
  assert.deepEqual(
    createLocalChangePreview('Enable plugin', 'cc-switch', 'switch-core', '2026-04-27T13:00:00.000Z'),
    {
      id: 'local-2026-04-27T13:00:00.000Z-cc-switch-switch-core',
      path: 'cc-switch/switch-core',
      summary: 'Enable plugin',
      timestamp: '2026-04-27T13:00:00.000Z',
    },
  )
})
