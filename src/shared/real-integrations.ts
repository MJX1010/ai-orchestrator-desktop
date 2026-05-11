import type {
  CcSwitchLifecycleState,
  CcSwitchSqliteSnapshot,
  GitReadOnlyStatus,
} from './types'

export const createUnavailableGitStatus = (
  repoPath: string,
  error: string,
): GitReadOnlyStatus => ({
  available: false,
  repoPath,
  ahead: 0,
  behind: 0,
  localChanges: [],
  remoteChanges: [],
  error,
})

export const normalizeSqliteLifecycle = (
  snapshot: CcSwitchSqliteSnapshot,
): Partial<CcSwitchLifecycleState> => ({
  realReadAvailable: snapshot.available,
  realDbPath: snapshot.dbPath,
  realSkillsCount: snapshot.skillsCount,
  realEnabledClaudeCount: snapshot.enabledClaudeCount,
  realEnabledCodexCount: snapshot.enabledCodexCount,
  realLatestSkillUpdatedAt: snapshot.latestSkillUpdatedAt,
  realSampleSkills: snapshot.sampleSkills,
  realReadError: snapshot.error,
})
