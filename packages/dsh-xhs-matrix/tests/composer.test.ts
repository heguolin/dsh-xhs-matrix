/** composeBrief(人设, 爆款参考, 账号名?)：v4 字段 + 参考按 weight DESC, score DESC 排序。 */
import { describe, expect, it } from 'vitest'
import { composeBrief } from '../src/composer.ts'
import type { Persona, ViralItem } from '../src/types.ts'

const ISO = '2026-08-18T00:00:00.000Z'

const persona: Persona = {
  id: 'p1',
  name: '干货风',
  prompt: '专业、数据支撑、不废话',
  writingStyles: ['清晰结构', '数据支撑'],
  endingHookConstraints: '结尾自然邀请读者一起学习，不要命令式关注',
  endingHookExamples: ['可以一起来学习学习', '欢迎评论区交流'],
  forbiddenWords: ['必看', '震惊'],
  createdAt: ISO,
}

function viral(id: string, title: string, weight: number, score: number, reasons: string[] = []): ViralItem {
  return {
    id, personaId: 'p1', title, body: '正文摘要', sourceUrl: 'https://xhs.example.com/' + id,
    source: 'apify', status: 'accepted', weight: weight as ViralItem['weight'], score, reasons,
    collectedAt: ISO,
  }
}

describe('composeBrief', () => {
  it('包含账号名、人设、爆款池参考与任务', () => {
    const brief = composeBrief(persona, [viral('v1', '通勤穿搭公式', 1, 80)], '账号A')
    expect(brief).toContain('账号A')
    expect(brief).toContain('干货风')
    expect(brief).toContain('通勤穿搭公式')
    expect(brief).toContain('封面提示词')
  })

  it('使用 v4 人设字段：写作风格、结尾钩子约束与最佳案例、违禁词', () => {
    const brief = composeBrief(persona, [viral('v1', '通勤穿搭公式', 1, 80)], '账号A')
    expect(brief).toContain('清晰结构')
    expect(brief).toContain('数据支撑')
    expect(brief).toContain('结尾自然邀请读者一起学习')
    expect(brief).toContain('可以一起来学习学习')
    expect(brief).toContain('欢迎评论区交流')
    expect(brief).toContain('必看')
    expect(brief).toContain('震惊')
  })

  it('参考按 weight DESC 再 score DESC 排序', () => {
    const items = [
      viral('v1', 'AA低权重', 1, 10),
      viral('v2', 'BB高权低分', 5, 5),
      viral('v3', 'CC同权高分', 5, 80),
    ]
    const brief = composeBrief(persona, items, '账号A')
    const idx = (title: string) => brief.indexOf(title)
    // 同权(5) 先按 score 降序：score 80 (CC) 先于 score 5 (BB)。
    expect(idx('CC同权高分')).toBeLessThan(idx('BB高权低分'))
    // 权重高(5) 先于 权重低(1)。
    expect(idx('BB高权低分')).toBeLessThan(idx('AA低权重'))
  })

  it('爆款池为空时给出占位说明', () => {
    const brief = composeBrief(persona, [])
    expect(brief).toContain('暂无爆款池参考')
  })
})
