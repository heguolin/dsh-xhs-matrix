import { describe, expect, it } from 'vitest'
import { composeBrief } from '../src/composer.ts'
import type { Account, Persona, ViralItem } from '../src/types.ts'

const account: Account = {
  id: 'acc-a', name: '账号A', personaId: 'p1', enabled: true, createdAt: '2026-08-18T00:00:00.000Z',
  connection: { status: 'unbound' },
  collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 },
  collectionStatus: { running: false, lastStatus: 'idle' },
}
const persona: Persona = { id: 'p1', name: '干货风', prompt: '专业、数据支撑、不废话', createdAt: '2026-08-18T00:00:00.000Z' }
const viralItems: ViralItem[] = [{
  id: 'v1',
  accountId: 'acc-a',
  title: '通勤穿搭公式',
  body: '正文摘要',
  sourceUrl: 'https://xhs.example.com/1',
  source: 'apify',
  status: 'pending',
  score: 80,
  reasons: ['命中人设方向', '高互动'],
  collectedAt: '2026-08-18T00:00:00.000Z',
}]

describe('composeBrief', () => {
  it('包含账号、人设、爆款池参考与任务', () => {
    const brief = composeBrief(account, persona, viralItems)
    expect(brief).toContain('账号A')
    expect(brief).toContain('干货风')
    expect(brief).toContain('通勤穿搭公式')
    expect(brief).toContain('封面提示词')
  })

  it('显式声明风格并附带爆款技巧框架（钩子/伏笔）', () => {
    const brief = composeBrief(account, persona, viralItems)
    expect(brief).toContain('【风格】')
    expect(brief).toContain('严格按「干货风」人设的风格撰写')
    expect(brief).toContain('钩子式开头')
    expect(brief).toContain('悬念伏笔')
    expect(brief).toContain('清单')
    expect(brief).toContain('引导互动')
  })

  it('爆款池为空时给出占位说明', () => {
    const brief = composeBrief(account, persona, [])
    expect(brief).toContain('暂无爆款池参考')
  })
})
