import { useState } from 'react'
import type { McpServerEntry, McpToggleRequest } from '../../shared/types'

interface McpPageProps {
  servers: McpServerEntry[]
  onToggle: (request: McpToggleRequest) => Promise<void>
  isBusy: boolean
}

const appColumns = [
  { key: 'claude' as const, label: 'Claude' },
  { key: 'codex' as const, label: 'Codex' },
  { key: 'hermes' as const, label: 'Hermes' },
]

export const McpPage = ({ servers, onToggle, isBusy }: McpPageProps) => {
  const [selectedId, setSelectedId] = useState<string>('')

  const selected = servers.find((s) => s.id === selectedId) ?? servers[0]

  return (
    <div className="plugins-layout">
      <section className="panel">
        <h2>MCP Servers</h2>
        <p className="muted">
          Unified MCP server management. Toggle per-app enable/disable from one place.
        </p>

        <table className="plugin-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>Source</th>
              {appColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr
                key={server.id}
                className={server.id === (selected?.id ?? '') ? 'row-selected' : ''}
                onClick={() => setSelectedId(server.id)}
              >
                <td>
                  <div className="plugin-name-cell">
                    <strong>{server.name}</strong>
                  </div>
                </td>
                <td>
                  <span
                    className={
                      server.source === 'registry' ? 'badge badge-mcp' : 'badge badge-bundled'
                    }
                  >
                    {server.source}
                  </span>
                </td>
                {appColumns.map((col) => (
                  <td key={col.key}>
                    <button
                      type="button"
                      className={
                        server[`enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof McpServerEntry]
                          ? 'toggle-btn toggle-on'
                          : 'toggle-btn toggle-off'
                      }
                      disabled={isBusy}
                      onClick={async (e) => {
                        e.stopPropagation()
                        await onToggle({
                          serverId: server.id,
                          app: col.key,
                          enabled: !server[
                            `enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof McpServerEntry
                          ],
                        })
                      }}
                    >
                      {server[`enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof McpServerEntry]
                        ? 'ON'
                        : 'OFF'}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
            {!servers.length && (
              <tr>
                <td colSpan={5} className="empty-state">
                  No MCP servers discovered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Server Detail</h2>
        {selected ? (
          <>
            <div className="plugin-detail-header">
              <div className="plugin-detail-title">
                <h3>{selected.name}</h3>
                <span
                  className={
                    selected.source === 'registry' ? 'badge badge-mcp' : 'badge badge-bundled'
                  }
                >
                  {selected.source}
                </span>
              </div>
              {selected.description && (
                <p className="plugin-description">{selected.description}</p>
              )}
            </div>

            <div className="kv-grid">
              <span>Command</span>
              <strong>
                <code className="install-cmd">
                  {selected.command} {selected.args.join(' ')}
                </code>
              </strong>
              {selected.repoUrl ? (
                <>
                  <span>Repository</span>
                  <strong>
                    <a
                      href={selected.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {selected.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </strong>
                </>
              ) : null}
              {selected.installCommand ? (
                <>
                  <span>Install</span>
                  <strong>
                    <code className="install-cmd">{selected.installCommand}</code>
                  </strong>
                </>
              ) : null}
              {selected.lastSyncAt ? (
                <>
                  <span>Last Sync</span>
                  <strong>{new Date(selected.lastSyncAt).toLocaleString()}</strong>
                </>
              ) : null}
            </div>

            <h3>Per-App Status</h3>
            <div className="mcp-app-grid">
              {appColumns.map((col) => {
                const enabled =
                  selected[
                    `enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof McpServerEntry
                  ]
                return (
                  <div key={col.key} className="mcp-app-card">
                    <span>{col.label}</span>
                    <strong className={enabled ? 'text-ok' : 'text-muted'}>
                      {enabled ? 'Enabled' : 'Disabled'}
                    </strong>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="empty-state">Select an MCP server to view details.</p>
        )}
      </section>
    </div>
  )
}
