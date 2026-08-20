import { describe, expect, it } from 'vitest'
import { ApifyViralProvider } from '../src/collector/apify.ts'

describe('ApifyViralProvider', () => {
  it('Run 输入携带多键搜索词，Dataset 结果标准化', async () => {
    let runBody: Record<string, unknown> | undefined
    const fetcher = async (url: string, init?: RequestInit) => {
      if (String(url).includes('/runs')) {
        runBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ data: { id: 'r1', defaultDatasetId: 'd1', status: 'SUCCEEDED' } }), { status: 200 })
      }
      if (String(url).includes('/datasets/')) {
        return new Response(JSON.stringify([{ title: '爆款', desc: '正文', url: 'https://x.com/1' }]), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { status: 'SUCCEEDED' } }), { status: 200 })
    }
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'tok', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'AI 工具', maxItems: 5 })
    expect(result.status).toBe('success')
    expect(runBody?.searchKeyword).toBe('AI 工具')
    expect(runBody?.operation).toBe('search_notes')
    expect(runBody?.max_items).toBe(5)
    expect(result.items[0]?.body).toBe('正文')
  })
  it('Run 401 返回失败', async () => {
    const fetcher = async () => new Response('', { status: 401 })
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'bad', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('401')
  })
  it('Run 400 带 Apify 校验错误详情', async () => {
    const fetcher = async () => new Response(JSON.stringify({ error: { message: 'Input is not valid: Field input.operation ...' } }), { status: 400 })
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'tok', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Input is not valid')
  })
  it('Run 成功但 OUTPUT 带 warning（如免费计划）时返回 failed 并透传警告', async () => {
    const fetcher = async (url: string) => {
      if (String(url).includes('/runs')) {
        return new Response(JSON.stringify({ data: { id: 'r1', defaultDatasetId: 'd1', defaultKeyValueStoreId: 'kv1', status: 'SUCCEEDED' } }), { status: 200 })
      }
      if (String(url).includes('/key-value-stores/kv1/records/OUTPUT')) {
        return new Response(JSON.stringify({ operation: 'search_notes', itemCount: 0, warnings: ['继续使用此 Actor 需要 Apify 付费计划。'] }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { status: 'SUCCEEDED' } }), { status: 200 })
    }
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'tok', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('付费计划')
  })
  it('Dataset 混有无法解析的条目时跳过坏条目而非整批失败', async () => {
    const fetcher = async (url: string) => {
      if (String(url).includes('/runs')) {
        return new Response(JSON.stringify({ data: { id: 'r1', defaultDatasetId: 'd1', status: 'SUCCEEDED' } }), { status: 200 })
      }
      if (String(url).includes('/datasets/')) {
        return new Response(JSON.stringify([
          { title: '正常标题', desc: '正常正文' },
          { note_id: 'xxx' },           // 缺标题缺正文 → 跳过
          { title: '', content: '' },   // 空字段 → 跳过
        ]), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { status: 'SUCCEEDED' } }), { status: 200 })
    }
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'tok', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('success')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.title).toBe('正常标题')
  })
})
