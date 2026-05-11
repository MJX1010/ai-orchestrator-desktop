import type {
  CcSwitchLifecycleAction,
  CcSwitchLifecycleState,
  CcSwitchLifecycleStatus,
} from './types'

interface CcSwitchLifecycleStatusInput {
  installed: boolean
  currentVersion: string | null
  latestVersion: string
  settingsExists?: boolean
}

export const deriveCcSwitchLifecycleStatus = ({
  installed,
  currentVersion,
  latestVersion,
  settingsExists = true,
}: CcSwitchLifecycleStatusInput): CcSwitchLifecycleStatus => {
  if (!settingsExists) {
    return 'missing-settings'
  }

  if (!installed) {
    return 'available'
  }

  if (currentVersion && currentVersion !== latestVersion) {
    return 'update-available'
  }

  return 'installed'
}

export const applyCcSwitchLifecycleAction = (
  state: CcSwitchLifecycleState,
  action: CcSwitchLifecycleAction,
  timestamp = new Date().toISOString(),
): CcSwitchLifecycleState => {
  const nextState: CcSwitchLifecycleState = {
    ...state,
    lastAction: action,
    lastActionAt: timestamp,
  }

  switch (action) {
    case 'install':
      nextState.installed = true
      nextState.enabled = true
      nextState.currentVersion = state.latestVersion
      nextState.lastMessage = `Installed ${state.displayName} ${state.latestVersion}`
      break
    case 'uninstall':
      nextState.installed = false
      nextState.enabled = false
      nextState.currentVersion = null
      nextState.lastMessage = `Uninstalled ${state.displayName}`
      break
    case 'upgrade':
      nextState.installed = true
      nextState.enabled = true
      nextState.currentVersion = state.latestVersion
      nextState.lastMessage = `Upgraded ${state.displayName} to ${state.latestVersion}`
      break
    case 'enable':
      nextState.installed = true
      nextState.enabled = true
      nextState.currentVersion = state.currentVersion ?? state.latestVersion
      nextState.lastMessage = `Enabled ${state.displayName}`
      break
    case 'disable':
      nextState.enabled = false
      nextState.lastMessage = `Disabled ${state.displayName}`
      break
    default:
      action satisfies never
  }

  nextState.status = deriveCcSwitchLifecycleStatus(nextState)
  return nextState
}
