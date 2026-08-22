/** /notes 与 /metrics 路由：已发布笔记知识库（权重）与指标快照、按账号采集。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { CollectionScheduler, validateMetricSnapshot, type MetricSnapshotInput } from '../metrics.ts'
import { MatrixStore } from '../store.ts'
import type { NoteWeight } from '../types.ts'
import { fail, guard, queryParam, readJsonBody, writeJson } from './shared.ts'

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

  return [
    // ------------------------------------------------------------ 已发布笔记
    route(XHS_API.notes, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')
      const noteId = queryParam(url, 'note')
      if (method === 'GET') {
        if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
        const account = store.listAccounts().find(item => item.id === accountId)
        if (account === undefined) { writeJson(res, 400, { error: '账号不存在：' + accountId }); return }
        writeJson(res, 200, { notes: store.listPublishedNotes(account.personaId) })
        return
      }
      if (method !== 'PATCH') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (accountId === undefined || noteId === undefined) { writeJson(res, 400, { error: 'account 与 note 查询参数必填' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const weight = body.weight
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 0 || weight > 5) {
        writeJson(res, 400, { error: 'weight 必须是 0-5 的整数' }); return
      }
      try {
        const account = store.listAccounts().find(item => item.id === accountId)
        if (account === undefined) { writeJson(res, 400, { error: '账号不存在：' + accountId }); return }
        const note = store.setNoteWeight(account.personaId, noteId, weight as NoteWeight)
        writeJson(res, 200, { note })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 指标
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
    // ------------------------------------------------------------ 指标采集
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
