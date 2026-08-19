/** xhs/feedback 事件：草稿标记 published 且携带 metrics 时发射（进化闭环挂点）。 */

import type { Context } from '@deepseek-ai/cordis'
import type { DraftMetrics } from './types.ts'

/** 反馈事件载荷。 */
export interface XhsFeedbackEvent {
  draftId: string
  accountId: string
  metrics: DraftMetrics
}

/** 本插件声明的事件表。 */
export interface Events {
  'xhs/feedback': XhsFeedbackEvent
}

/** 将本插件事件并入 Cordis 事件表，使 ctx.emit/ctx.on 获得类型。 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    'xhs/feedback'(event: XhsFeedbackEvent): void
  }
}

/** 发射反馈事件。 */
export function emitFeedback(ctx: Context, event: XhsFeedbackEvent): void {
  ctx.emit('xhs/feedback', event)
}
