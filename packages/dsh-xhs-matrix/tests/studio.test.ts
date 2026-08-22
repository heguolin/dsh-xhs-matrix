// tests/studio.test.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQualityService } from '../src/content-quality.ts'
import { MatrixStore } from '../src/store.ts'
import { parseCoverPrompt, StudioService, type StudioCompleteRequest, type StudioLlmClient, type StudioSseEvent } from '../src/studio.ts'

let store: MatrixStore
let accountId: string

let PERSONA_ID = ''

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-studio-'))
  store = new MatrixStore(join(dir, 'xhs.json'))
  const persona = store.upsertPersona({ name: '测试人设', prompt: '真实、克制', forbiddenWords: ['必看', '震惊'] })
  PERSONA_ID = persona.id
  accountId = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true }).id
})

/** 收拢所有同类型事件的增量（把每段 delta 拼接成最终文本）。 */
function joinDeltas(events: StudioSseEvent[], type: StudioSseEvent['type']): string {
  return events
    .filter(event => event.type === type)
    .map(event => (event as { delta: string }).delta)
    .join('')
}

/** 按请求 id 统计已落库消息。 */
function messagesByRequestId(requestId: string): Array<{ id: string; role: string; requestId?: string }> {
  return store.listStudioMessages(accountId).filter(message => message.requestId === requestId)
}

interface FakeLlmOptions {
  plan?: string
  final?: string
  polishThrows?: boolean
}

function makeLlm(options: FakeLlmOptions = {}): { llm: StudioLlmClient; calls: StudioCompleteRequest[] } {
  const calls: StudioCompleteRequest[] = []
  const llm: StudioLlmClient = {
    async complete(request) {
      calls.push(request)
      return { text: options.final ?? '最终审校稿' }
    },
    async stream(request, onDelta) {
      calls.push(request)
      const isPolish = request.system.includes('去 AI 味')
      const text = isPolish ? (options.final ?? '最终审校稿') : (options.plan ?? '原始初稿')
      if (isPolish && options.polishThrows === true) throw new Error('审校模型调用失败')
      onDelta(text)
      return text
    },
  }
  return { llm, calls }
}

describe('parseCoverPrompt', () => {
  it('按【封面提示词】标记拆分正文与封面', () => {
    const { copy, coverPrompt } = parseCoverPrompt('正文第一行\n正文第二行\n【封面提示词】红色背景 + 大字标题')
    expect(copy).toBe('正文第一行\n正文第二行')
    expect(coverPrompt).toBe('红色背景 + 大字标题')
  })
  it('无标记时整段视为正文，封面为空', () => {
    const { copy, coverPrompt } = parseCoverPrompt('只有正文')
    expect(copy).toBe('只有正文')
    expect(coverPrompt).toBe('')
  })
})

describe('StudioService 两阶段流式发送', () => {
  it('content_delta 只含去 AI 味后的最终稿', async () => {
    const events: StudioSseEvent[] = []
    const { llm } = makeLlm({ plan: '原始初稿', final: '最终审校稿' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    await studio.sendStream(accountId, '写一篇', 'creative', event => events.push(event), { requestId: 'req-1' })
    expect(joinDeltas(events, 'content_delta')).toBe('最终审校稿')
    expect(joinDeltas(events, 'content_delta')).not.toContain('原始初稿')
  })

  it('相同 requestId 完成后重试不调用模型也不重复落库', async () => {
    const { llm, calls } = makeLlm({ plan: '原始初稿', final: '最终审校稿' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    const send = (requestId: string) => studio.sendStream(accountId, '写一篇', 'creative', () => {}, { requestId })

    await send('req-1')
    const callsAfterFirst = calls.length
    const replay = await send('req-1')

    expect(calls.length).toBe(callsAfterFirst)
    expect(replay.done?.deduplicated).toBe(true)
    expect(messagesByRequestId('req-1')).toHaveLength(2)
  })

  it('相同 requestId 进行中重复返回 REQUEST_IN_PROGRESS', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const llm: StudioLlmClient = {
      complete: async () => ({ text: '' }),
      async stream(request, onDelta) {
        const isPolish = request.system.includes('去 AI 味')
        if (isPolish) { onDelta('最终审校稿'); return '最终审校稿' }
        onDelta('原始初稿')
        await gate
        return '原始初稿'
      },
    }
    const studio = new StudioService(store, llm, createQualityService(llm))
    const inFlight = studio.sendStream(accountId, '写一篇', 'creative', () => {}, { requestId: 'req-busy' })
    await new Promise(resolve => setTimeout(resolve, 20))
    await expect(studio.sendStream(accountId, '写一篇', 'creative', () => {}, { requestId: 'req-busy' }))
      .rejects.toThrow(/REQUEST_IN_PROGRESS/)
    release()
    await inFlight
  })

  it('两阶段审校失败时不落消息', async () => {
    const events: StudioSseEvent[] = []
    const { llm } = makeLlm({ plan: '原始初稿', final: '最终审校稿', polishThrows: true })
    const studio = new StudioService(store, llm, createQualityService(llm))
    await expect(studio.sendStream(accountId, '写一篇', 'creative', event => events.push(event), { requestId: 'req-polish-fail' }))
      .rejects.toThrow('审校模型调用失败')
    expect(store.listStudioMessages(accountId)).toHaveLength(0)
    expect(messagesByRequestId('req-polish-fail')).toHaveLength(0)
  })

  it('违禁词命中不落消息且返回 quality 未通过', async () => {
    const events: StudioSseEvent[] = []
    const { llm } = makeLlm({ plan: '原始初稿', final: '这篇必看的文章' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    const result = await studio.sendStream(accountId, '写一篇', 'creative', event => events.push(event), { requestId: 'req-forbidden' })
    const quality = events.find(event => event.type === 'quality') as { allowed: boolean } | undefined
    expect(quality).toBeDefined()
    expect(quality?.allowed).toBe(false)
    expect(result.done).toBeUndefined()
    expect(store.listStudioMessages(accountId)).toHaveLength(0)
    expect(messagesByRequestId('req-forbidden')).toHaveLength(0)
  })

  it('SSE 断开（onEvent 抛错）不保存半截助手消息', async () => {
    const { llm } = makeLlm({ plan: '原始初稿', final: '最终审校稿' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    await expect(studio.sendStream(accountId, '写一篇', 'creative', () => { throw new Error('client disconnected') }, { requestId: 'req-sse' }))
      .rejects.toThrow('client disconnected')
    expect(store.listStudioMessages(accountId)).toHaveLength(0)
    expect(messagesByRequestId('req-sse')).toHaveLength(0)
  })

  it('封面提示词拆分且助手消息带人设快照与 requestId', async () => {
    const events: StudioSseEvent[] = []
    const { llm } = makeLlm({ plan: '原始初稿', final: '正文内容\n【封面提示词】暖色系 + 主体居中' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    const result = await studio.sendStream(accountId, '写一篇', 'creative', event => events.push(event), { requestId: 'req-cover' })
    expect(result.done?.coverPrompt).toBe('暖色系 + 主体居中')
    const assistant = store.listStudioMessages(accountId).find(message => message.role === 'assistant')
    expect(assistant?.content).toBe('正文内容')
    expect(assistant?.content).not.toContain('封面提示词')
    expect(assistant?.personaIdSnapshot).toBe(PERSONA_ID)
    expect(assistant?.requestId).toBe('req-cover')
  })

  it('plan_delta 只含可审计计划，不包含原始初稿（原始初稿服务端缓冲）', async () => {
    const events: StudioSseEvent[] = []
    const plan = '【创作说明】\n- 受众：新手用户\n- 角度：避开常见误区\n- 结构：痛点切入 → 步骤 → 清单\n- 结尾：邀请一起学习'
    const draftBody = '原始初稿正文内容'
    const { llm } = makeLlm({ plan: `${plan}\n【草稿】\n${draftBody}`, final: '最终审校稿' })
    const studio = new StudioService(store, llm, createQualityService(llm))
    await studio.sendStream(accountId, '写一篇', 'creative', event => events.push(event), { requestId: 'req-plan' })
    const planText = joinDeltas(events, 'plan_delta')
    expect(planText).toContain('创作说明')
    expect(planText).not.toContain(draftBody)
    expect(joinDeltas(events, 'content_delta')).toBe('最终审校稿')
  })
})
