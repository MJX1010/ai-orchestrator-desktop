import { useEffect, useState } from 'react'
import type {
  CcSwitchProvidersSnapshot,
  InjectStatusLineResult,
  ReconcilePlanItem,
} from '../../shared/types'
import {
  DEFAULT_STATUS_LINE,
  injectStatusLineToAllProviders,
  isCcSwitchProcessRunning,
  loadCcSwitchProvidersSnapshot,
} from '../../shared/ccswitch-providers'

interface ProfilesPageProps {
  currentProfile: string
  profiles: string[]
  plan: ReconcilePlanItem[]
  lastReconciledAt?: string
  isBusy: boolean
  ccSwitchConfigDir: string
  onDryRun: () => Promise<void>
  onApply: () => Promise<void>
}

const formatDate = (value?: string) => {
  if (!value) {
    return 'Never'
  }
  return new Date(value).toLocaleString()
}

const truncate = (value: string, limit = 48) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value

export const ProfilesPage = ({
  currentProfile,
  profiles,
  plan,
  lastReconciledAt,
  isBusy,
  ccSwitchConfigDir,
  onDryRun,
  onApply,
}: ProfilesPageProps) => {
  const [providersSnapshot, setProvidersSnapshot] =
    useState<CcSwitchProvidersSnapshot | null>(null)
  const [providersLoading, setProvidersLoading] = useState(false)
  const [checkingProcess, setCheckingProcess] = useState(false)
  const [injecting, setInjecting] = useState(false)
  const [injectError, setInjectError] = useState<string | null>(null)
  const [lastInject, setLastInject] = useState<InjectStatusLineResult | null>(null)

  const fetchProviders = async () => {
    const result = await loadCcSwitchProvidersSnapshot(ccSwitchConfigDir, 'claude')
    setProvidersSnapshot(result)
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setProvidersLoading(true)
      try {
        const result = await loadCcSwitchProvidersSnapshot(ccSwitchConfigDir, 'claude')
        if (!cancelled) {
          setProvidersSnapshot(result)
        }
      } finally {
        if (!cancelled) {
          setProvidersLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [ccSwitchConfigDir])

  const reloadProviders = async () => {
    setProvidersLoading(true)
    try {
      await fetchProviders()
    } finally {
      setProvidersLoading(false)
    }
  }

  const handleFixAll = async () => {
    setInjectError(null)
    setLastInject(null)

    try {
      setCheckingProcess(true)
      const running = await isCcSwitchProcessRunning()
      if (running) {
        setInjectError(
          'cc-switch is currently running. Please exit it from the system tray (right-click → Quit) and try again.',
        )
        return
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setInjectError(message)
      return
    } finally {
      setCheckingProcess(false)
    }

    setInjecting(true)
    try {
      const result = await injectStatusLineToAllProviders(
        ccSwitchConfigDir,
        'claude',
        DEFAULT_STATUS_LINE as Record<string, unknown>,
      )
      setLastInject(result)
      await fetchProviders()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setInjectError(message)
    } finally {
      setInjecting(false)
    }
  }

  const providers = providersSnapshot?.providers ?? []
  const fixBusy = checkingProcess || injecting
  const missingStatusLineCount = providers.filter(
    (provider) => !provider.hasStatusLine,
  ).length

  return (
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
        <header className="panel-header">
          <h2>cc-switch SQLite Providers (claude)</h2>
          <button type="button" onClick={reloadProviders} disabled={providersLoading || fixBusy}>
            {providersLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {!providersSnapshot && providersLoading && (
          <p className="empty-state">Loading providers…</p>
        )}

        {providersSnapshot && !providersSnapshot.available && (
          <p className="error-banner">
            Cannot read cc-switch DB: {providersSnapshot.error ?? 'unknown error'}
          </p>
        )}

        {providersSnapshot?.available && providers.length === 0 && (
          <p className="empty-state">No claude providers found in cc-switch.</p>
        )}

        {providersSnapshot?.available && providers.length > 0 && (
          <>
            {missingStatusLineCount > 0 && (
              <div className="error-banner">
                <span>
                  {missingStatusLineCount} provider(s) missing <code>statusLine</code>.
                  Switching to them will wipe <code>~/.claude/settings.json</code>.
                </span>
                <button
                  type="button"
                  onClick={handleFixAll}
                  disabled={fixBusy}
                  style={{ marginLeft: 'auto' }}
                >
                  {checkingProcess
                    ? 'Checking cc-switch…'
                    : injecting
                      ? 'Injecting…'
                      : `Fix all (inject statusLine into ${providers.length})`}
                </button>
              </div>
            )}

            {injectError && (
              <p className="error-banner">{injectError}</p>
            )}

            {lastInject && (
              <p className="muted">
                Injected statusLine into {lastInject.updatedCount} provider(s).
                Backup saved to <code>{lastInject.backupPath}</code>
                {lastInject.statusLineCommand
                  ? <> · command: <code>{lastInject.statusLineCommand}</code></>
                  : null}
                .
              </p>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>statusLine</th>
                  <th>Command</th>
                  <th>Current</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr
                    key={`${provider.appType}:${provider.id}`}
                    className={!provider.hasStatusLine ? 'row-warning' : undefined}
                  >
                    <td>{provider.name}</td>
                    <td><code>{provider.id}</code></td>
                    <td>{provider.hasStatusLine ? '✓' : '⚠ missing'}</td>
                    <td>
                      {provider.hasStatusLine && provider.statusLineCommand
                        ? <code>{truncate(provider.statusLineCommand)}</code>
                        : '—'}
                    </td>
                    <td>{provider.isCurrent ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              DB: <code>{providersSnapshot.dbPath}</code>
            </p>
          </>
        )}
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
}
