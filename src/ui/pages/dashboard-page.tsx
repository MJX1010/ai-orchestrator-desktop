import type { GitSyncStatus, OperationLog } from '../../shared/types'

interface DashboardPageProps {
  installedCount: number
  enabledCount: number
  errorCount: number
  pendingCount: number
  syncStatus: GitSyncStatus
  operations: OperationLog[]
}

const formatDate = (value?: string) => {
  if (!value) {
    return 'Never'
  }
  return new Date(value).toLocaleString()
}

export const DashboardPage = ({
  installedCount,
  enabledCount,
  errorCount,
  pendingCount,
  syncStatus,
  operations,
}: DashboardPageProps) => (
  <div className="page-stack">
    <section className="panel">
      <h2>System Summary</h2>
      <div className="summary-grid">
        <article className="summary-card">
          <span>Installed</span>
          <strong>{installedCount}</strong>
        </article>
        <article className="summary-card">
          <span>Enabled</span>
          <strong>{enabledCount}</strong>
        </article>
        <article className="summary-card">
          <span>Errors</span>
          <strong>{errorCount}</strong>
        </article>
        <article className="summary-card">
          <span>Pending Plan Items</span>
          <strong>{pendingCount}</strong>
        </article>
      </div>
    </section>

    <section className="panel">
      <h2>Git Sync</h2>
      <div className="kv-grid">
        <span>Repository</span>
        <strong>{syncStatus.repositoryUrl}</strong>
        <span>Branch</span>
        <strong>{syncStatus.branch}</strong>
        <span>Ahead / Behind</span>
        <strong>
          {syncStatus.ahead} / {syncStatus.behind}
        </strong>
        <span>Last Sync</span>
        <strong>{formatDate(syncStatus.lastSyncAt)}</strong>
      </div>
    </section>

    <section className="panel">
      <h2>Recent Operations</h2>
      <ul className="operation-list">
        {operations.slice(0, 6).map((operation) => (
          <li key={operation.operationId}>
            <div>
              <strong>{operation.title}</strong>
              <span>{formatDate(operation.completedAt ?? operation.timestamp)}</span>
            </div>
            <p>{operation.details[0] ?? 'No details yet'}</p>
          </li>
        ))}
        {!operations.length && <li className="empty-state">No operations yet.</li>}
      </ul>
    </section>
  </div>
)
