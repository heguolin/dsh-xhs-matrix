/** /settings/apify 路由：Apify 数据源运行时设置。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { MatrixStore } from '../store.ts'
import { fail, readJsonBody, writeJson } from './shared.ts'

/** 构建运行时设置路由。
 * @param store - 矩阵存储。
 * @param reload - Apify 配置更新后重建数据源/调度器/路由的回调。
 * @returns 路由数组。
 */
export function makeSettingsRoutes(store: MatrixStore, reload?: () => void): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  return [
    // ------------------------------------------------------------ 运行时设置
    route(XHS_API.settingsApify, async (req, res) => {
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if ((req.method ?? 'GET') === 'GET') {
        writeJson(res, 200, { settings: store.getSettings().apify })
        return
      }
      if ((req.method ?? 'GET') !== 'PATCH') { writeJson(res, 405, { error: `method not allowed: ${req.method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const payload: Record<string, unknown> = {}
      if (body.actorId !== undefined) { if (typeof body.actorId !== 'string') { writeJson(res, 400, { error: 'actorId 必须是字符串' }); return }; payload.actorId = body.actorId }
      if (body.apiToken !== undefined) { if (typeof body.apiToken !== 'string') { writeJson(res, 400, { error: 'apiToken 必须是字符串' }); return }; payload.apiToken = body.apiToken }
      if (body.maxItems !== undefined) { if (typeof body.maxItems !== 'number' || !Number.isInteger(body.maxItems) || body.maxItems <= 0) { writeJson(res, 400, { error: 'maxItems 必须是正整数' }); return }; payload.maxItems = body.maxItems }
      if (body.requestTimeoutMs !== undefined) { if (typeof body.requestTimeoutMs !== 'number' || body.requestTimeoutMs <= 0) { writeJson(res, 400, { error: 'requestTimeoutMs 必须是正数' }); return }; payload.requestTimeoutMs = body.requestTimeoutMs }
      if (body.maxPolls !== undefined) { if (typeof body.maxPolls !== 'number' || !Number.isInteger(body.maxPolls) || body.maxPolls <= 0) { writeJson(res, 400, { error: 'maxPolls 必须是正整数' }); return }; payload.maxPolls = body.maxPolls }
      try {
        const settings = store.updateApifySettings(payload)
        reload?.()
        writeJson(res, 200, { settings: settings.apify })
      } catch (error) { fail(res, error) }
    }),
  ]
}
