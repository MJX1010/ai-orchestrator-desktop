import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCcSwitchLifecycleAction,
  deriveCcSwitchLifecycleStatus,
} from './ccswitch-lifecycle.ts'
import type { CcSwitchLifecycleState } from './types.ts'

const baseLifecycle = (): CcSwitchLifecycleState => ({
  provider: 'cc-switch',
  pluginId: 'switch-core',
  displayName: 'CC Switch Core',
  sqlitePath: 'C:/Users/Admin/.cc-switch/plugins.db',
  installed: true,
  enabled: true,
  currentVersion: '1.4.0',
  latestVersion: '1.5.0',
  status: 'update-available',
})

test('deriveCcSwitchLifecycleStatus reports update when installed version is behind latest', () => {
  assert.equal(
    deriveCcSwitchLifecycleStatus({
      installed: true,
      currentVersion: '1.4.0',
      latestVersion: '1.5.0',
    }),
    'update-available',
  )
})

test('applyCcSwitchLifecycleAction upgrades to the latest version and records the action', () => {
  const upgraded = applyCcSwitchLifecycleAction(baseLifecycle(), 'upgrade')

  assert.equal(upgraded.installed, true)
  assert.equal(upgraded.enabled, true)
  assert.equal(upgraded.currentVersion, '1.5.0')
  assert.equal(upgraded.status, 'installed')
  assert.equal(upgraded.lastAction, 'upgrade')
})

test('applyCcSwitchLifecycleAction uninstalls and disables the lifecycle entry', () => {
  const uninstalled = applyCcSwitchLifecycleAction(baseLifecycle(), 'uninstall')

  assert.equal(uninstalled.installed, false)
  assert.equal(uninstalled.enabled, false)
  assert.equal(uninstalled.currentVersion, null)
  assert.equal(uninstalled.status, 'available')
  assert.equal(uninstalled.lastAction, 'uninstall')
})
