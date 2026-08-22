/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { ApifyViralProvider } from './collector/apify.ts'
import { CollectionScheduler } from './metrics.ts'
import { createQualityService } from './content-quality.ts'
import { resolveStudioModel, type ModelRoute } from './model-config.ts'
import { makeRoutes } from './routes/index.ts'
import { MatrixStore } from './store.ts'
import { StudioService, type StudioCompleteRequest, type StudioLlmClient } from './studio.ts'
import { makeTools } from './tools.ts'

/** 稳定插件名。 */
export const name = 'xhs-matrix'

/** 需要的服务。 */
export const inject = ['webServer', 'tools', 'systemPrompt', 'llm', 'settings']

/** 设置命名空间。 */
export const XHS_SETTINGS_NAMESPACE = settingsNamespace('dsh-xhs-matrix')

/** 插件配置（Apify 数据源配置唯一来源为 store 运行时设置，不再放插件 Config）。 */
export interface Config {
  locale?: string
  announceToAgent?: boolean
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  locale: z.string().default('zh-CN'),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

/** 解析后的生效配置（默认值已填充，全字段必填）。 */
interface ResolvedConfig {
  locale: string
  announceToAgent: boolean
  enabled: boolean
}

/** 模型可见公告。 */
export const XHS_GUIDANCE = '本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、已发布知识库、爆款池、草稿与专属创作台。能力：xhs_today 按账号人设与爆款池生成创作简报供你撰写文案；xhs_notes 查询账号已发布笔记知识库；xhs_virals 查询账号爆款池条目与审核状态；xhs_collection_status 查询指标采集状态；xhs_draft_save 持久化草稿（同账号当日去重）；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题 / 爆款」时即指本插件。'

/** 创作台模型装配结果。 */
export interface StudioLlmSetup {
  /** 模型客户端：模型解析失败时 complete 抛明确错误。 */
  client: StudioLlmClient
  /** 模型标签：解析失败时为「未配置」。 */
  modelLabel: string
}

/**
 * 构建创作台模型客户端：模型解析失败（未配置 agent-default-model 且存在注册 provider）时，
 * 仅让创作台在调用 complete 时给出明确错误，插件照常加载，其余功能（路由/工具/公告/
 * 爆款池/知识库/草稿/账号）不受影响。
 * @param resolveModel - 读取 agent-default-model 设置的处理器；未配置时返回 undefined。
 * @param listProviders - 列出已注册 provider。
 * @param stream - 底层 llm.stream 调用入口。
 * @returns 模型客户端与模型标签。
 */
export function buildStudioLlmClient(
  resolveModel: () => ModelRoute | undefined,
  listProviders: () => Array<{ id: string }>,
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
): StudioLlmSetup {
  let modelRoute: ModelRoute | undefined
  try {
    modelRoute = resolveStudioModel(resolveModel, listProviders)
  } catch {
    // resolveStudioModel 仅在「未配置 agent-default-model 且存在注册 provider」时抛错；
    // 捕获后模型路由不可得只影响创作台，不让插件加载失败。
    modelRoute = undefined
  }
  if (modelRoute === undefined) {
    const notConfigured = async (): Promise<{ text: string }> => {
      throw new Error('未配置创作台模型：请在 Harness 设置 agent-default-model（provider 与 model）')
    }
    return {
      client: {
        complete: notConfigured,
        stream: async () => { await notConfigured(); return '' },
      },
      modelLabel: '未配置',
    }
  }
  return {
    client: {
      async complete(request) {
        const text = await runModelStream(stream, request, modelRoute)
        return { text }
      },
      async stream(request, onDelta) {
        return runModelStream(stream, request, modelRoute, onDelta)
      },
    },
    modelLabel: `${modelRoute.provider}/${modelRoute.model}`,
  }
}

/** 消息映射 + 流式调用 + 文本拼接；onDelta 可选（非流式调用传空）。 */
function runModelStream(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  request: StudioCompleteRequest,
  modelRoute: ModelRoute,
  onDelta?: (delta: string) => void,
): Promise<string> {
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
  return (async () => {
    for await (const chunk of stream(options)) {
      if (chunk.type === 'text-delta' && onDelta !== undefined) onDelta(chunk.text)
      assembler.push(chunk)
    }
    const finish = assembler.finish
    if (finish.kind !== 'stop') {
      // 非 stop 终态仍是错误（不把失败伪装成成功），但必须带上 provider 失败细节以供诊断。
      const failure = 'failure' in finish ? finish.failure : undefined
      const detail = failure
        ? `${failure.message}${failure.code ? `（${failure.code}）` : ''}`
        : undefined
      throw new Error(`创作台模型调用未正常结束：finish ${finish.kind}${detail ? '：' + detail : ''}`)
    }
    return assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('')
  })()
}

/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt/llm）。
 * @param config - 插件配置。
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): ResolvedConfig => ({
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
    // 解析失败（未配置默认模型）只让创作台在调用时给出明确错误，插件照常加载。
    const { client: llmClient, modelLabel } = buildStudioLlmClient(
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
      (options) => ctx.llm.stream(options),
    )
    const quality = createQualityService(llmClient)
    const studio = new StudioService(store, llmClient, quality, modelLabel)

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
