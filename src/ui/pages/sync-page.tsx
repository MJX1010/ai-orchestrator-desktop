import type { GitChangePreview, GitReadOnlyStatus, GitSyncStatus } from '../../shared/types'

interface SyncPageProps {
  status: GitSyncStatus
  gitReadOnlyStatus: GitReadOnlyStatus
  isBusy: boolean
  onPull: () => Promise<void>
  onPush: () => Promise<void>
  onResolveKeepLocal: () => Promise<void>
  onAcceptRemote: () => Promise<void>
}

const formatDate = (value?: string) => {
  if (!value) {
    return 'Never'
  }
  return new Date(value).toLocaleString()
}

const syncHealthClassByState: Record<GitSyncStatus['conflictState'], string> = {
  clean: 'badge badge-ok',
  blocked: 'badge badge-warn',
  diverged: 'badge badge-error',
}

const syncStateLabelByState: Record<GitSyncStatus['conflictState'], string> = {
  clean: 'Clean',
  blocked: 'Remote Ahead',
  diverged: 'Diverged',
}

const operationClassByResult: Record<
  NonNullable<GitSyncStatus['lastOperationSummary']>['result'],
  string
> = {
  success: 'result-panel result-success',
  failed: 'result-panel result-error',
  blocked: 'result-panel result-warn',
  noop: 'result-panel',
}

const renderChangeList = (changes: GitChangePreview[], emptyText: string) => (
  <ul className="change-list">
    {changes.map((change) => (
      <li key={change.id}>
        <div>
          <strong>{change.path}</strong>
          <span>{formatDate(change.timestamp)}</span>
        </div>
        <p>{change.summary}</p>
      </li>
    ))}
    {!changes.length && <li className="empty-state">{emptyText}</li>}
  </ul>
)

export const SyncPage = ({
  status,
  gitReadOnlyStatus,
  isBusy,
  onPull,
  onPush,
  onResolveKeepLocal,
  onAcceptRemote,
}: SyncPageProps) => {
  const isDiverged = status.conflictState === 'diverged'
  const isBlocked = status.conflictState === 'blocked'
  const hasConflictWork = isDiverged || isBlocked
  const lastOperation = status.lastOperationSummary

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Git Sync Engine</h2>
            <p>{status.repositoryUrl}</p>
          </div>
          <span className={syncHealthClassByState[status.conflictState]}>
            {syncStateLabelByState[status.conflictState]}
          </span>
        </div>

        <div className="read-only-strip">
          <div>
            <span>Real Git Read</span>
            <strong>{gitReadOnlyStatus.available ? 'Connected' : 'Unavailable'}</strong>
          </div>
          <div>
            <span>Repo Path</span>
            <strong>{gitReadOnlyStatus.repoPath}</strong>
          </div>
          <div>
            <span>Remote</span>
            <strong>{gitReadOnlyStatus.remote ?? '-'}</strong>
          </div>
          <div>
            <span>Last Read</span>
            <strong>{formatDate(gitReadOnlyStatus.lastReadAt)}</strong>
          </div>
        </div>
        {gitReadOnlyStatus.error && (
          <p className="inline-warning">{gitReadOnlyStatus.error}</p>
        )}

        <div className="status-grid">
          <article className="status-card">
            <span>Branch</span>
            <strong>{status.branch}</strong>
          </article>
          <article className="status-card">
            <span>Ahead</span>
            <strong>{status.ahead}</strong>
          </article>
          <article className="status-card">
            <span>Behind</span>
            <strong>{status.behind}</strong>
          </article>
          <article className="status-card">
            <span>Last Sync</span>
            <strong>{formatDate(status.lastSyncAt)}</strong>
          </article>
        </div>

        <div className="actions">
          <button type="button" onClick={onPull} disabled={isBusy}>
            Pull
          </button>
          <button
            type="button"
            onClick={onPush}
            disabled={isBusy || status.ahead === 0 || status.behind > 0}
          >
            Push
          </button>
        </div>
      </section>

      <section className="sync-preview-grid">
        <article className="panel">
          <h2>Local Preview</h2>
          {renderChangeList(status.localChanges, 'No local changes queued.')}
        </article>
        <article className="panel">
          <h2>Remote Preview</h2>
          {renderChangeList(status.remoteChanges, 'No remote changes waiting.')}
        </article>
      </section>

      <section className="panel">
        <h2>Resolution Strategy</h2>
        <div className="strategy-grid">
          <article className="strategy-card">
            <div>
              <strong>Keep Local Changes</strong>
              <p>
                Preserve local edits, consume remote previews, and leave local changes ready
                to push.
              </p>
            </div>
            <button
              type="button"
              onClick={onResolveKeepLocal}
              disabled={isBusy || !hasConflictWork}
            >
              Keep Local
            </button>
          </article>
          <article className="strategy-card strategy-danger">
            <div>
              <strong>Accept Remote State</strong>
              <p>
                Drop local previews, consume remote previews, and align the mock workspace
                to remote.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm(
                  'Accept remote will discard local unpushed changes in this mock runtime. Continue?',
                )
                if (confirmed) {
                  await onAcceptRemote()
                }
              }}
              disabled={isBusy || !hasConflictWork}
            >
              Accept Remote
            </button>
          </article>
        </div>
      </section>

      {lastOperation && (
        <section className={operationClassByResult[lastOperation.result]}>
          <div>
            <strong>{lastOperation.title}</strong>
            <span>{formatDate(lastOperation.timestamp)}</span>
          </div>
          <ul>
            {lastOperation.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
