// tests/collector-provider.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeApifyItem } from '../src/collector/provider.ts'

describe('normalizeApifyItem', () => {
  it('提取正文与链接', () => {
    const item = normalizeApifyItem({ title: '爆款', desc: '正文内容', url: 'https://x.com/1' })
    expect(item.body).toBe('正文内容')
    expect(item.sourceUrl).toBe('https://x.com/1')
    expect(item.source).toBe('apify')
  })
  it('缺 title 抛错', () => {
    expect(() => normalizeApifyItem({ desc: 'x' })).toThrow(/title/)
  })
})
