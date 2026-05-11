import type { GitChangePreview, GitDivergenceResolution, GitSyncStatus } from './types'

export const createLocalChangePreview = (
  summary: string,
  provider: string,
  pluginId: string,
  timestamp: string,
): GitChangePreview => ({
  id: `local-${timestamp}-${provider}-${pluginId}`,
  path: `${provider}/${pluginId}`,
  summary,
  timestamp,
})

const computeConflictState = (
  ahead: number,
  behind: number,
): GitSyncStatus['conflictState'] => {
  if (ahead > 0 && behind > 0) {
    return 'diverged'
  }

  if (ahead === 0 && behind > 0) {
    return 'blocked'
  }

  return 'clean'
}

const computeHealth = (conflictState: GitSyncStatus['conflictState']) =>
  conflictState === 'clean' ? ('ok' as const) : ('warn' as const)

export const applyGitSyncTransition = (
  status: GitSyncStatus,
  action: 'pull' | 'push' | GitDivergenceResolution,
  timestamp: string,
): GitSyncStatus => {
  const nextStatus: GitSyncStatus = {
    ...status,
    localChanges: [...status.localChanges],
    remoteChanges: [...status.remoteChanges],
    lastSyncAt: timestamp,
  }

  if (action === 'pull') {
    nextStatus.lastAction = 'pull'
    if (status.behind === 0) {
      nextStatus.lastOperationSummary = {
        title: 'Pull skipped',
        result: 'noop',
        details: [`Already up to date on ${status.branch}`],
        timestamp,
      }
    } else if (status.ahead > 0) {
      nextStatus.lastOperationSummary = {
        title: 'Pull detected divergence',
        result: 'blocked',
        details: [
          `Fetched ${status.behind} remote change(s).`,
          'Choose a resolution strategy before pushing.',
        ],
        timestamp,
      }
    } else {
      nextStatus.behind = 0
      nextStatus.remoteChanges = []
      nextStatus.lastOperationSummary = {
        title: 'Pull complete',
        result: 'success',
        details: [`Pulled ${status.behind} remote change(s) from ${status.branch}`],
        timestamp,
      }
    }
  }

  if (action === 'push') {
    nextStatus.lastAction = 'push'
    if (status.behind > 0) {
      nextStatus.lastOperationSummary = {
        title: 'Push blocked',
        result: 'blocked',
        details: ['Remote has newer commits. Pull and resolve divergence first.'],
        timestamp,
      }
    } else if (status.ahead === 0) {
      nextStatus.lastOperationSummary = {
        title: 'Push skipped',
        result: 'noop',
        details: [`Nothing to push on ${status.branch}`],
        timestamp,
      }
    } else {
      nextStatus.ahead = 0
      nextStatus.localChanges = []
      nextStatus.lastOperationSummary = {
        title: 'Push complete',
        result: 'success',
        details: [`Pushed ${status.ahead} local change(s) to ${status.branch}`],
        timestamp,
      }
    }
  }

  if (action === 'keep-local') {
    nextStatus.lastAction = 'resolve-keep-local'
    nextStatus.behind = 0
    nextStatus.remoteChanges = []
    nextStatus.lastOperationSummary = {
      title: 'Kept local changes',
      result: 'success',
      details: [
        `Preserved ${status.ahead} local change(s).`,
        `Integrated ${status.behind} remote change(s) into the mock workspace.`,
      ],
      timestamp,
    }
  }

  if (action === 'accept-remote') {
    nextStatus.lastAction = 'resolve-remote'
    nextStatus.ahead = 0
    nextStatus.behind = 0
    nextStatus.localChanges = []
    nextStatus.remoteChanges = []
    nextStatus.lastOperationSummary = {
      title: 'Accepted remote state',
      result: 'success',
      details: [
        `Dropped ${status.ahead} local change(s).`,
        `Consumed ${status.behind} remote change(s).`,
      ],
      timestamp,
    }
  }

  nextStatus.conflictState = computeConflictState(nextStatus.ahead, nextStatus.behind)
  nextStatus.health = computeHealth(nextStatus.conflictState)
  return nextStatus
}
