/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { ApifyViralProvider } from './collector/apify.ts'
import { CollectionScheduler } from './metrics.ts'
import { resolveStudioModel } from './model-config.ts'
import { makeRoutes } from './routes/index.ts'
import { MatrixStore } from './store.ts'
import { StudioService, type StudioLlmClient } from './studio.ts'
import { makeTools } from './tools.ts'

/** 稳定插件名。 */
export const name = 'xhs-matrix'

/** 需要的服务。 */
export const inject = ['webServer', 'tools', 'systemPrompt', 'llm']

/** 设置命名空间。 */
export const XHS_SETTINGS_NAMESPACE = settingsNamespace('dsh-xhs-matrix')

/** 插件配置（Apify 数据源配置唯一来源为 store 运行时设置，不再放插件 Config）。 */
export interface Config {
  selectionStrategy?: 'fifo' | 'random'
  locale?: string
  announceToAgent?: boolean
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  selectionStrategy: z.union(['fifo', 'random']).default('fifo'),
  locale: z.string().default('zh-CN'),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

const DEFAULT_SELECTION = 'fifo'

/** 解析后的生效配置（默认值已填充，全字段必填）。 */
interface ResolvedConfig {
  selectionStrategy: 'fifo' | 'random'
  locale: string
  announceToAgent: boolean
  enabled: boolean
}

/** 模型可见公告。 */
export const XHS_GUIDANCE = '本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、已发布知识库、爆款池、草稿与专属创作台。能力：xhs_today 按账号人设与爆款池生成创作简报供你撰写文案；xhs_notes 查询账号已发布笔记知识库；xhs_virals 查询账号爆款池条目与审核状态；xhs_collection_status 查询指标采集状态；xhs_draft_save 持久化草稿（同账号当日去重）；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题 / 爆款」时即指本插件。'

/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt/llm）。
 * @param config - 插件配置。
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): ResolvedConfig => ({
    selectionStrategy: current().selectionStrategy ?? DEFAULT_SELECTION,
    locale: current().locale ?? 'zh-CN',
    announceToAgent: current().announceToAgent ?? true,
    enabled: current().enabled ?? true,
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

    // 创作台模型：优先读取 Harness 用户设置 agent-default-model，未配置时探测注册 provider。
    const modelRoute = resolveStudioModel(
      () => {
        try {
          const m = ctx.settings.get(settingsNamespace('agent-default-model')) as { provider?: string; model?: string } | undefined
          return m !== undefined && m.provider !== undefined && m.model !== undefined
            ? { provider: m.provider, model: m.model }
            : undefined
        } catch {
          return undefined
        }
      },
      () => ctx.llm.listProviders().map(p => ({ id: p.id })),
    )
    // llmClient 经由 ctx.llm.stream 按 modelRoute 路由（不再硬编码 deepseek）。
    const llmClient: StudioLlmClient = modelRoute === undefined
      ? {
          complete: async () => {
            throw new Error('未配置创作台模型：请在 Harness 设置 agent-default-model')
          },
        }
      : {
          async complete(request) {
            const messages: Message[] = request.messages.map((message) => (
              message.role === 'assistant'
                ? createAssistantMessage({ content: [{ type: 'text', text: message.content }], source: { provider: modelRoute.provider, model: modelRoute.model } })
                : createUserMessage({ content: [{ type: 'text', text: message.content }], source: { kind: 'plugin', plugin: 'dsh-xhs-matrix' } })
            ))
            const options: GenerateOptions = {
              provider: modelRoute.provider,
              model: modelRoute.model,
              messages,
              system: request.system,
              maxTokens: request.maxTokens,
            }
            const assembler = new BlockAssembler()
            for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
            if (assembler.finish.kind !== 'stop') {
              throw new Error(`创作台模型调用未正常结束：finish ${assembler.finish.kind}`)
            }
            const text = assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('')
            return { text }
          },
        }
    const studio = new StudioService(store, llmClient, modelRoute === undefined ? '未配置' : `${modelRoute.provider}/${modelRoute.model}`)

    // Apify 数据源配置：唯一来源 store 运行时设置（面板写入，无插件 Config 回退）。
    const apifyStore = store.getSettings().apify
    const viralProvider = apifyStore.actorId !== '' && apifyStore.apiToken !== ''
      ? new ApifyViralProvider({
          actorId: apifyStore.actorId,
          apiToken: apifyStore.apiToken,
          maxItems: apifyStore.maxItems,
          requestTimeoutMs: apifyStore.requestTimeoutMs,
          maxPolls: apifyStore.maxPolls,
        })
      : undefined
    let scheduler: CollectionScheduler | undefined
    if (viralProvider !== undefined) {
      scheduler = new CollectionScheduler({ store, provider: viralProvider })
      scheduler.start()
    }
    disposeScheduler = () => scheduler?.stop()
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes({ store, viralProvider, scheduler, studio, reload: sync }).map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-xhs-matrix: routes',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = makeTools({ store, ctx }).map(tool => ctx.tools.register(tool))
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
