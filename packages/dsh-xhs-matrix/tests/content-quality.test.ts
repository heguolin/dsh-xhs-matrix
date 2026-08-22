/** ContentQualityService：去 AI 味流式审校、违禁词扫描与质量门。 */
import { describe, expect, it } from 'vitest'
import { createQualityService, scanForbiddenWords } from '../src/content-quality.ts'
import type { StudioCompleteRequest, StudioLlmClient } from '../src/studio.ts'
import type { Persona } from '../src/types.ts'

const ISO = '2026-08-22T00:00:00.000Z'

/** 基础人设（v4 字段；违禁词来源只有人设级）。 */
function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'p1',
    name: '干货风',
    prompt: '专业、数据支撑、不废话',
    writingStyles: ['清晰结构'],
    endingHookConstraints: '结尾自然邀请读者一起学习，不要命令式关注',
    endingHookExamples: ['可以一起来学习学习'],
    forbiddenWords: ['必看', '震惊'],
    createdAt: ISO,
    ...overrides,
  }
}

/**
 * 假模型客户端：stream 按顺序回调每个 chunk 作为增量，返回拼接完整文本。
 * @param captured - 可选：捕获每次请求，供「提示词」断言使用。
 */
function fakeStream(chunks: string[], captured?: StudioCompleteRequest[]): StudioLlmClient {
  return {
    async complete(request) {
      if (captured !== undefined) captured.push(request)
      return { text: chunks.join('') }
    },
    async stream(request, onDelta) {
      if (captured !== undefined) captured.push(request)
      for (const chunk of chunks) onDelta(chunk)
      return chunks.join('')
    },
  }
}

describe('ContentQualityService', () => {
  it('只转发审校后的增量并返回相同完整文本', async () => {
    const deltas: string[] = []
    const quality = createQualityService(fakeStream(['更自然的', '最终稿']))
    const result = await quality.naturalizeStream('原始初稿', persona(), d => deltas.push(d))
    expect(deltas).toEqual(['更自然的', '最终稿'])
    expect(result).toBe('更自然的最终稿')
  })

  it('自然化提示词禁止新增事实与伪造经历，并提示人设违禁词', async () => {
    const captured: StudioCompleteRequest[] = []
    const quality = createQualityService(fakeStream(['审校稿'], captured))
    await quality.naturalizeStream('原始初稿', persona(), () => {})
    const system = captured[0]?.system ?? ''
    expect(system).toContain('不得新增事实')
    expect(system).toContain('不得伪造经历')
    expect(system).toContain('违禁词')
  })
})

describe('违禁词扫描', () => {
  it('返回命中词与位置（字符下标，按位置升序）', () => {
    const hits = scanForbiddenWords('这篇必看的内容真的震惊', ['必看', '震惊'])
    expect(hits).toEqual([
      { word: '必看', position: 2 },
      { word: '震惊', position: 9 },
    ])
  })

  it('无违禁词时返回空数组', () => {
    expect(scanForbiddenWords('自然内容', ['必看', '震惊'])).toEqual([])
    expect(scanForbiddenWords('自然内容', [])).toEqual([])
  })

  it('同一词多次命中时记录每次出现', () => {
    expect(scanForbiddenWords('必看和必看', ['必看'])).toEqual([
      { word: '必看', position: 0 },
      { word: '必看', position: 3 },
    ])
  })
})

describe('质量门', () => {
  it('命中违禁词时报告 failed、记录命中和位置、allowed=false', () => {
    const quality = createQualityService(fakeStream([]))
    const { report, allowed } = quality.check('这篇必看的内容真的震惊', persona())
    expect(allowed).toBe(false)
    expect(report.reviewStatus).toBe('failed')
    expect(report.forbiddenWordHits).toEqual([
      { word: '必看', position: 2 },
      { word: '震惊', position: 9 },
    ])
    expect(report.personaSnapshot).toBe('干货风')
    expect(typeof report.checkedAt).toBe('string')
  })

  it('无命中时报告 passed、allowed=true', () => {
    const quality = createQualityService(fakeStream([]))
    const { report, allowed } = quality.check('这是自然内容', persona())
    expect(allowed).toBe(true)
    expect(report.reviewStatus).toBe('passed')
    expect(report.forbiddenWordHits).toEqual([])
  })

  it('人设未配置违禁词时默认放行', () => {
    const quality = createQualityService(fakeStream([]))
    const { allowed, report } = quality.check('内容', persona({ forbiddenWords: [] }))
    expect(allowed).toBe(true)
    expect(report.reviewStatus).toBe('passed')
  })
})
