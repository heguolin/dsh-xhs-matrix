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
    await api.setDraftStatus(draft.id, 'published', metrics)
    await refresh()
  }

  const drop = async (draft: DraftRow): Promise<void> => {
    await api.setDraftStatus(draft.id, 'dropped')
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {drafts.length === 0 && <div className={css.muted}>暂无草稿。在对话中问「今天要发什么」生成。 </div>}
      {drafts.map(draft => (
        <div key={draft.id} className={css.row} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div>
            <span>{draft.date}</span>
            <span className={css.muted}> 账号 {draft.accountId} / 选题 {draft.topicId}</span>
            <span className={css.muted}> {draft.status}{draft.metrics !== undefined ? ` · 阅读 ${draft.metrics.reads}` : ''}</span>
          </div>
          <div className={css.muted}>{draft.copy.slice(0, 80)}{draft.copy.length > 80 ? '…' : ''}</div>
          <div>
            {draft.status === 'generated' && (
              <>
                <button className={css.button} onClick={() => void publish(draft)}>标记已发布</button>
                <button className={`${css.button} ${css.danger}`} onClick={() => void drop(draft)}>标记弃用</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
