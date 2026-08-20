// tests/studio.test.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { MatrixStore } from '../src/store.ts'
import { parseCoverPrompt, StudioService, type StudioLlmClient } from '../src/studio.ts'

let store: MatrixStore
let accountId: string

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-studio-'))
  store = new MatrixStore(join(dir, 'xhs.json'))
  accountId = store.upsertAccount({ name: '账号A', personaId: '', enabled: true }).id
  store.upsertPersona({ name: '测试人设', prompt: '真实、克制' })
  store.upsertAccount({ name: '账号A', personaId: store.listPersonas()[0].id, enabled: true }, accountId)
})

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

describe('StudioService.sendStream', () => {
  it('流式增量回调 + 封面提示词解析 + 消息落库', async () => {
    const deltas: string[] = []
    const llm: StudioLlmClient = {
      complete: async () => ({ text: '' }),
      stream: async (_request, onDelta) => {
        const text = '生成的正文内容\n【封面提示词】暖色系 + 主体居中'
        onDelta(text.slice(0, 4))
        onDelta(text.slice(4))
        return text
      },
    }
    const studio = new StudioService(store, llm)
    const result = await studio.sendStream(accountId, '写一篇', 'creative', d => deltas.push(d))
    expect(deltas.join('')).toContain('生成的正文内容')
    expect(result.coverPrompt).toBe('暖色系 + 主体居中')
    // 助手消息只存正文，不含封面标记。
    const messages = store.listStudioMessages(accountId)
    expect(messages).toHaveLength(2)
    const assistant = messages.find(m => m.role === 'assistant')
    expect(assistant?.content).toBe('生成的正文内容')
    expect(assistant?.content).not.toContain('封面提示词')
  })
})
