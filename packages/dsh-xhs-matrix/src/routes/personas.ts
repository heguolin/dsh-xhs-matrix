/** /personas 与 /pending-ownership 路由：人设 CRUD（含删除守卫）与待归属处理。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { PersonaAssetService } from '../persona-assets.ts'
import { MatrixStore, type PersonaPayload } from '../store.ts'
import { fail, HttpError, queryParam, readJsonBody, writeJson } from './shared.ts'

/** 构建人设路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export function makePersonasRoutes(store: MatrixStore): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })
  const service = new PersonaAssetService(store)

  return [
    // ------------------------------------------------------------ 人设
    route(XHS_API.personas, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { personas: store.listPersonas() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'persona')
      try {
        if (method === 'POST') {
          const persona = store.upsertPersona(body as unknown as PersonaPayload)
          writeJson(res, 201, { persona })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          writeJson(res, 200, { persona: store.upsertPersona(body as unknown as PersonaPayload, id) })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          // 领域不变量：人设仍有绑定账号或内容资产时禁止删除，防止产生悬空数据。
          if (!store.listPersonas().some(item => item.id === id)) throw new HttpError(404, '人设不存在：' + id)
          const usage = service.personaInUse(id)
          if (usage.accountCount > 0 || usage.noteCount > 0 || usage.viralCount > 0) {
            writeJson(res, 409, {
              error: '该人设仍有绑定账号或内容资产，请先转移或处理',
              usage,
            })
            return
          }
          store.deletePersona(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 待归属
    route(XHS_API.pendingOwnership, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') {
        writeJson(res, 200, { pending: service.listPending() })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = typeof body.id === 'string' && body.id !== '' ? body.id : ''
      const targetPersonaId = typeof body.targetPersonaId === 'string' && body.targetPersonaId !== '' ? body.targetPersonaId : ''
      if (id === '' || targetPersonaId === '') { writeJson(res, 400, { error: 'id 与 targetPersonaId 必填' }); return }
      try {
        if (!store.listPersonas().some(item => item.id === targetPersonaId)) throw new HttpError(404, '人设不存在：' + targetPersonaId)
        const asset = service.assignPending(id, targetPersonaId)
        writeJson(res, 200, { asset })
      } catch (error) { fail(res, error) }
    }),
  ]
}