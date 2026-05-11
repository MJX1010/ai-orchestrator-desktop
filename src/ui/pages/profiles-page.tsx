import type { ReconcilePlanItem } from '../../shared/types'

interface ProfilesPageProps {
  currentProfile: string
  profiles: string[]
  plan: ReconcilePlanItem[]
  lastReconciledAt?: string
  isBusy: boolean
  onDryRun: () => Promise<void>
  onApply: () => Promise<void>
}

const formatDate = (value?: string) => {
  if (!value) {
    return 'Never'
  }
  return new Date(value).toLocaleString()
}

export const ProfilesPage = ({
  currentProfile,
  profiles,
  plan,
  lastReconciledAt,
  isBusy,
  onDryRun,
  onApply,
}: ProfilesPageProps) => (
  <div className="page-stack">
    <section className="panel">
      <h2>Profiles</h2>
      <p>Current profile: <strong>{currentProfile}</strong></p>
      <div className="chip-list">
        {profiles.map((profile) => (
          <span
            key={profile}
            className={profile === currentProfile ? 'chip chip-active' : 'chip'}
          >
            {profile}
          </span>
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={onDryRun} disabled={isBusy}>
          Dry Run Reconcile
        </button>
        <button type="button" onClick={onApply} disabled={isBusy}>
          Apply Reconcile
        </button>
      </div>
      <p>Last reconciled: {formatDate(lastReconciledAt)}</p>
    </section>

    <section className="panel">
      <h2>Current Plan</h2>
      <ul className="operation-list">
        {plan.map((item) => (
          <li key={`${item.provider}:${item.pluginId}:${item.action}`}>
            <div>
              <strong>
                [{item.provider}] {item.pluginId}
              </strong>
              <span>{item.action.toUpperCase()}</span>
            </div>
            <p>{item.reason}</p>
          </li>
        ))}
        {!plan.length && <li className="empty-state">Run dry-run to generate plan.</li>}
      </ul>
    </section>
  </div>
)
