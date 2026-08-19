/** Browser-half 入口：注册词典并挂载侧边栏入口与中栏面板。DOM 问题只记录不抛出。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { XhsApi } from './api.ts'
import { PanelController } from './controller.ts'
import { en, NS, zh, type XhsKey } from './locales.ts'
import { mountPanel } from './mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-xhs-matrix': XhsKey
  }
}

/** 需要的服务。 */
export const inject = ['slots', 'locale']

/**
 * 挂载矩阵面板。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-xhs-matrix: dictionaries')

  const controller = new PanelController()
  const api = new XhsApi()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, api))
  } catch (error) {
    console.warn('[dsh-xhs-matrix] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-xhs-matrix: ui mounts')
}
