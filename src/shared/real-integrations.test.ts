import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createUnavailableGitStatus,
  normalizeSqliteLifecycle,
} from './real-integrations.ts'
import type { CcSwitchSqliteSnapshot } from './types.ts'

test('createUnavailableGitStatus keeps the configured repo path visible', () => {
  const status = createUnavailableGitStatus('D:/Projects/AI_Plugins', 'Path does not exist')

  assert.equal(status.available, false)
  assert.equal(status.repoPath, 'D:/Projects/AI_Plugins')
  assert.equal(status.error, 'Path does not exist')
  assert.deepEqual(status.localChanges, [])
  assert.deepEqual(status.remoteChanges, [])
})

test('normalizeSqliteLifecycle uses real skills table counts when available', () => {
  const snapshot: CcSwitchSqliteSnapshot = {
    available: true,
    dbPath: 'C:/Users/Admin/.cc-switch/cc-switch.db',
    skillsCount: 3,
    enabledClaudeCount: 2,
    enabledCodexCount: 1,
    latestSkillUpdatedAt: 1777300000,
    sampleSkills: [
      {
        id: 'skill-a',
        name: 'Skill A',
        directory: 'C:/Users/Admin/.cc-switch/skills/skill-a',
        enabledClaude: true,
        enabledCodex: false,
        installedAt: 1777200000,
        updatedAt: 1777300000,
      },
    ],
  }

  const lifecycle = normalizeSqliteLifecycle(snapshot)

  assert.equal(lifecycle.realReadAvailable, true)
  assert.equal(lifecycle.realSkillsCount, 3)
  assert.equal(lifecycle.realEnabledClaudeCount, 2)
  assert.equal(lifecycle.realEnabledCodexCount, 1)
  assert.equal(lifecycle.realSampleSkills.length, 1)
})
