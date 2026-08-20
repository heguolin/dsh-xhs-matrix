/** /api/dsh-xhs-matrix 路由族装配：账号/人设/知识库/设置四组路由。 */

import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { CollectionScheduler } from '../metrics.ts'
import type { MatrixStore } from '../store.ts'
import { makeAccountsRoutes } from './accounts.ts'
import { makeKnowledgeRoutes } from './knowledge.ts'
import { makePersonasRoutes } from './personas.ts'
import { makeSettingsRoutes } from './settings.ts'

/** 路由族依赖（drafts/studio/爆款池路由在后续任务追加对应依赖字段）。 */
export interface RoutesDeps {
  store: MatrixStore
  scheduler?: CollectionScheduler
  /** Apify 配置更新后重建数据源/调度器/路由的回调。 */
  reload?: () => void
}

/**
 * 构建 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储与可选依赖。
 * @returns 路由数组。
 */
export function makeRoutes(deps: RoutesDeps): WebRoute[] {
  const { store, scheduler, reload } = deps
  return [
    ...makeSettingsRoutes(store, reload),
    ...makeAccountsRoutes(store),
    ...makePersonasRoutes(store),
    ...makeKnowledgeRoutes(store, scheduler),
  ]
}
