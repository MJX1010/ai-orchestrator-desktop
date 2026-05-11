import { invoke } from '@tauri-apps/api/core'
import type {
  ConfigRequest,
  PluginOperationRequest,
  ProviderAdapter,
  StepResult,
} from './provider-adapter'
import type {
  DesiredPluginState,
  ObservedPluginState,
  PluginManifest,
  Provider,
} from '../shared/types'

interface SuperpowerSkill {
  name: string
  enabled: boolean
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const nowMs = () => performance.now()

const toStepResult = (startTime: number, message: string): StepResult => ({
  success: true,
  message,
  durationMs: Math.round(performance.now() - startTime),
})

const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const normalizeSkillList = (skills: string[]) =>
  [...new Set(skills.map((item) => item.trim()).filter(Boolean))]

export class CodexProviderAdapter implements ProviderAdapter {
  public readonly provider: Provider = 'codex'
  private readonly manifestByPluginId: Map<string, PluginManifest>
  private readonly scriptsDir: string
  private readonly fallbackSkillCatalog: string[]
  private fallbackEnabledSkills: string[]

  public constructor(
    manifests: PluginManifest[],
    desiredPlugins: DesiredPluginState[],
    scriptsDir: string,
  ) {
    this.manifestByPluginId = new Map(manifests.map((manifest) => [manifest.pluginId, manifest]))
    this.scriptsDir = scriptsDir
    const desiredWhitelist = desiredPlugins
      .flatMap((plugin) => {
        const whitelist = plugin.configValues.whitelist
        return Array.isArray(whitelist) ? whitelist : []
      })
      .filter((item): item is string => typeof item === 'string')
    this.fallbackEnabledSkills = normalizeSkillList(desiredWhitelist)
    this.fallbackSkillCatalog = normalizeSkillList(['brainstorming', ...desiredWhitelist])
  }

  public async discover(): Promise<ObservedPluginState[]> {
    const states: ObservedPluginState[] = []
    for (const pluginId of this.manifestByPluginId.keys()) {
      if (pluginId === 'superpowers') {
        states.push(await this.discoverSuperpowers())
        continue
      }
      states.push({
        provider: 'codex',
        pluginId,
        installed: false,
        installedVersion: null,
        enabled: false,
        health: 'warn',
        lastError: 'No discover strategy defined for this plugin',
      })
    }
    return states
  }

  public async install(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Install handled via local script for ${request.pluginId}`)
  }

  public async uninstall(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Uninstall is not supported for ${request.pluginId}`)
  }

  public async upgrade(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    return toStepResult(startTime, `Upgrade is not required for ${request.pluginId}`)
  }

  public async enable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    if (request.pluginId !== 'superpowers') {
      return toStepResult(startTime, `Enable is not supported for ${request.pluginId}`)
    }

    const skillList = await this.listSuperpowerSkills()
    const enabledSkills = skillList.filter((skill) => skill.enabled).map((skill) => skill.name)
    const nextEnabledSkills =
      enabledSkills.length > 0 ? enabledSkills : ['brainstorming']
    await this.setSuperpowerEnabledSkills(nextEnabledSkills)

    return toStepResult(startTime, `Enabled superpowers: ${nextEnabledSkills.join(', ')}`)
  }

  public async disable(request: PluginOperationRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    if (request.pluginId !== 'superpowers') {
      return toStepResult(startTime, `Disable is not supported for ${request.pluginId}`)
    }

    await this.setSuperpowerEnabledSkills([])
    return toStepResult(startTime, 'Disabled all superpowers skills')
  }

  public async readConfig(request: PluginOperationRequest): Promise<Record<string, unknown>> {
    this.requireManifest(request.pluginId)
    if (request.pluginId !== 'superpowers') {
      return {}
    }

    const skills = await this.listSuperpowerSkills()
    const whitelist = skills.filter((skill) => skill.enabled).map((skill) => skill.name)
    return { whitelist }
  }

  public async writeConfig(request: ConfigRequest): Promise<StepResult> {
    const startTime = nowMs()
    this.requireManifest(request.pluginId)
    if (request.pluginId !== 'superpowers') {
      return toStepResult(startTime, `Config write is not supported for ${request.pluginId}`)
    }

    const whitelistRaw = request.values.whitelist
    const whitelist =
      Array.isArray(whitelistRaw)
        ? normalizeSkillList(
            whitelistRaw.filter((item): item is string => typeof item === 'string'),
          )
        : []

    await this.setSuperpowerEnabledSkills(whitelist)
    return toStepResult(startTime, `Saved superpowers whitelist: ${whitelist.join(', ') || '(none)'}`)
  }

  public async healthCheck(request: PluginOperationRequest) {
    this.requireManifest(request.pluginId)
    if (request.pluginId !== 'superpowers') {
      return {
        health: 'warn' as const,
        message: `${request.pluginId} has no health check`,
      }
    }

    try {
      const skills = await this.listSuperpowerSkills()
      const enabledCount = skills.filter((skill) => skill.enabled).length
      return {
        health: enabledCount > 0 ? ('ok' as const) : ('warn' as const),
        message:
          enabledCount > 0
            ? `Superpowers active with ${enabledCount} enabled skill(s)`
            : 'Superpowers has no enabled skills',
      }
    } catch (error) {
      return {
        health: 'error' as const,
        message: error instanceof Error ? error.message : 'Health check failed',
      }
    }
  }

  private async discoverSuperpowers(): Promise<ObservedPluginState> {
    try {
      const skills = await this.listSuperpowerSkills()
      const enabledCount = skills.filter((skill) => skill.enabled).length
      return {
        provider: 'codex',
        pluginId: 'superpowers',
        installed: true,
        installedVersion: 'managed-script',
        enabled: enabledCount > 0,
        health: 'ok',
      }
    } catch (error) {
      return {
        provider: 'codex',
        pluginId: 'superpowers',
        installed: false,
        installedVersion: null,
        enabled: false,
        health: 'error',
        lastError: error instanceof Error ? error.message : 'Discovery failed',
      }
    }
  }

  private requireManifest(pluginId: string): PluginManifest {
    const manifest = this.manifestByPluginId.get(pluginId)
    if (!manifest) {
      throw new Error(`[codex] Unknown plugin manifest: ${pluginId}`)
    }
    return manifest
  }

  private async listSuperpowerSkills(): Promise<SuperpowerSkill[]> {
    if (!isTauriRuntime()) {
      return this.fallbackSkillCatalog.map((name) => ({
        name,
        enabled: this.fallbackEnabledSkills.includes(name),
      }))
    }

    const skills = await invoke<SuperpowerSkill[]>('codex_list_superpowers', {
      scriptsDir: this.scriptsDir,
    })
    return clone(skills)
  }

  private async setSuperpowerEnabledSkills(enabledSkills: string[]): Promise<void> {
    const normalized = normalizeSkillList(enabledSkills)

    if (!isTauriRuntime()) {
      this.fallbackEnabledSkills = normalized
      return
    }

    await invoke<string>('codex_set_superpowers_enabled', {
      scriptsDir: this.scriptsDir,
      enabledSkills: normalized,
    })
  }
}
