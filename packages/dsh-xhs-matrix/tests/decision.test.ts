import { describe, expect, it } from 'vitest'
import { filterTopics, selectTopic } from '../src/decision.ts'
import type { Draft, Topic } from '../src/types.ts'

function topic(id: string, title: string, status: Topic['status'] = 'open'): Topic {
  return { id, title, source: 'manual', status, createdAt: '2026-08-18T00:00:00.000Z' }
}
function draft(accountId: string, topicId: string, date = '2026-08-18'): Draft {
  return {
    id: 'd' + topicId, accountId, topicId, date, copy: '', coverPrompt: '', status: 'generated',
    createdAt: '2026-08-18T00:00:00.000Z',
  }
}

describe('filterTopics', () => {
  it('剔除已用选题', () => {
    const topics = [topic('t1', '美妆技巧', 'used'), topic('t2', '通勤穿搭', 'open')]
    expect(filterTopics(topics, 'acc-a', []).map(t => t.id)).toEqual(['t2'])
  })

  it('剔除今日已为该账号生成的选题', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, 'acc-a', [draft('acc-a', 't1')])
    expect(result.map(t => t.id)).toEqual(['t2'])
  })

  it('账号 A 今日已发的选题不影响账号 B', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, 'acc-b', [draft('acc-a', 't1')])
    expect(result.map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('不通过黑名单参数过滤（黑名单模块已移除）', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, 'acc-a', [])
    expect(result.map(t => t.id)).toEqual(['t1', 't2'])
  })
})

describe('selectTopic', () => {
  it('fifo 选最旧未用优先', () => {
    const a = topic('t1', 'a'), b = topic('t2', 'b')
    expect(selectTopic([a, b], 'fifo')?.id).toBe('t1')
    expect(selectTopic([b, a], 'fifo')?.id).toBe('t2')
  })

  it('random 使用注入的随机源', () => {
    const a = topic('t1', 'a'), b = topic('t2', 'b')
    expect(selectTopic([a, b], 'random', () => 0.9)?.id).toBe('t2')
    expect(selectTopic([a, b], 'random', () => 0.1)?.id).toBe('t1')
  })

  it('空候选返回 undefined', () => {
    expect(selectTopic([], 'fifo')).toBeUndefined()
  })
})
