import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface DraftRow {
  id: string; accountId: string; topicId: string; date: string
  copy: string; coverPrompt: string; status: string
  metrics?: { reads: number; likes: number; comments: number; collected: string }
}

/** 草稿 Tab：查看、标记 published/dropped、录入指标。 */
export function DraftsTab({ api }: { api: XhsApi }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setDrafts(await api.listDrafts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

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
      {drafts.length === 0 && <div className={css.muted}>暂无草稿。在对话中问「今天要发什么」生成。 </div>}
      {drafts.map(draft => (
        <div key={draft.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div>
            <span style={{ fontWeight: 600 }}>{draft.date}</span>
            <span className={css.muted} style={{ marginLeft: 10 }}>账号 {draft.accountId} / 选题 {draft.topicId}</span>
            {draft.status === 'generated' ? <span className={css.badgeGray} style={{ marginLeft: 10 }}>已生成</span>
              : draft.status === 'published' ? <span className={css.badgeGreen} style={{ marginLeft: 10 }}>已发布</span>
              : <span className={css.badgeGray} style={{ marginLeft: 10 }}>已弃用</span>}
            {draft.metrics !== undefined && <span className={css.badge} style={{ marginLeft: 10 }}>阅读 {draft.metrics.reads}</span>}
          </div>
          <div className={css.muted}>{draft.copy.slice(0, 80)}{draft.copy.length > 80 ? '…' : ''}</div>
          <div>
            {draft.status === 'generated' && (
              <>
                <button className={css.primary} onClick={() => void publish(draft)}>标记已发布</button>
                <button className={`${css.button} ${css.danger}`} onClick={() => void drop(draft)}>标记弃用</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
