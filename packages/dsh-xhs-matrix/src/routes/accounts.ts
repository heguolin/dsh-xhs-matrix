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
        if (account.personaId === '') { writeJson(res, 400, { error: '该账号尚未分配人设' }); return }
        const { parsePublishedNoteImport } = await import('../importer.ts')
        const records = parsePublishedNoteImport(body.content, body.format)
        // 集中写路径：通过 PersonaAssetService.importNotes 落库，避免与 importer 重复维护写路径。
        const notes = service.importNotes(account.personaId, records, account.id, account.name)
        writeJson(res, 201, { imported: notes.length })
      } catch (error) { fail(res, error) }
    }),
  ]
}
