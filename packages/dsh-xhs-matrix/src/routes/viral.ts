/** /viral 爆款池路由：列表、采集入库、审核。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { rankViralItems } from '../collector/rank.ts'
import type { ViralProvider } from '../collector/provider.ts'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import type { MatrixStore, ViralItemPayload } from '../store.ts'
import type { ViralStatus } from '../types.ts'
import { fail, queryParam, readJsonBody, writeJson } from './shared.ts'

/** 合法审核状态。 */
const VIRAL_STATUSES: readonly ViralStatus[] = ['pending', 'accepted', 'ignored']

/** 采集失败时的兜底错误文案。 */
const COLLECT_FAILED_MESSAGE = '爆款采集失败'

/**
 * 构建 /viral 爆款池路由。
 * @param store - 矩阵存储。
 * @param provider - 爆款数据源；未配置时采集请求返回 400。
 * @returns 路由数组。
 */
export function makeViralRoutes(store: MatrixStore, provider?: ViralProvider): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  return [
    route(XHS_API.viral, async (req, res) => {
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const method = req.method ?? 'GET'
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')

      // ------------------------------------------------------------ 爆款列表
      if (method === 'GET') {
        if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
        let status: ViralStatus | undefined
        const statusRaw = queryParam(url, 'status')
        if (statusRaw !== undefined) {
          if (!VIRAL_STATUSES.includes(statusRaw as ViralStatus)) {
            writeJson(res, 400, { error: 'status 必须是 pending/accepted/ignored' }); return
          }
          status = statusRaw as ViralStatus
        }
        writeJson(res, 200, { items: store.listViralItems(accountId, status) })
        return
      }

      // ------------------------------------------------------------ 审核
      if (method === 'PATCH') {
        const itemId = queryParam(url, 'item')
        if (accountId === undefined || itemId === undefined) { writeJson(res, 400, { error: 'account 与 item 查询参数必填' }); return }
        const body = await readJsonBody(req)
        if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
        const status = body.status
        if (status !== 'accepted' && status !== 'ignored') { writeJson(res, 400, { error: 'status 必须是 accepted 或 ignored' }); return }
        try {
          const item = store.reviewViralItem(accountId, itemId, status)
          writeJson(res, 200, { item })
        } catch (error) { fail(res, error) }
        return
      }

      // ------------------------------------------------------------ 采集入库
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (provider === undefined) { writeJson(res, 400, { error: '未配置爆款数据源' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const targetAccountId = typeof body.accountId === 'string' && body.accountId.trim() !== '' ? body.accountId : ''
      if (targetAccountId === '') { writeJson(res, 400, { error: 'accountId 必填' }); return }
      const account = store.listAccounts().find(item => item.id === targetAccountId)
      if (account === undefined) { writeJson(res, 400, { error: `账号不存在：${targetAccountId}` }); return }
      const persona = store.listPersonas().find(item => item.id === account.personaId)
      if (persona === undefined) { writeJson(res, 400, { error: '该账号尚未分配人设' }); return }
      // 未显式传 query 时按人设方向降级生成搜索词。
      const query = typeof body.query === 'string' && body.query.trim() !== '' ? body.query.trim() : (persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name)
      const maxItems = typeof body.maxItems === 'number' && body.maxItems > 0 ? body.maxItems : 10
      try {
        const result = await provider.search({ accountId: targetAccountId, query, maxItems })
        if (result.status === 'failed') { writeJson(res, 502, { error: result.error ?? COLLECT_FAILED_MESSAGE }); return }
        const notes = store.listPublishedNotes(targetAccountId)
        const ranked = rankViralItems(account, persona, notes, result.items)
        const items = ranked.map(item => {
          const payload: ViralItemPayload = {
            accountId: targetAccountId,
            title: item.title,
            body: item.body ?? '',
            sourceUrl: item.sourceUrl,
            source: item.source === 'manual' ? 'manual' : 'apify',
            publishedAt: item.publishedAt,
            score: item.score,
            reasons: item.reasons,
            status: 'pending',
          }
          return store.saveViralItem(payload)
        })
        writeJson(res, 201, { items })
      } catch (error) {
        fail(res, error)
      }
    }),
  ]
}
