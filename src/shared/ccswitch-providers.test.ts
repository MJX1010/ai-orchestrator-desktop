import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STATUS_LINE,
  backupCcSwitchDatabase,
  createUnavailableProvidersSnapshot,
  injectStatusLineToAllProviders,
  isCcSwitchProcessRunning,
  loadCcSwitchProvidersSnapshot,
} from './ccswitch-providers.ts'

test('createUnavailableProvidersSnapshot returns a placeholder with the configured db path', () => {
  const snapshot = createUnavailableProvidersSnapshot(
    'C:/Users/Admin/.cc-switch/cc-switch.db',
    'claude',
    'db missing',
  )

  assert.equal(snapshot.available, false)
  assert.equal(snapshot.dbPath, 'C:/Users/Admin/.cc-switch/cc-switch.db')
  assert.equal(snapshot.appType, 'claude')
  assert.equal(snapshot.error, 'db missing')
  assert.deepEqual(snapshot.providers, [])
})

test('loadCcSwitchProvidersSnapshot returns an unavailable snapshot in non-Tauri runtime', async () => {
  const snapshot = await loadCcSwitchProvidersSnapshot('C:/Users/Admin/.cc-switch', 'claude')

  assert.equal(snapshot.available, false)
  assert.equal(snapshot.appType, 'claude')
  assert.deepEqual(snapshot.providers, [])
  assert.ok(snapshot.error)
  assert.match(snapshot.dbPath, /cc-switch\.db$/)
})

test('DEFAULT_STATUS_LINE matches the ccstatusline injection target', () => {
  assert.equal(DEFAULT_STATUS_LINE.type, 'command')
  assert.equal(DEFAULT_STATUS_LINE.command, 'npx -y ccstatusline@latest')
  assert.equal(DEFAULT_STATUS_LINE.padding, 0)
})

test('isCcSwitchProcessRunning resolves to false outside Tauri runtime', async () => {
  assert.equal(await isCcSwitchProcessRunning(), false)
})

test('backupCcSwitchDatabase throws outside Tauri runtime', async () => {
  await assert.rejects(
    backupCcSwitchDatabase('C:/Users/Admin/.cc-switch'),
    /Tauri runtime not available/,
  )
})

test('injectStatusLineToAllProviders throws outside Tauri runtime', async () => {
  await assert.rejects(
    injectStatusLineToAllProviders('C:/Users/Admin/.cc-switch'),
    /Tauri runtime not available/,
  )
})
