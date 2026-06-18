import { isTauriRuntime } from './tauri.ts'
import type {
  CcSwitchProvidersSnapshot,
  InjectPluginStateResult,
  InjectStatusLineResult,
} from './types.ts'

export const DEFAULT_STATUS_LINE: Readonly<Record<string, unknown>> = Object.freeze({
  type: 'command',
  command: 'npx -y ccstatusline@latest',
  padding: 0,
})

export const createUnavailableProvidersSnapshot = (
  dbPath: string,
  appType: string,
  error: string,
): CcSwitchProvidersSnapshot => ({
  available: false,
  dbPath,
  appType,
  providers: [],
  error,
})

export const loadCcSwitchProvidersSnapshot = async (
  ccswitchConfigDir: string,
  appType: string = 'claude',
): Promise<CcSwitchProvidersSnapshot> => {
  const fallbackDbPath = `${ccswitchConfigDir}/cc-switch.db`

  if (!isTauriRuntime()) {
    return createUnavailableProvidersSnapshot(
      fallbackDbPath,
      appType,
      'Tauri runtime not available (web preview)',
    )
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<CcSwitchProvidersSnapshot>('ccswitch_list_providers', {
      ccswitchConfigDir,
      appTypeFilter: appType,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return createUnavailableProvidersSnapshot(fallbackDbPath, appType, message)
  }
}

export const isCcSwitchProcessRunning = async (): Promise<boolean> => {
  if (!isTauriRuntime()) {
    return false
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('ccswitch_process_running')
  } catch {
    return false
  }
}

export const backupCcSwitchDatabase = async (
  ccswitchConfigDir: string,
): Promise<string> => {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime not available (web preview)')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<string>('ccswitch_backup_database', { ccswitchConfigDir })
}

export const injectStatusLineToAllProviders = async (
  ccswitchConfigDir: string,
  appType: string = 'claude',
  statusLine: Record<string, unknown> = DEFAULT_STATUS_LINE as Record<string, unknown>,
): Promise<InjectStatusLineResult> => {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime not available (web preview)')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<InjectStatusLineResult>('ccswitch_inject_status_line', {
    ccswitchConfigDir,
    appType,
    statusLine,
  })
}

export const injectPluginStateToAllProviders = async (
  ccswitchConfigDir: string,
  claudeConfigDir: string,
): Promise<InjectPluginStateResult> => {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime not available (web preview)')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<InjectPluginStateResult>('ccswitch_inject_plugin_state', {
    ccswitchConfigDir,
    claudeConfigDir,
  })
}
