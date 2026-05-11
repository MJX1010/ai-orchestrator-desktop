import type {
  DesiredState,
  ObservedState,
  PluginManifest,
  ReconcilePlanItem,
} from '../shared/types'

const buildObservedIndex = (observedState: ObservedState) =>
  new Map(
    observedState.plugins.map((plugin) => [
      `${plugin.provider}:${plugin.pluginId}`,
      plugin,
    ]),
  )

const buildManifestIndex = (manifests: PluginManifest[]) =>
  new Map(
    manifests.map((manifest) => [`${manifest.provider}:${manifest.pluginId}`, manifest]),
  )

export const buildReconcilePlan = (
  desiredState: DesiredState,
  observedState: ObservedState,
  manifests: PluginManifest[],
): ReconcilePlanItem[] => {
  const observedIndex = buildObservedIndex(observedState)
  const manifestIndex = buildManifestIndex(manifests)

  return desiredState.plugins.map((desiredPlugin) => {
    const pluginKey = `${desiredPlugin.provider}:${desiredPlugin.pluginId}`
    const observedPlugin = observedIndex.get(pluginKey)
    const manifest = manifestIndex.get(pluginKey)

    if (!observedPlugin || !manifest) {
      return {
        provider: desiredPlugin.provider,
        pluginId: desiredPlugin.pluginId,
        action: 'install',
        reason: 'Plugin missing in observed state',
      }
    }

    if (desiredPlugin.enabled && !observedPlugin.installed) {
      return {
        provider: desiredPlugin.provider,
        pluginId: desiredPlugin.pluginId,
        action: 'install',
        reason: 'Desired enabled but plugin is not installed',
      }
    }

    if (desiredPlugin.enabled && observedPlugin.installed && !observedPlugin.enabled) {
      return {
        provider: desiredPlugin.provider,
        pluginId: desiredPlugin.pluginId,
        action: 'enable',
        reason: 'Desired enabled but plugin is disabled',
      }
    }

    if (
      desiredPlugin.enabled &&
      desiredPlugin.versionPolicy === 'latest' &&
      observedPlugin.installed &&
      observedPlugin.installedVersion !== manifest.defaultVersion
    ) {
      return {
        provider: desiredPlugin.provider,
        pluginId: desiredPlugin.pluginId,
        action: 'upgrade',
        reason: `Version drift: ${observedPlugin.installedVersion ?? 'none'} -> ${manifest.defaultVersion}`,
      }
    }

    if (!desiredPlugin.enabled && observedPlugin.enabled) {
      return {
        provider: desiredPlugin.provider,
        pluginId: desiredPlugin.pluginId,
        action: 'disable',
        reason: 'Desired disabled but plugin is enabled',
      }
    }

    return {
      provider: desiredPlugin.provider,
      pluginId: desiredPlugin.pluginId,
      action: 'noop',
      reason: 'Already converged',
    }
  })
}
