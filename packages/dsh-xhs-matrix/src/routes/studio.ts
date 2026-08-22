/** /studio 创作台路由：会话消息收发、两阶段结构化 SSE 流式与草稿保存。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import type { MatrixStore } from '../store.ts'
import { QualityBlockedError, type StudioService, type StudioSseEvent } from '../studio.ts'
import type { DraftEvidence } from '../types.ts'
import { fail, guard, queryParam, readJsonBody, writeJson } from './shared.ts'

/** 写一条结构化 SSE 事件。 */
function writeSse(res: ServerResponse, event: StudioSseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

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
        // 创作台只读取当前账号且当前人设快照匹配的消息，避免账号换绑后混入旧人设会话。
        const personaId = store.listAccounts().find(item => item.id === accountId)?.personaId ?? ''
        writeJson(res, 200, { messages: store.listStudioMessages(accountId, personaId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (studio === undefined) { writeJson(res, 400, { error: '创作台未就绪' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const input = typeof body.input === 'string' && body.input.trim() !== '' ? body.input.trim() : ''
      const mode = body.mode === 'full' ? 'full' : 'creative'
      const stream = body.stream === true
      const requestId = typeof body.requestId === 'string' && body.requestId !== '' ? body.requestId : undefined
      if (input === '') { writeJson(res, 400, { error: 'input 必填' }); return }
      if (stream) {
        // 进行中去重（REQUEST_IN_PROGRESS）：必须在写 SSE 200 头之前判定，才能返回 409。
        if (requestId !== undefined && studio.isInFlight(requestId)) {
          writeJson(res, 409, { error: 'REQUEST_IN_PROGRESS: 相同请求正在进行中' })
          return
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        try {
          // 事件由 studio.sendStream 经 onEvent 逐条转发（phase/evidence/plan_delta/content_delta/quality/done）。
          await studio.sendStream(accountId, input, mode, event => writeSse(res, event), { requestId })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          writeSse(res, { type: 'error', stage: 'stream', retryable: true, message })
        } finally {
          res.end()
        }
        return
      }
      try {
        const result = await studio.send(accountId, input, mode)
        writeJson(res, 201, { message: result.message, evidence: result.evidence, warning: result.warning })
      } catch (error) {
        if (error instanceof QualityBlockedError) { writeJson(res, 409, { error: 'QUALITY_BLOCKED: ' + error.message }); return }
        fail(res, error)
      }
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
      } catch (error) {
        // 违禁词命中：禁止保存，返回 409 QUALITY_BLOCKED。
        if (error instanceof QualityBlockedError) { writeJson(res, 409, { error: 'QUALITY_BLOCKED: ' + error.message }); return }
        fail(res, error)
      }
    }),
  ]
}
