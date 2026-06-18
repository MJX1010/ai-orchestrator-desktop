import { useState } from 'react'
import type { SkillEntry } from '../../shared/types'

interface SkillsPageProps {
  skills: SkillEntry[]
  isBusy: boolean
}

const appColumns = [
  { key: 'claude' as const, label: 'Claude' },
  { key: 'codex' as const, label: 'Codex' },
  { key: 'hermes' as const, label: 'Hermes' },
]

export const SkillsPage = ({ skills, isBusy }: SkillsPageProps) => {
  const [selectedId, setSelectedId] = useState<string>('')

  const selected = skills.find((s) => s.id === selectedId) ?? skills[0]

  void isBusy // reserved for future install/update actions

  return (
    <div className="plugins-layout">
      <section className="panel">
        <h2>Skills (SSOT)</h2>
        <p className="muted">
          Single Source of Truth — one install, symlink/copy to each app. Inspired by cc-switch
          v3.10+ architecture.
        </p>

        <table className="plugin-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Version</th>
              <th>Sync</th>
              {appColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr
                key={skill.id}
                className={skill.id === (selected?.id ?? '') ? 'row-selected' : ''}
                onClick={() => setSelectedId(skill.id)}
              >
                <td>
                  <div className="plugin-name-cell">
                    <strong>{skill.name}</strong>
                  </div>
                </td>
                <td>{skill.version}</td>
                <td>
                  <span className={skill.syncMethod === 'symlink' ? 'badge badge-mcp' : 'badge badge-plugin'}>
                    {skill.syncMethod}
                  </span>
                </td>
                {appColumns.map((col) => {
                  const enabled =
                    skill[`enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof SkillEntry]
                  return (
                    <td key={col.key}>
                      <span className={enabled ? 'badge badge-ok' : 'badge badge-warn'}>
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
            {!skills.length && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No skills installed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Skill Detail</h2>
        {selected ? (
          <>
            <div className="plugin-detail-header">
              <div className="plugin-detail-title">
                <h3>{selected.name}</h3>
                <span
                  className={
                    selected.syncMethod === 'symlink' ? 'badge badge-mcp' : 'badge badge-plugin'
                  }
                >
                  {selected.syncMethod}
                </span>
              </div>
              {selected.description && (
                <p className="plugin-description">{selected.description}</p>
              )}
            </div>

            <div className="kv-grid">
              <span>Version</span>
              <strong>{selected.version}</strong>
              <span>Source</span>
              <strong>
                {selected.sourceRepo ? (
                  <a
                    href={`https://github.com/${selected.sourceRepo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    {selected.sourceRepo}
                  </a>
                ) : (
                  'local'
                )}
              </strong>
              <span>Content Hash</span>
              <strong className="monospace">{selected.contentHash}</strong>
              <span>Installed</span>
              <strong>{new Date(selected.installedAt).toLocaleDateString()}</strong>
              <span>Updated</span>
              <strong>{new Date(selected.updatedAt).toLocaleDateString()}</strong>
              <span>SSOT Path</span>
              <strong className="monospace">{selected.sourcePath}</strong>
            </div>

            <h3>Per-App Enable</h3>
            <div className="mcp-app-grid">
              {appColumns.map((col) => {
                const enabled =
                  selected[
                    `enabled${col.key.charAt(0).toUpperCase() + col.key.slice(1)}` as keyof SkillEntry
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
          <p className="empty-state">Select a skill to view details.</p>
        )}
      </section>
    </div>
  )
}
