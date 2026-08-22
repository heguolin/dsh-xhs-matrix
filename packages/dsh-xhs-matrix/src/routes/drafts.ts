/** /drafts 草稿路由：列表、创建、编辑与状态回填。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from '../loopback.ts'
import { XHS_API } from '../protocol.ts'
import { MatrixStoreError, type DraftPayload, type MatrixStore } from '../store.ts'
import type { DraftMetrics, DraftStatus } from '../types.ts'
import { fail, guard, queryParam, readJsonBody, writeJson } from './shared.ts'

/** 草稿创建必填字段（v3 草稿独立，不含 topicId）。 */
const REQUIRED_DRAFT_FIELDS = ['accountId', 'date', 'copy', 'coverPrompt'] as const

/**
 * 构建 /drafts 草稿路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export function makeDraftsRoutes(store: MatrixStore): WebRoute[] {
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  return [
    route(XHS_API.drafts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { drafts: store.listDrafts() }); return }

      // webserver 按 path 注册路由，PATCH 与 GET/POST 共用同一 handler。
      if (method === 'PATCH') {
        const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'draft')
        if (id === undefined) { writeJson(res, 400, { error: 'draft 查询参数必填' }); return }
        const body = await readJsonBody(req)
        if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
        const payload: { copy?: string; coverPrompt?: string; tags?: string } = {}
        if (body.copy !== undefined) { if (typeof body.copy !== 'string') { writeJson(res, 400, { error: 'copy 必须是字符串' }); return }; payload.copy = body.copy }
        if (body.coverPrompt !== undefined) { if (typeof body.coverPrompt !== 'string') { writeJson(res, 400, { error: 'coverPrompt 必须是字符串' }); return }; payload.coverPrompt = body.coverPrompt }
        if (body.tags !== undefined) { if (typeof body.tags !== 'string') { writeJson(res, 400, { error: 'tags 必须是字符串' }); return }; payload.tags = body.tags }
        try {
          const draft = store.updateDraft(id, payload)
          writeJson(res, 200, { draft })
        } catch (error) { fail(res, error) }
        return
      }

      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      // 落库前校验必填字段：缺失拒绝，避免垃圾草稿持久化后再抛错。
      for (const field of REQUIRED_DRAFT_FIELDS) {
        const value = body[field]
        if (typeof value !== 'string' || value.trim() === '') {
          writeJson(res, 400, { error: `草稿字段 ${field} 必填` })
          return
        }
      }
      // 显式构造载荷：只透传 v3 草稿字段，忽略客户端多余的旧字段（如 topicId）。
      const payload: DraftPayload = {
        accountId: body.accountId as string,
        date: body.date as string,
        copy: body.copy as string,
        coverPrompt: body.coverPrompt as string,
      }
      try {
        const draft = store.saveDraft(payload)
        writeJson(res, 201, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------- 草稿状态回填
    route(XHS_API.drafts + '/status', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const draftId = typeof body.draftId === 'string' ? body.draftId : ''
      const status = body.status as DraftStatus | undefined
      const metrics = body.metrics as DraftMetrics | undefined
      if (draftId === '' || (status !== 'generated' && status !== 'published' && status !== 'dropped')) {
        writeJson(res, 400, { error: 'draftId 与合法 status 必填' })
        return
      }
      if (body.metrics !== undefined) {
        const m = body.metrics as Record<string, unknown> | null
        if (typeof m !== 'object' || m === null
          || typeof m.reads !== 'number' || typeof m.likes !== 'number'
          || typeof m.comments !== 'number' || typeof m.collected !== 'string') {
          writeJson(res, 400, { error: 'metrics 需含数值 reads/likes/comments 与字符串 collected' })
          return
        }
      }
      try {
        const wasPublished = store.listDrafts().find(d => d.id === draftId)?.status === 'published'
        const draft = store.setDraftStatus(draftId, status, metrics)
        // 标记发布后自动进入该账号知识库：标题取首行，正文取其余，
        // 权重默认 0（后续在知识库手动打分）；重复发布不重复入库。
        let note: unknown
        if (status === 'published' && !wasPublished) {
          const account = store.listAccounts().find(item => item.id === draft.accountId)
          if (account === undefined || account.personaId === '') throw new MatrixStoreError('该账号尚未分配人设，无法写入知识库')
          const lines = draft.copy.split('\n')
          const title = (lines[0] ?? '').trim().slice(0, 60) || '未命名笔记'
          const body = lines.slice(1).join('\n').trim() || draft.copy
          note = store.savePublishedNote({
            personaId: account.personaId,
            sourceAccountId: draft.accountId,
            sourceAccountName: account.name,
            title,
            copy: body,
            topic: draft.tags !== undefined && draft.tags !== '' ? draft.tags.replace(/#/g, ' ').trim().slice(0, 100) : undefined,
            publishedAt: new Date().toISOString().slice(0, 10),
            source: 'manual',
            weight: 0,
          })
        }
        writeJson(res, 200, { draft, note })
      } catch (error) {
        fail(res, error)
      }
    }),
  ]
}
