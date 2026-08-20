/** /studio 创作台路由：会话消息收发与草稿保存。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import type { MatrixStore } from '../store.ts'
import type { StudioService } from '../studio.ts'
import type { DraftEvidence } from '../types.ts'
import { fail, guard, queryParam, readJsonBody, writeJson } from './shared.ts'

/**
 * 构建 /studio 创作台路由。
 * @param store - 矩阵存储。
 * @param studio - 创作会话服务；未配置时发送/保存请求返回 400。
 * @returns 路由数组。
 */
export function makeStudioRoutes(store: MatrixStore, studio?: StudioService): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  return [
    // ------------------------------------------------------------ 创作台会话
    route(XHS_API.studioMessages, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const accountId = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
      if (method === 'GET') {
        writeJson(res, 200, { messages: store.listStudioMessages(accountId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (studio === undefined) { writeJson(res, 400, { error: '创作台未就绪' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const input = typeof body.input === 'string' && body.input.trim() !== '' ? body.input.trim() : ''
      const mode = body.mode === 'full' ? 'full' : 'creative'
      const stream = body.stream === true
      if (input === '') { writeJson(res, 400, { error: 'input 必填' }); return }
      if (stream) {
        // SSE 流式：text-delta 增量 → data: {"delta":...}；完成后 data: {"done":true,...}。
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        try {
          const result = await studio.sendStream(accountId, input, mode, delta => {
            res.write(`data: ${JSON.stringify({ delta })}\n\n`)
          })
          res.write(`data: ${JSON.stringify({ done: true, messageId: result.message.id, coverPrompt: result.coverPrompt, evidence: result.evidence, warning: result.warning })}\n\n`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
        } finally {
          res.end()
        }
        return
      }
      try {
        const result = await studio.send(accountId, input, mode)
        writeJson(res, 201, { message: result.message, evidence: result.evidence, warning: result.warning })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 草稿保存（创作台）
    route(XHS_API.studio + '/draft', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      if (studio === undefined) { writeJson(res, 400, { error: '创作台未就绪' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const accountId = typeof body.accountId === 'string' ? body.accountId : ''
      const copy = typeof body.copy === 'string' && body.copy.trim() !== '' ? body.copy : ''
      const coverPrompt = typeof body.coverPrompt === 'string' ? body.coverPrompt : ''
      if (accountId === '' || copy === '') { writeJson(res, 400, { error: 'accountId、copy 必填' }); return }
      // v3 草稿独立：topicId 已非必填，旧客户端传了也只忽略；证据字段可选透传。
      try {
        const draft = studio.saveDraft(accountId, {
          copy,
          coverPrompt,
          evidence: body.evidence as DraftEvidence | undefined,
        })
        writeJson(res, 201, { draft })
      } catch (error) { fail(res, error) }
    }),
  ]
}
