/** /notes 与 /metrics 路由：已发布笔记知识库（权重）、显式转移与指标快照、按账号采集。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { CollectionScheduler, validateMetricSnapshot, type MetricSnapshotInput } from '../metrics.ts'
import { PersonaAssetService } from '../persona-assets.ts'
import { MatrixStore } from '../store.ts'
import type { NoteWeight } from '../types.ts'
import { fail, guard, HttpError, queryParam, readJsonBody, resolvePersonaScope, writeJson } from './shared.ts'

/** 构建知识库与指标路由。
 * @param store - 矩阵存储。
 * @param scheduler - 指标采集调度器（未配置时 collect 返回 400）。
 * @returns 路由数组。
 */
export function makeKnowledgeRoutes(store: MatrixStore, scheduler?: CollectionScheduler): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })
  const service = new PersonaAssetService(store)

  return [
    route(XHS_API.notes, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')
      const personaId = queryParam(url, 'persona')
      const noteId = queryParam(url, 'note')

      if (method === 'GET') {
        try {
          const resolved = resolvePersonaScope(store, accountId, personaId)
          writeJson(res, 200, { notes: service.listNotes(resolved), resolvedPersonaId: resolved })
        } catch (error) { fail(res, error) }
        return
      }

      if (method !== 'PATCH') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (noteId === undefined || (accountId === undefined && personaId === undefined)) {
        writeJson(res, 400, { error: 'account/persona 与 note 查询参数必填' }); return
      }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const weight = body.weight
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 0 || weight > 5) {
        writeJson(res, 400, { error: 'weight 必须是 0-5 的整数' }); return
      }
      try {
        const resolved = resolvePersonaScope(store, accountId, personaId)
        if (resolved === '') { writeJson(res, 400, { error: '该账号尚未分配人设' }); return }
        const note = service.setNoteWeight(resolved, noteId, weight as NoteWeight)
        writeJson(res, 200, { note })
      } catch (error) { fail(res, error) }
    }),
    route(XHS_API.notesTransfer, async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const personaId = typeof body.personaId === 'string' && body.personaId !== '' ? body.personaId : ''
      const targetPersonaId = typeof body.targetPersonaId === 'string' && body.targetPersonaId !== '' ? body.targetPersonaId : ''
      const noteIds = Array.isArray(body.noteIds) ? (body.noteIds.filter((value: unknown) => typeof value === 'string') as string[]) : []
      if (personaId === '' || targetPersonaId === '' || noteIds.length === 0) { writeJson(res, 400, { error: 'personaId、targetPersonaId 与 noteIds 必填' }); return }
      try {
        resolvePersonaScope(store, undefined, personaId)
        if (!store.listPersonas().some(item => item.id === targetPersonaId)) throw new HttpError(404, '人设不存在：' + targetPersonaId)
        const notes = service.transferNotes(personaId, noteIds, targetPersonaId)
        writeJson(res, 200, { notes })
      } catch (error) { fail(res, error) }
    }),
    route(XHS_API.metrics, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')
      const noteId = queryParam(url, 'note')
      if (method === 'GET') {
        if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
        writeJson(res, 200, { metrics: store.listMetricSnapshots(accountId, noteId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      try {
        const snapshot = validateMetricSnapshot({
          accountId: body.accountId, noteId: body.noteId,
          reads: body.reads, likes: body.likes, favorites: body.favorites, comments: body.comments,
          shares: body.shares, source: body.source, collectedAt: body.collectedAt,
        } as MetricSnapshotInput)
        const saved = store.saveMetricSnapshot(snapshot)
        writeJson(res, 201, { metric: saved })
      } catch (error) { fail(res, error) }
    }),
    route(XHS_API.metrics + '/collect', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const accountId = typeof body.accountId === 'string' && body.accountId !== '' ? body.accountId : ''
      if (accountId === '') { writeJson(res, 400, { error: 'accountId 必填' }); return }
      if (scheduler === undefined) { writeJson(res, 400, { error: '未配置采集调度器' }); return }
      try {
        await scheduler.runAccount(accountId)
        const account = store.listAccounts().find(item => item.id === accountId)
        writeJson(res, 200, { status: account?.collectionStatus })
      } catch (error) { fail(res, error) }
    }),
  ]
}