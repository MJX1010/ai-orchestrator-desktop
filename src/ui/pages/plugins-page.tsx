import { useMemo, useState } from 'react'
import type {
  CcSwitchLifecycleAction,
  CcSwitchLifecycleState,
  DesiredPluginState,
  ObservedPluginState,
  PluginManifest,
  Provider,
} from '../../shared/types'

interface PluginsPageProps {
  manifests: PluginManifest[]
  desiredPlugins: DesiredPluginState[]
  observedPlugins: ObservedPluginState[]
  ccSwitchLifecycle: CcSwitchLifecycleState[]
  isBusy: boolean
  onToggle: (provider: Provider, pluginId: string, enabled: boolean) => Promise<void>
  onSaveConfig: (
    provider: Provider,
    pluginId: string,
    values: Record<string, unknown>,
  ) => Promise<void>
  onRunCcSwitchLifecycleAction: (
    pluginId: string,
    action: CcSwitchLifecycleAction,
  ) => Promise<void>
}

interface PluginRow {
  manifest: PluginManifest
  desired?: DesiredPluginState
  observed?: ObservedPluginState
}

const allProviders = ['all', 'codex', 'claude', 'cc-switch'] as const
type ProviderFilter = (typeof allProviders)[number]

const pluginKey = (provider: Provider, pluginId: string) => `${provider}:${pluginId}`

const healthClass: Record<string, string> = {
  ok: 'badge badge-ok',
  warn: 'badge badge-warn',
  error: 'badge badge-error',
}

const lifecycleBadgeClass: Record<CcSwitchLifecycleState['status'], string> = {
  available: 'badge badge-warn',
  installed: 'badge badge-ok',
  'update-available': 'badge badge-warn',
  'missing-settings': 'badge badge-error',
}

export const PluginsPage = ({
  manifests,
  desiredPlugins,
  observedPlugins,
  ccSwitchLifecycle,
  isBusy,
  onToggle,
  onSaveConfig,
  onRunCcSwitchLifecycleAction,
}: PluginsPageProps) => {
  const [filter, setFilter] = useState<ProviderFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [configDraftByKey, setConfigDraftByKey] = useState<Record<string, string>>({})
  const [configError, setConfigError] = useState<string | null>(null)

  const rows = useMemo<PluginRow[]>(() => {
    return manifests
      .filter((manifest) => filter === 'all' || manifest.provider === filter)
      .map((manifest) => ({
        manifest,
        desired: desiredPlugins.find(
          (plugin) =>
            plugin.provider === manifest.provider && plugin.pluginId === manifest.pluginId,
        ),
        observed: observedPlugins.find(
          (plugin) =>
            plugin.provider === manifest.provider && plugin.pluginId === manifest.pluginId,
        ),
      }))
  }, [desiredPlugins, filter, manifests, observedPlugins])

  const selectedPluginKey = useMemo(() => {
    if (!rows.length) {
      return ''
    }
    const selectedExists = rows.some(
      (row) => pluginKey(row.manifest.provider, row.manifest.pluginId) === selectedKey,
    )
    if (selectedExists) {
      return selectedKey
    }
    return pluginKey(rows[0].manifest.provider, rows[0].manifest.pluginId)
  }, [rows, selectedKey])

  const selectedRow = rows.find(
    (row) => pluginKey(row.manifest.provider, row.manifest.pluginId) === selectedPluginKey,
  )

  const selectedLifecycle = selectedRow
    ? ccSwitchLifecycle.find(
        (state) =>
          state.provider === selectedRow.manifest.provider &&
          state.pluginId === selectedRow.manifest.pluginId,
      )
    : undefined

  const defaultDraft = useMemo(
    () => JSON.stringify(selectedRow?.desired?.configValues ?? {}, null, 2),
    [selectedRow],
  )

  const configDraft =
    selectedPluginKey && configDraftByKey[selectedPluginKey]
      ? configDraftByKey[selectedPluginKey]
      : defaultDraft

  const handleSaveConfig = async () => {
    if (!selectedRow) {
      return
    }
    try {
      const parsed = JSON.parse(configDraft) as Record<string, unknown>
      setConfigError(null)
      setConfigDraftByKey((previousValue) => ({
        ...previousValue,
        [selectedPluginKey]: JSON.stringify(parsed, null, 2),
      }))
      await onSaveConfig(selectedRow.manifest.provider, selectedRow.manifest.pluginId, parsed)
    } catch {
      setConfigError('Config must be valid JSON object.')
    }
  }

  return (
    <div className="plugins-layout">
      <section className="panel">
        <h2>Plugins</h2>
        <div className="provider-filter">
          {allProviders.map((provider) => (
            <button
              key={provider}
              className={provider === filter ? 'chip chip-active' : 'chip'}
              onClick={() => setFilter(provider)}
              type="button"
            >
              {provider.toUpperCase()}
            </button>
          ))}
        </div>
        <table className="plugin-table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>Provider</th>
              <th>Version</th>
              <th>Health</th>
              <th>Enabled</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = pluginKey(row.manifest.provider, row.manifest.pluginId)
              const enabled = Boolean(row.observed?.enabled)
              const installedVersion = row.observed?.installedVersion ?? '-'
              const health = row.observed?.health ?? 'warn'

              return (
                <tr
                  key={rowKey}
                  className={rowKey === selectedPluginKey ? 'row-selected' : ''}
                  onClick={() => {
                    setSelectedKey(rowKey)
                    setConfigError(null)
                  }}
                >
                  <td>{row.manifest.displayName}</td>
                  <td>{row.manifest.provider}</td>
                  <td>{installedVersion}</td>
                  <td>
                    <span className={healthClass[health]}>{health}</span>
                  </td>
                  <td>{enabled ? 'On' : 'Off'}</td>
                  <td>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async (event) => {
                        event.stopPropagation()
                        await onToggle(row.manifest.provider, row.manifest.pluginId, !enabled)
                      }}
                    >
                      {enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No plugins found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Plugin Config</h2>
        {selectedRow ? (
          <>
            <div className="kv-grid">
              <span>Plugin</span>
              <strong>{selectedRow.manifest.displayName}</strong>
              <span>Config Path</span>
              <strong>{selectedRow.manifest.configPath}</strong>
              <span>Schema</span>
              <strong>{selectedRow.manifest.configSchemaRef}</strong>
            </div>

            {selectedLifecycle && (
              <section className="lifecycle-panel">
                <div className="panel-header">
                  <div>
                    <h3>cc-switch Lifecycle</h3>
                    <p>{selectedLifecycle.sqlitePath}</p>
                  </div>
                  <span className={lifecycleBadgeClass[selectedLifecycle.status]}>
                    {selectedLifecycle.status}
                  </span>
                </div>
                <div className="kv-grid compact-grid">
                  <span>Installed</span>
                  <strong>{selectedLifecycle.installed ? 'Yes' : 'No'}</strong>
                  <span>Enabled</span>
                  <strong>{selectedLifecycle.enabled ? 'Yes' : 'No'}</strong>
                  <span>Current</span>
                  <strong>{selectedLifecycle.currentVersion ?? '-'}</strong>
                  <span>Latest</span>
                  <strong>{selectedLifecycle.latestVersion}</strong>
                  <span>Last Action</span>
                  <strong>{selectedLifecycle.lastAction ?? 'None'}</strong>
                  <span>SQLite Read</span>
                  <strong>
                    {selectedLifecycle.realReadAvailable === undefined
                      ? 'Not read'
                      : selectedLifecycle.realReadAvailable
                        ? 'Connected'
                        : 'Unavailable'}
                  </strong>
                  <span>Real Skills</span>
                  <strong>{selectedLifecycle.realSkillsCount ?? '-'}</strong>
                  <span>Claude/Codex</span>
                  <strong>
                    {selectedLifecycle.realEnabledClaudeCount ?? '-'} /{' '}
                    {selectedLifecycle.realEnabledCodexCount ?? '-'}
                  </strong>
                </div>
                {selectedLifecycle.realReadError && (
                  <p className="inline-warning">{selectedLifecycle.realReadError}</p>
                )}
                {Boolean(selectedLifecycle.realSampleSkills?.length) && (
                  <ul className="skill-sample-list">
                    {selectedLifecycle.realSampleSkills?.map((skill) => (
                      <li key={skill.id}>
                        <strong>{skill.name}</strong>
                        <span>{skill.directory}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedLifecycle.lastMessage && (
                  <p className="lifecycle-message">{selectedLifecycle.lastMessage}</p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      onRunCcSwitchLifecycleAction(selectedLifecycle.pluginId, 'install')
                    }
                    disabled={isBusy || selectedLifecycle.installed}
                  >
                    Install
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRunCcSwitchLifecycleAction(selectedLifecycle.pluginId, 'upgrade')
                    }
                    disabled={
                      isBusy || selectedLifecycle.status !== 'update-available'
                    }
                  >
                    Upgrade
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRunCcSwitchLifecycleAction(selectedLifecycle.pluginId, 'enable')
                    }
                    disabled={
                      isBusy ||
                      !selectedLifecycle.installed ||
                      selectedLifecycle.enabled
                    }
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRunCcSwitchLifecycleAction(selectedLifecycle.pluginId, 'disable')
                    }
                    disabled={
                      isBusy ||
                      !selectedLifecycle.installed ||
                      !selectedLifecycle.enabled
                    }
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        'Uninstall will remove this plugin from the simulated cc-switch SQLite lifecycle. Continue?',
                      )
                      if (confirmed) {
                        await onRunCcSwitchLifecycleAction(
                          selectedLifecycle.pluginId,
                          'uninstall',
                        )
                      }
                    }}
                    disabled={isBusy || !selectedLifecycle.installed}
                  >
                    Uninstall
                  </button>
                </div>
              </section>
            )}

            <textarea
              value={configDraft}
              onChange={(event) => {
                if (!selectedPluginKey) {
                  return
                }
                const nextValue = event.target.value
                setConfigDraftByKey((previousValue) => ({
                  ...previousValue,
                  [selectedPluginKey]: nextValue,
                }))
              }}
              rows={14}
            />
            {configError && <p className="error-text">{configError}</p>}
            <div className="actions">
              <button type="button" onClick={handleSaveConfig} disabled={isBusy}>
                Save Config
              </button>
            </div>
          </>
        ) : (
          <p className="empty-state">Select a plugin to edit configuration.</p>
        )}
      </section>
    </div>
  )
}
