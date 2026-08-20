/** /personas 路由：人设 CRUD。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { MatrixStore, type PersonaPayload } from '../store.ts'
import { fail, queryParam, readJsonBody, writeJson } from './shared.ts'

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
          store.deletePersona(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
  ]
}
