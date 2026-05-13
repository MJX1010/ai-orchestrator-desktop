import { useMemo, useState } from 'react'
import './App.css'
import { useOrchestrator } from './ui/hooks/use-orchestrator'
import { DashboardPage } from './ui/pages/dashboard-page'
import { PluginsPage } from './ui/pages/plugins-page'
import { ProfilesPage } from './ui/pages/profiles-page'
import { SettingsPage } from './ui/pages/settings-page'
import { SyncPage } from './ui/pages/sync-page'

type AppPage = 'dashboard' | 'plugins' | 'profiles' | 'sync' | 'settings'

const navigation: Array<{ key: AppPage; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'plugins', label: 'Plugins' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'sync', label: 'Sync' },
  { key: 'settings', label: 'Settings' },
]

function App() {
  const [activePage, setActivePage] = useState<AppPage>('dashboard')
  const {
    snapshot,
    isBusy,
    error,
    refresh,
    togglePluginEnabled,
    savePluginConfig,
    reconcileDryRun,
    reconcileApply,
    syncPull,
    syncPush,
    resolveGitDivergence,
    runCcSwitchLifecycleAction,
  } = useOrchestrator()

  const summary = useMemo(() => {
    if (!snapshot) {
      return { installed: 0, enabled: 0, errors: 0, pending: 0 }
    }
    const installed = snapshot.observedState.plugins.filter((plugin) => plugin.installed).length
    const enabled = snapshot.observedState.plugins.filter((plugin) => plugin.enabled).length
    const errors = snapshot.observedState.plugins.filter((plugin) => plugin.health === 'error').length
    const pending = snapshot.lastPlan.filter((item) => item.action !== 'noop').length
    return { installed, enabled, errors, pending }
  }, [snapshot])

  if (!snapshot) {
    return (
      <main className="loading-shell">
        <h1>AI Orchestrator Desktop</h1>
        <p>Initializing orchestrator...</p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>AI Hub</h1>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.key}
              className={item.key === activePage ? 'nav-item nav-item-active' : 'nav-item'}
              onClick={() => setActivePage(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <strong>AI Plugin Orchestrator</strong>
            <p>Windows V1 · Codex / Claude / cc-switch</p>
          </div>
          <div className="actions">
            <button type="button" onClick={refresh} disabled={isBusy}>
              Refresh
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {activePage === 'dashboard' && (
          <DashboardPage
            installedCount={summary.installed}
            enabledCount={summary.enabled}
            errorCount={summary.errors}
            pendingCount={summary.pending}
            syncStatus={snapshot.syncStatus}
            operations={snapshot.operations}
          />
        )}

        {activePage === 'plugins' && (
          <PluginsPage
            manifests={snapshot.manifests}
            desiredPlugins={snapshot.desiredState.plugins}
            observedPlugins={snapshot.observedState.plugins}
            ccSwitchLifecycle={snapshot.ccSwitchLifecycle}
            isBusy={isBusy}
            onToggle={togglePluginEnabled}
            onSaveConfig={savePluginConfig}
            onRunCcSwitchLifecycleAction={runCcSwitchLifecycleAction}
          />
        )}

        {activePage === 'profiles' && (
          <ProfilesPage
            currentProfile={snapshot.desiredState.profileName}
            profiles={snapshot.profiles}
            plan={snapshot.lastPlan}
            lastReconciledAt={snapshot.observedState.lastReconciledAt}
            isBusy={isBusy}
            ccSwitchConfigDir={snapshot.settings.paths.ccSwitchConfigDir}
            onDryRun={reconcileDryRun}
            onApply={reconcileApply}
          />
        )}

        {activePage === 'sync' && (
          <SyncPage
            status={snapshot.syncStatus}
            gitReadOnlyStatus={snapshot.gitReadOnlyStatus}
            isBusy={isBusy}
            onPull={syncPull}
            onPush={syncPush}
            onResolveKeepLocal={() => resolveGitDivergence('keep-local')}
            onAcceptRemote={() => resolveGitDivergence('accept-remote')}
          />
        )}

        {activePage === 'settings' && <SettingsPage settings={snapshot.settings} />}
      </section>
    </div>
  )
}

export default App
