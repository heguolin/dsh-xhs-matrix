import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { DraftEditor } from './DraftEditor.tsx'

interface DraftRow {
  id: string; accountId: string; topicId: string; date: string
  copy: string; coverPrompt: string; tags?: string; status: string
  metrics?: { reads: number; likes: number; comments: number; collected: string }
  evidence?: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }
}

/** 草稿 Tab：展开编辑（DraftEditor）、标记 published/dropped、录入指标、来源依据。 */
export function DraftsTab({ api }: { api: XhsApi }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDrafts(await api.listDrafts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const toggleExpand = (id: string): void => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const copyDraft = async (draft: DraftRow): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`【标题】${draft.copy}\n【封面提示词】${draft.coverPrompt}`)
    } catch {
      setError('复制失败：请手动复制')
    }
  }

  const publish = async (draft: DraftRow): Promise<void> => {
    const reads = window.prompt(`录入「${draft.date}」草稿的阅读量（留空跳过指标）`, '')
    if (reads === null) return
    const metrics = reads.trim() === ''
      ? undefined
      : { reads: Number(reads) || 0, likes: 0, comments: 0, collected: new Date().toISOString() }
    try {
      await api.setDraftStatus(draft.id, 'published', metrics)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const drop = async (draft: DraftRow): Promise<void> => {
    try {
      await api.setDraftStatus(draft.id, 'dropped')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {drafts.length === 0 && <div className={css.muted}>暂无草稿。在「创作台」中生成，或在对话中问「今天要发什么」。</div>}
      {drafts.map(draft => {
        const expanded = expandedId === draft.id
        const editing = editingId === draft.id
        return (
          <div key={draft.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
            <div style={{ width: '100%' }}>
              <span style={{ fontWeight: 600 }}>{draft.date}</span>
              <span className={css.muted} style={{ marginLeft: 10 }}>账号 {draft.accountId} / 选题 {draft.topicId}</span>
              {draft.status === 'generated' ? <span className={css.badgeGray} style={{ marginLeft: 10 }}>已生成</span>
                : draft.status === 'published' ? <span className={css.badgeGreen} style={{ marginLeft: 10 }}>已发布</span>
                : <span className={css.badgeGray} style={{ marginLeft: 10 }}>已弃用</span>}
              {draft.metrics !== undefined && <span className={css.badge} style={{ marginLeft: 10 }}>阅读 {draft.metrics.reads}</span>}
            </div>
            <button
              className={css.button}
              style={{ alignSelf: 'stretch', textAlign: 'left', whiteSpace: 'pre-wrap', cursor: 'pointer' }}
              onClick={() => toggleExpand(draft.id)}
              title={expanded ? '收起' : '点击查看完整文案'}
            >
              {expanded
                ? <><span style={{ fontWeight: 600 }}>{draft.copy.split('\n')[0]}</span>{'\n'}{draft.copy}</>
                : <span className={css.muted}>{draft.copy.slice(0, 80)}{draft.copy.length > 80 ? '…' : ''}</span>}
            </button>
            {expanded && (
              <div style={{ width: '100%' }}>
                {editing
                  ? <DraftEditor api={api} accountId={draft.accountId} draft={draft} onSaved={() => { setEditingId(null); void refresh() }} />
                  : (
                    <>
                      <div className={css.field}>
                        <label>封面提示词</label>
                        <div className={css.muted} style={{ whiteSpace: 'pre-wrap' }}>{draft.coverPrompt || '—'}</div>
                      </div>
                      {draft.metrics !== undefined && (
                        <div className={css.field}>
                          <label>流量指标</label>
                          <div className={css.muted}>阅读 {draft.metrics.reads} · 点赞 {draft.metrics.likes} · 评论 {draft.metrics.comments}（采集于 {draft.metrics.collected.slice(0, 10)}）</div>
                        </div>
                      )}
                      {draft.evidence !== undefined && draft.evidence.reasons.length > 0 && (
                        <div className={css.field}>
                          <label>生成依据</label>
                          <div className={css.muted}>{draft.evidence.reasons.join('；')}{draft.evidence.persona !== undefined && draft.evidence.persona !== '' ? `（人设：${draft.evidence.persona}）` : ''}</div>
                        </div>
                      )}
                      <button className={css.button} onClick={() => void copyDraft(draft)}>复制文案</button>
                      <button className={css.button} style={{ marginLeft: 8 }} onClick={() => setEditingId(draft.id)}>编辑</button>
                    </>
                  )}
              </div>
            )}
            {draft.status === 'generated' && (
              <div>
                <button className={css.primary} onClick={() => void publish(draft)}>标记已发布</button>
                <button className={`${css.button} ${css.danger}`} onClick={() => void drop(draft)}>标记弃用</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
