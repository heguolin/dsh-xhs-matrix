import { describe, expect, it } from 'vitest'
import { composeBrief } from '../src/composer.ts'
import type { Account, NegativeTopic, Persona, Topic } from '../src/types.ts'

const account: Account = { id: 'acc-a', name: '账号A', personaId: 'p1', enabled: true, createdAt: '2026-08-18T00:00:00.000Z' }
const persona: Persona = { id: 'p1', name: '干货风', prompt: '专业、数据支撑、不废话', createdAt: '2026-08-18T00:00:00.000Z' }
const topic: Topic = { id: 't1', title: '通勤穿搭', source: 'manual', status: 'open', createdAt: '2026-08-18T00:00:00.000Z' }

describe('composeBrief', () => {
  it('包含账号、人设、选题与任务', () => {
    const brief = composeBrief(account, persona, topic, [])
    expect(brief).toContain('账号A')
    expect(brief).toContain('干货风')
    expect(brief).toContain('通勤穿搭')
    expect(brief).toContain('封面提示词')
  })

  it('逐条列出黑名单约束', () => {
    const negatives: NegativeTopic[] = [
      { id: 'n1', keyword: '美妆技巧', reason: '上次没流量', createdAt: '2026-08-18T00:00:00.000Z' },
    ]
    const brief = composeBrief(account, persona, topic, negatives)
    expect(brief).toContain('美妆技巧')
    expect(brief).toContain('上次没流量')
  })
})
