import { ClaudeProviderAdapter } from './claude-provider-adapter'
import { CcSwitchProviderAdapter } from './ccswitch-provider-adapter'
import { CodexProviderAdapter } from './codex-provider-adapter'
import { HermesProviderAdapter } from './hermes-provider-adapter'
import type { ProviderAdapter } from './provider-adapter'
import type {
  AppSettings,
  CcSwitchLifecycleState,
  DesiredPluginState,
  PluginManifest,
} from '../shared/types'

export const createProviderAdapters = (
  manifests: PluginManifest[],
  desiredPlugins: DesiredPluginState[],
  settings: AppSettings,
  ccSwitchLifecycle: CcSwitchLifecycleState[] = [],
): ProviderAdapter[] => {
  const codexAdapter = new CodexProviderAdapter(
    manifests.filter((manifest) => manifest.provider === 'codex'),
    desiredPlugins.filter((plugin) => plugin.provider === 'codex'),
    settings.paths.codexScriptsDir,
  )

  const claudeAdapter = new ClaudeProviderAdapter(
    manifests.filter((manifest) => manifest.provider === 'claude'),
    desiredPlugins.filter((plugin) => plugin.provider === 'claude'),
    settings.paths.claudeConfigDir,
  )

  const ccSwitchAdapter = new CcSwitchProviderAdapter(
    manifests.filter((manifest) => manifest.provider === 'cc-switch'),
    desiredPlugins.filter((plugin) => plugin.provider === 'cc-switch'),
    settings.paths.ccSwitchConfigDir,
    ccSwitchLifecycle,
  )

  const hermesAdapter = new HermesProviderAdapter(
    manifests.filter((manifest) => manifest.provider === 'hermes'),
    desiredPlugins.filter((plugin) => plugin.provider === 'hermes'),
    settings.paths.hermesConfigDir,
    settings.paths.hermesSkillsDir,
  )

  return [codexAdapter, claudeAdapter, ccSwitchAdapter, hermesAdapter]
}
