import type { AppSettings } from '../../shared/types'

interface SettingsPageProps {
  settings: AppSettings
}

export const SettingsPage = ({ settings }: SettingsPageProps) => (
  <div className="page-stack">
    <section className="panel">
      <h2>Path Configuration</h2>
      <div className="kv-grid">
        <span>Codex Scripts</span>
        <strong>{settings.paths.codexScriptsDir}</strong>
        <span>Claude Config</span>
        <strong>{settings.paths.claudeConfigDir}</strong>
        <span>CC Switch Config</span>
        <strong>{settings.paths.ccSwitchConfigDir}</strong>
        <span>CC Switch DB</span>
        <strong>{settings.paths.ccSwitchDatabasePath}</strong>
        <span>Git Repo</span>
        <strong>{settings.paths.gitRepoUrl}</strong>
        <span>Git Local Path</span>
        <strong>{settings.paths.gitRepoDir}</strong>
        <span>Git Branch</span>
        <strong>{settings.paths.gitBranch}</strong>
      </div>
    </section>

    <section className="panel">
      <h2>Execution Strategy</h2>
      <div className="kv-grid">
        <span>Run Mode</span>
        <strong>{settings.execution.runMode}</strong>
        <span>Timeout (seconds)</span>
        <strong>{settings.execution.timeoutSeconds}</strong>
        <span>Auto Retry</span>
        <strong>{settings.execution.autoRetry ? 'Enabled' : 'Disabled'}</strong>
        <span>Confirm Destructive Action</span>
        <strong>
          {settings.execution.requireConfirmForDestructive ? 'Required' : 'Not Required'}
        </strong>
      </div>
    </section>
  </div>
)
