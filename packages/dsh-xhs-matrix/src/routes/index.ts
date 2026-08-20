/** /api/dsh-xhs-matrix 路由族装配：账号/人设/知识库/设置/爆款池/草稿/创作台七组路由。 */

import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ViralProvider } from '../collector/provider.ts'
import type { CollectionScheduler } from '../metrics.ts'
import type { MatrixStore } from '../store.ts'
import type { StudioService } from '../studio.ts'
import { makeAccountsRoutes } from './accounts.ts'
import { makeDraftsRoutes } from './drafts.ts'
import { makeKnowledgeRoutes } from './knowledge.ts'
import { makePersonasRoutes } from './personas.ts'
import { makeSettingsRoutes } from './settings.ts'
import { makeStudioRoutes } from './studio.ts'
import { makeViralRoutes } from './viral.ts'

/** 路由族依赖。 */
export interface RoutesDeps {
  store: MatrixStore
  scheduler?: CollectionScheduler
  /** 爆款采集数据源；未配置时 /viral 采集请求返回 400。 */
  viralProvider?: ViralProvider
  /** 创作会话服务；未配置时 /studio 发送/保存请求返回 400。 */
  studio?: StudioService
  /** Apify 配置更新后重建数据源/调度器/路由的回调。 */
  reload?: () => void
}

/**
 * 构建 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储与可选依赖。
 * @returns 路由数组。
 */
export function makeRoutes(deps: RoutesDeps): WebRoute[] {
  const { store, scheduler, reload, viralProvider, studio } = deps
  return [
    ...makeSettingsRoutes(store, reload),
    ...makeAccountsRoutes(store),
    ...makePersonasRoutes(store),
    ...makeKnowledgeRoutes(store, scheduler),
    ...makeViralRoutes(store, viralProvider),
    ...makeDraftsRoutes(store),
    ...makeStudioRoutes(store, studio),
  ]
}
