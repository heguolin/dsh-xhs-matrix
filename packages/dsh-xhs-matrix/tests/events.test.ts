import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { emitFeedback, type XhsFeedbackEvent } from '../src/events.ts'

describe('xhs/feedback 事件', () => {
  it('发射携带 draftId/accountId/metrics', () => {
    const ctx = new Context()
    const received: XhsFeedbackEvent[] = []
    ctx.on('xhs/feedback', (event: XhsFeedbackEvent) => { received.push(event) })
    const event: XhsFeedbackEvent = {
      draftId: 'd1',
      accountId: 'acc-a',
      metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' },
    }
    emitFeedback(ctx, event)
    expect(received).toHaveLength(1)
    expect(received[0].draftId).toBe('d1')
    expect(received[0].metrics.reads).toBe(50)
  })
})
