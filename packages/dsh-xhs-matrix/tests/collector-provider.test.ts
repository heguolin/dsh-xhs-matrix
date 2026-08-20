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
  it('缺 title 且无正文时抛错', () => {
    expect(() => normalizeApifyItem({ foo: 'x' })).toThrow(/title/)
  })
  it('兼容 note_title / note_url 字段名（socialdatax 扁平结构）', () => {
    const item = normalizeApifyItem({ note_title: '小红书标题', content: '正文', note_url: 'https://xhs.com/note/1', like_count: 5 })
    expect(item.title).toBe('小红书标题')
    expect(item.body).toBe('正文')
    expect(item.sourceUrl).toBe('https://xhs.com/note/1')
    expect(item.likes).toBe(5)
  })
  it('无标题字段时用正文首行兜底', () => {
    const item = normalizeApifyItem({ content: '第一行是标题\n其余是正文' })
    expect(item.title).toBe('第一行是标题')
    expect(item.body).toBe('第一行是标题\n其余是正文')
  })
})
