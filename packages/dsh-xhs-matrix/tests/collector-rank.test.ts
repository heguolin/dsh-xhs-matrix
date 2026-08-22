/** rankViralItems(人设, 共享知识库, 候选)：人设归属排序，不再按账号过滤。 */
import { describe, expect, it } from 'vitest'
import { rankViralItems } from '../src/collector/rank.ts'
import type { Persona, PublishedNote } from '../src/types.ts'

const ISO = '2026-08-01T00:00:00.000Z'
const persona: Persona = { id: 'p1', name: 'AI大模型应用开发工程师', prompt: '', expertise: 'AI工具、大模型应用', createdAt: ISO }

describe('rankViralItems', () => {
  it('符合人设的爆款得分高于无关内容', () => {
    const ranked = rankViralItems(persona, [], [
      { title: '大模型应用实战指南', body: 'AI', source: 'apify' },
      { title: '露营帐篷推荐', body: '户外', source: 'apify' },
    ])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(ranked[0].reasons).toContain('匹配AI大模型应用开发工程师的人设方向')
  })

  it('高权重笔记相近内容加分', () => {
    const notes: PublishedNote[] = [{ id: 'n1', personaId: 'p1', title: 'AI 提效工具实测', copy: '', publishedAt: '2026-08-01', source: 'import', weight: 5, createdAt: ISO, updatedAt: ISO }]
    // 标题同时含人设词表 term（大模型应用）与高权重笔记子串（AI 提效工具实测），验证 +35 与 +30 叠加。
    const ranked = rankViralItems(persona, notes, [{ title: '大模型应用 AI 提效工具实测', body: '', source: 'apify' }])
    expect(ranked[0].score).toBeGreaterThanOrEqual(65)
  })

  it('不再按账号过滤：跨账号同人设的高权重笔记仍计入参考', () => {
    const notes: PublishedNote[] = [{ id: 'n1', personaId: 'p1', sourceAccountId: 'acc-other', title: 'AI 提效工具实测', copy: '', publishedAt: '2026-08-01', source: 'import', weight: 5, createdAt: ISO, updatedAt: ISO }]
    const ranked = rankViralItems(persona, notes, [{ title: '大模型应用 AI 提效工具实测', body: '', source: 'apify' }])
    expect(ranked[0].score).toBeGreaterThanOrEqual(65)
    expect(ranked[0].reasons).toContain('与账号高权重历史内容相近')
  })
})
