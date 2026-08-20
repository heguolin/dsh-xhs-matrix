import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface NoteRow {
  id: string; title: string; copy: string; publishedAt: string; source: string; weight: number; topic?: string
}

const WEIGHTS = [0, 1, 2, 3, 4, 5] as const

/** 已发布知识库：指标摘要 + 0-5 权重。 */
export function KnowledgeTab({ api, accountId }: { api: XhsApi; accountId: string }) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      setNotes(await api.listNotes(accountId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId])

  useEffect(() => { void refresh() }, [refresh])

  const setWeight = async (noteId: string, weight: number): Promise<void> => {
    try {
      await api.setNoteWeight(accountId, noteId, weight)
      setNotice(`已设置权重 ${weight}，将影响下一次推荐。`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {notice !== '' && <div className={css.success}>{notice}</div>}
      {notes.length === 0 && <div className={css.empty}>该账号还没有已发布笔记。使用「导入」或从创作台保存后回填。</div>}
      {notes.map(note => (
        <div key={note.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div style={{ width: '100%' }}>
            <span style={{ fontWeight: 600 }}>{note.title}</span>
            {note.topic !== undefined && <span className={css.muted} style={{ marginLeft: 10 }}>{note.topic}</span>}
            <span className={css.muted} style={{ marginLeft: 10 }}>{note.publishedAt.slice(0, 10)}</span>
          </div>
          <div className={css.muted} style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{note.copy.slice(0, 120)}{note.copy.length > 120 ? '…' : ''}</div>
          <div>
            {WEIGHTS.map(weight => (
              <button
                key={weight}
                className={`${css.button} ${note.weight === weight ? css.tabActive : ''}`}
                onClick={() => void setWeight(note.id, weight)}
              >{weight}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
