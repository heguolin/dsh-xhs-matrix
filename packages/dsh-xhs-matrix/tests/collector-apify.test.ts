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
    expect(runBody?.operation).toBe('note search')
    expect(result.items[0]?.body).toBe('正文')
  })
  it('Run 401 返回失败', async () => {
    const fetcher = async () => new Response('', { status: 401 })
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'bad', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('401')
  })
})
