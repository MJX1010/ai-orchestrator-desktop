import { useCallback, useEffect, useRef, useState } from 'react'
import { MockOrchestrator } from '../../core/orchestrator'
import type {
  AppSnapshot,
  CcSwitchLifecycleAction,
  GitDivergenceResolution,
  Provider,
} from '../../shared/types'

type Action = (orchestrator: MockOrchestrator) => Promise<void>

export const useOrchestrator = () => {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const orchestratorRef = useRef<MockOrchestrator | null>(null)

  const refreshSnapshot = useCallback(() => {
    if (!orchestratorRef.current) {
      return
    }
    setSnapshot(orchestratorRef.current.getSnapshot())
  }, [])

  useEffect(() => {
    let isMounted = true
    const bootstrap = async () => {
      try {
        const orchestrator = await MockOrchestrator.bootstrap()
        if (!isMounted) {
          return
        }
        orchestratorRef.current = orchestrator
        setSnapshot(orchestrator.getSnapshot())
      } catch (bootstrapError) {
        if (!isMounted) {
          return
        }
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : 'Failed to initialize orchestrator',
        )
      }
    }
    bootstrap()

    return () => {
      isMounted = false
    }
  }, [])

  const runAction = useCallback(
    async (action: Action) => {
      if (!orchestratorRef.current) {
        return
      }

      setError(null)
      setIsBusy(true)
      try {
        await action(orchestratorRef.current)
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Operation failed')
      } finally {
        refreshSnapshot()
        setIsBusy(false)
      }
    },
    [refreshSnapshot],
  )

  const refresh = useCallback(async () => {
    await runAction(async (orchestrator) => {
      await Promise.all([
        orchestrator.refreshObserved(),
        orchestrator.refreshReadOnlyIntegrations(),
      ])
    })
  }, [runAction])

  const togglePluginEnabled = useCallback(
    async (provider: Provider, pluginId: string, enabled: boolean) => {
      await runAction(async (orchestrator) =>
        orchestrator.setPluginEnabled(provider, pluginId, enabled),
      )
    },
    [runAction],
  )

  const savePluginConfig = useCallback(
    async (provider: Provider, pluginId: string, values: Record<string, unknown>) => {
      await runAction(async (orchestrator) =>
        orchestrator.savePluginConfig(provider, pluginId, values),
      )
    },
    [runAction],
  )

  const reconcileDryRun = useCallback(async () => {
    await runAction(async (orchestrator) => {
      await orchestrator.runReconcile(true)
    })
  }, [runAction])

  const reconcileApply = useCallback(async () => {
    await runAction(async (orchestrator) => {
      await orchestrator.runReconcile(false)
    })
  }, [runAction])

  const syncPull = useCallback(async () => {
    await runAction(async (orchestrator) => orchestrator.gitSync('pull'))
  }, [runAction])

  const syncPush = useCallback(async () => {
    await runAction(async (orchestrator) => orchestrator.gitSync('push'))
  }, [runAction])

  const resolveGitDivergence = useCallback(
    async (strategy: GitDivergenceResolution) => {
      await runAction(async (orchestrator) => orchestrator.resolveGitDivergence(strategy))
    },
    [runAction],
  )

  const runCcSwitchLifecycleAction = useCallback(
    async (pluginId: string, action: CcSwitchLifecycleAction) => {
      await runAction(async (orchestrator) =>
        orchestrator.runCcSwitchLifecycleAction(pluginId, action),
      )
    },
    [runAction],
  )

  return {
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
  }
}
