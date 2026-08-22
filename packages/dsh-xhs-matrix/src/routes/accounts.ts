/** /accounts 与 /accounts/import 路由：账号 CRUD 与已发布笔记导入。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { PersonaAssetService } from '../persona-assets.ts'
import { MatrixStore, type AccountPayload } from '../store.ts'
import { fail, guard, queryParam, readJsonBody, writeJson } from './shared.ts'

/** 构建账号路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export function makeAccountsRoutes(store: MatrixStore): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })
  const service = new PersonaAssetService(store)

  return [
    // ------------------------------------------------------------ 账号
    route(XHS_API.accounts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { accounts: store.listAccounts() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      try {
        if (method === 'POST') {
          const account = store.upsertAccount(body as unknown as AccountPayload)
          writeJson(res, 201, { account })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          let account = store.upsertAccount(body as unknown as AccountPayload, id)
          if (body.connection !== undefined) account = store.updateAccountConnection(id, body.connection as never)
          if (body.collection !== undefined) account = store.updateCollectionConfig(id, body.collection as never)
          writeJson(res, 200, { account })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          store.deleteAccount(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 账号导入
    route(XHS_API.accountImport, async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined || typeof body.accountId !== 'string' || (body.format !== 'csv' && body.format !== 'json') || typeof body.content !== 'string') {
        writeJson(res, 400, { error: 'accountId、format 和 content 必填' }); return
      }
      try {
        const account = store.listAccounts().find(item => item.id === body.accountId)
        if (account === undefined) { writeJson(res, 400, { error: '账号不存在：' + body.accountId }); return }
        // 目标人设：显式 personaId（导入目标=当前人设作用域）优先，缺省回退账号当前人设（legacy compat）。
        // accountId 仅作为来源快照与追踪，与目标 personaId 是两个角色（非 §7.2 查询作用域冲突），二者同时出现不 409。
        const targetPersonaId = typeof body.personaId === 'string' && body.personaId !== '' ? body.personaId : account.personaId
        if (targetPersonaId === '') { writeJson(res, 400, { error: '该账号尚未分配人设，或未指定目标人设' }); return }
        if (!store.listPersonas().some(persona => persona.id === targetPersonaId)) {
          writeJson(res, 404, { error: '人设不存在：' + targetPersonaId }); return
        }
        const { parsePublishedNoteImport } = await import('../importer.ts')
        const records = parsePublishedNoteImport(body.content, body.format)
        // 集中写路径：通过 PersonaAssetService.importNotes 落库；来源账号快照为当前导入账号。
        const notes = service.importNotes(targetPersonaId, records, account.id, account.name)
        writeJson(res, 201, { imported: notes.length })
      } catch (error) { fail(res, error) }
    }),
  ]
}
