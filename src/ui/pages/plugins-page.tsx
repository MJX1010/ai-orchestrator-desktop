import { useMemo, useState } from 'react'
import type {
  CcSwitchLifecycleAction,
  CcSwitchLifecycleState,
  DesiredPluginState,
  ObservedPluginState,
  PluginCategory,
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

const allProviders = ['all', 'codex', 'claude', 'cc-switch', 'hermes'] as const
type ProviderFilter = (typeof allProviders)[number]

const allCategories = ['all', 'plugin', 'mcp', 'bundled'] as const
type CategoryFilter = (typeof allCategories)[number]

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

const categoryBadgeClass: Record<PluginCategory, string> = {
  mcp: 'badge badge-mcp',
  plugin: 'badge badge-plugin',
  bundled: 'badge badge-bundled',
}

const categoryLabel: Record<PluginCategory, string> = {
  mcp: 'MCP',
  plugin: 'Plugin',
  bundled: 'Bundled',
}

const formatStars = (stars?: number): string => {
  if (!stars) return ''
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`
  return String(stars)
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
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [configDraftByKey, setConfigDraftByKey] = useState<Record<string, string>>({})
  const [configError, setConfigError] = useState<string | null>(null)

  const rows = useMemo<PluginRow[]>(() => {
    return manifests
      .filter(
        (manifest) =>
          (providerFilter === 'all' || manifest.provider === providerFilter) &&
          (categoryFilter === 'all' || manifest.category === categoryFilter),
      )
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
  }, [categoryFilter, desiredPlugins, manifests, observedPlugins, providerFilter])

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

        {/* ── Filters ──────────────────────────────────────── */}
        <div className="filter-bar">
          <div className="filter-group">
            <span className="filter-label">Provider</span>
            <div className="provider-filter">
              {allProviders.map((provider) => (
                <button
                  key={provider}
                  className={provider === providerFilter ? 'chip chip-active' : 'chip'}
                  onClick={() => setProviderFilter(provider)}
                  type="button"
                >
                  {provider.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Type</span>
            <div className="provider-filter">
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  className={cat === categoryFilter ? 'chip chip-active' : 'chip'}
                  onClick={() => setCategoryFilter(cat)}
                  type="button"
                >
                  {cat === 'all' ? 'ALL' : cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────── */}
        <table className="plugin-table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>Type</th>
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
                  <td>
                    <div className="plugin-name-cell">
                      <strong>{row.manifest.displayName}</strong>
                      {row.manifest.stars ? (
                        <span className="stars-badge">★ {formatStars(row.manifest.stars)}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <span className={categoryBadgeClass[row.manifest.category]}>
                      {categoryLabel[row.manifest.category]}
                    </span>
                  </td>
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
                <td colSpan={7} className="empty-state">
                  No plugins found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── Detail Panel ─────────────────────────────────── */}
      <section className="panel">
        <h2>Plugin Detail</h2>
        {selectedRow ? (
          <>
            {/* ── Metadata ───────────────────────────────── */}
            <div className="plugin-detail-header">
              <div className="plugin-detail-title">
                <h3>{selectedRow.manifest.displayName}</h3>
                <span className={categoryBadgeClass[selectedRow.manifest.category]}>
                  {categoryLabel[selectedRow.manifest.category]}
                </span>
              </div>
              {selectedRow.manifest.description && (
                <p className="plugin-description">{selectedRow.manifest.description}</p>
              )}
            </div>

            <div className="kv-grid">
              <span>Provider</span>
              <strong>{selectedRow.manifest.provider}</strong>
              <span>Source</span>
              <strong>{selectedRow.manifest.source}</strong>
              <span>Default Version</span>
              <strong>{selectedRow.manifest.defaultVersion}</strong>
              {selectedRow.manifest.stars ? (
                <>
                  <span>GitHub Stars</span>
                  <strong>★ {selectedRow.manifest.stars.toLocaleString()}</strong>
                </>
              ) : null}
              {selectedRow.manifest.repoUrl ? (
                <>
                  <span>Repository</span>
                  <strong>
                    <a
                      href={selectedRow.manifest.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {selectedRow.manifest.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </strong>
                </>
              ) : null}
              {selectedRow.manifest.installCommand ? (
                <>
                  <span>Install</span>
                  <strong>
                    <code className="install-cmd">{selectedRow.manifest.installCommand}</code>
                  </strong>
                </>
              ) : null}
              <span>Config Path</span>
              <strong className="monospace">{selectedRow.manifest.configPath}</strong>
            </div>

            {/* ── cc-switch Lifecycle ─────────────────────── */}
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
                    disabled={isBusy || selectedLifecycle.status !== 'update-available'}
                  >
                    Upgrade
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRunCcSwitchLifecycleAction(selectedLifecycle.pluginId, 'enable')
                    }
                    disabled={
                      isBusy || !selectedLifecycle.installed || selectedLifecycle.enabled
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
                      isBusy || !selectedLifecycle.installed || !selectedLifecycle.enabled
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

            {/* ── Config Editor ──────────────────────────── */}
            <h3>Configuration</h3>
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
          <p className="empty-state">Select a plugin to view details.</p>
        )}
      </section>
    </div>
  )
}
