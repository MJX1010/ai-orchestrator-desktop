import { invoke } from '@tauri-apps/api/core'
import type { CcSwitchSqliteSnapshot, GitReadOnlyStatus } from '../shared/types'
import { createUnavailableGitStatus } from '../shared/real-integrations'

const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const nowIso = () => new Date().toISOString()

const withReadTimestamp = (status: GitReadOnlyStatus): GitReadOnlyStatus => {
  const timestamp = nowIso()
  return {
    ...status,
    lastReadAt: status.lastReadAt ?? timestamp,
    localChanges: status.localChanges.map((change) => ({
      ...change,
      timestamp: change.timestamp || timestamp,
    })),
    remoteChanges: status.remoteChanges.map((change) => ({
      ...change,
      timestamp: change.timestamp || timestamp,
    })),
  }
}

export const readGitReadOnlyStatus = async (
  repoDir: string,
): Promise<GitReadOnlyStatus> => {
  if (!isTauriRuntime()) {
    return createUnavailableGitStatus(repoDir, 'Real Git status is available in Tauri runtime only.')
  }

  const status = await invoke<GitReadOnlyStatus>('git_read_status', {
    repoDir,
  })
  return withReadTimestamp(status)
}

export const readCcSwitchSqliteSnapshot = async (
  ccswitchConfigDir: string,
): Promise<CcSwitchSqliteSnapshot | null> => {
  if (!isTauriRuntime()) {
    return null
  }

  return invoke<CcSwitchSqliteSnapshot>('ccswitch_read_lifecycle', {
    ccswitchConfigDir,
  })
}
