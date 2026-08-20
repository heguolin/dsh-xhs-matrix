/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { ApifyTrendProvider, type ApifyConfig } from './apify.ts'
import { CollectionScheduler } from './metrics.ts'
import { makeRoutes } from './routes.ts'
import { MatrixStore } from './store.ts'
import { StudioService, type StudioLlmClient } from './studio.ts'
import { makeTools } from './tools.ts'

/** 稳定插件名。 */
export const name = 'xhs-matrix'

/** 需要的服务。 */
export const inject = ['webServer', 'tools', 'systemPrompt', 'llm']

/** 设置命名空间。 */
export const XHS_SETTINGS_NAMESPACE = settingsNamespace('dsh-xhs-matrix')

/** 插件配置。 */
export interface Config {
  selectionStrategy?: 'fifo' | 'random'
  locale?: string
  announceToAgent?: boolean
  enabled?: boolean
  apifyActorId?: string
  apifyApiToken?: string
  apifyMaxItems?: number
  apifyRequestTimeoutMs?: number
  apifyMaxPolls?: number
}

export const Config: z<Config> = z.object({
  selectionStrategy: z.union(['fifo', 'random']).default('fifo'),
  locale: z.string().default('zh-CN'),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  apifyActorId: z.string().default(''),
  apifyApiToken: z.string().default(''),
  apifyMaxItems: z.number().default(10),
  apifyRequestTimeoutMs: z.number().default(30000),
  apifyMaxPolls: z.number().default(120),
})

const DEFAULT_SELECTION = 'fifo'

/** 解析后的生效配置（默认值已填充，全字段必填）。 */
interface ResolvedConfig {
  selectionStrategy: 'fifo' | 'random'
  locale: string
  announceToAgent: boolean
  enabled: boolean
  apifyActorId: string
  apifyApiToken: string
  apifyMaxItems: number
  apifyRequestTimeoutMs: number
  apifyMaxPolls: number
}

/** 模型可见公告。 */
export const XHS_GUIDANCE = '本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、已发布知识库、选题、草稿与专属创作台。能力：xhs_today 按账号人设生成创作简报供你撰写文案；xhs_notes 查询账号已发布笔记知识库；xhs_trends 查询外部趋势样本；xhs_collection_status 查询指标采集状态；xhs_draft_save 持久化草稿（同账号当日同选题去重）；xhs_topic_add 管理选题池；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题」时即指本插件。'

/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt）。
 * @param config - 插件配置。
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): ResolvedConfig => ({
    selectionStrategy: current().selectionStrategy ?? DEFAULT_SELECTION,
    locale: current().locale ?? 'zh-CN',
    announceToAgent: current().announceToAgent ?? true,
    enabled: current().enabled ?? true,
    apifyActorId: current().apifyActorId ?? '',
    apifyApiToken: current().apifyApiToken ?? '',
    apifyMaxItems: current().apifyMaxItems ?? 10,
    apifyRequestTimeoutMs: current().apifyRequestTimeoutMs ?? 30000,
    apifyMaxPolls: current().apifyMaxPolls ?? 120,
  })

  const store = new MatrixStore()
  store.load()

  let disposeRoutes: (() => void) | undefined
  let disposeTools: (() => void) | undefined
  let disposeSection: (() => void) | undefined
  let disposeScheduler: (() => void) | undefined

  const sync = (): void => {
    if (disposeSection !== undefined) { disposeSection(); disposeSection = undefined }
    if (disposeRoutes !== undefined) { disposeRoutes(); disposeRoutes = undefined }
    if (disposeTools !== undefined) { disposeTools(); disposeTools = undefined }
    if (disposeScheduler !== undefined) { disposeScheduler(); disposeScheduler = undefined }
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-xhs-matrix',
        order: 150,
        text: XHS_GUIDANCE,
      })
    }
    const trendProvider = value.apifyActorId !== '' && value.apifyApiToken !== ''
      ? new ApifyTrendProvider({
          actorId: value.apifyActorId,
          apiToken: value.apifyApiToken,
          maxItems: value.apifyMaxItems ?? 10,
          requestTimeoutMs: value.apifyRequestTimeoutMs ?? 30000,
          maxPolls: value.apifyMaxPolls ?? 120,
        } satisfies ApifyConfig)
      : undefined
    let scheduler: CollectionScheduler | undefined
    if (trendProvider !== undefined) {
      scheduler = new CollectionScheduler({ store, provider: trendProvider })
      scheduler.start()
    }
    const llmClient: StudioLlmClient = {
      async complete(request) {
        const messages: Message[] = request.messages.map(entry => {
          const content = [{ type: 'text' as const, text: entry.content }]
          return entry.role === 'user'
            ? createUserMessage({ content, source: { kind: 'user' } })
            : createAssistantMessage({ content, source: { provider: 'deepseek', model: 'deepseek-chat' } })
        })
        const text: string[] = []
        let failed: string | undefined
        for await (const chunk of ctx.llm.stream({ provider: 'deepseek', model: 'deepseek-chat', system: request.system, messages, maxTokens: request.maxTokens ?? 4000 })) {
          if (chunk.type === 'text-delta') text.push(chunk.text)
          if (chunk.type === 'finish' && chunk.reason.kind === 'error') failed = chunk.reason.failure.message
        }
        if (failed !== undefined) throw new Error(failed)
        return { text: text.join('') }
      },
    }
    const studio = new StudioService(store, llmClient)
    disposeScheduler = () => scheduler?.stop()
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes({ store, trendProvider, scheduler, studio }).map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-xhs-matrix: routes',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = makeTools({ store, ctx, selectionStrategy: resolve().selectionStrategy }).map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-xhs-matrix: tools',
    )
  }

  installSettingsSection(ctx, XHS_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source; sync() },
    onChange: sync,
  })

  sync()
}
