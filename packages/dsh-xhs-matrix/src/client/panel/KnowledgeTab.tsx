import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { ImportDialog } from './ImportDialog.tsx'

interface NoteRow {
  id: string; title: string; copy: string; publishedAt: string; source: string; weight: number; topic?: string
}
interface MetricRow { noteId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string }

const WEIGHTS = [0, 1, 2, 3, 4, 5] as const
type FilterId = 'all' | 'high' | 'pending' | 'recent'

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'high', label: '权重高' },
  { id: 'pending', label: '待补指标' },
  { id: 'recent', label: '最近发布' },
]

/**
 * 已发布知识库（设计稿 content/detail-surfaces.html）：
 * 筛选 chips + 笔记行（缩略图/指标/0-5 权重），权重即控制杆。
 */
export function KnowledgeTab({ api, accountId }: { api: XhsApi; accountId: string }) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [filter, setFilter] = useState<FilterId>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(async () => {
    if (accountId === '') { setNotes([]); setMetrics([]); return }
    try {
      const [noteList, metricList] = await Promise.all([api.listNotes(accountId), api.listMetrics(accountId)])
      setNotes(noteList)
      setMetrics(metricList)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId])

  useEffect(() => { void refresh() }, [refresh])

  /** 手动录入浏览量（运维用）：来源标记 manual，追加一条指标快照。 */
  const recordReads = async (noteId: string): Promise<void> => {
    const input = window.prompt('录入这篇笔记的浏览量（数字）', '')
    if (input === null) return
    const reads = Number(input.trim())
    if (!Number.isFinite(reads) || reads < 0) { setError('请输入非负数字'); return }
    try {
      await api.saveMetricSnapshot(accountId, noteId, Math.round(reads))
      setNotice(`已录入浏览量 ${Math.round(reads)}。`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const setWeight = async (noteId: string, weight: number): Promise<void> => {
    try {
      await api.setNoteWeight(accountId, noteId, weight)
      setNotice(`已设置权重 ${weight}，将影响下一次推荐。`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // 每篇笔记最新指标快照
  const latestByNote = new Map<string, MetricRow>()
  for (const m of metrics) {
    const prev = latestByNote.get(m.noteId)
    if (prev === undefined || m.collectedAt > prev.collectedAt) latestByNote.set(m.noteId, m)
  }

  const filtered = [...notes]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter(note => {
      if (filter === 'high') return note.weight >= 4
      if (filter === 'pending') return latestByNote.get(note.id) === undefined
      if (filter === 'recent') {
        const day = 30 * 24 * 60 * 60 * 1000
        return Date.now() - Date.parse(note.publishedAt) < day
      }
      return true
    })

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {notice !== '' && <div className={css.success}>{notice}</div>}
      {accountId === '' && <div className={css.empty}>请先在左侧选择账号。</div>}

      {accountId !== '' && (
        <>
          <div className={css.filterRow}>
            {FILTERS.map(f => (
              <button key={f.id} className={filter === f.id ? `${css.filter} ${css.on}` : css.filter} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button className={css.primary} onClick={() => setImporting(true)}>＋ 导入笔记</button>
          </div>

          {notes.length === 0 && <div className={css.empty}>该账号还没有已发布笔记。点击「导入笔记」粘贴 CSV/JSON 后台数据。</div>}
          {notes.length > 0 && filtered.length === 0 && <div className={css.muted}>当前筛选下没有笔记。</div>}

          {filtered.map(note => {
            const metric = latestByNote.get(note.id)
            return (
              <div key={note.id} className={css.libRow}>
                <div className={css.miniThumb} />
                <div className={css.libBody}>
                  <div className={css.libTitle}>{note.title}</div>
                  <div className={css.libMeta} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      发布 {note.publishedAt.slice(0, 10)}
                      {metric !== undefined
                        ? ` · 浏览 ${metric.reads.toLocaleString()} · 点赞 ${metric.likes} · 收藏 ${metric.favorites} · 评论 ${metric.comments}`
                        : ' · 指标待更新'}
                      {note.topic !== undefined && ` · ${note.topic}`}
                    </span>
                    <button
                      className={css.ghostBtn}
                      style={{ padding: '2px 10px', fontSize: 11, whiteSpace: 'nowrap', flex: 'none' }}
                      onClick={() => void recordReads(note.id)}
                    >录入浏览量</button>
                  </div>
                  <div className={css.weight}>
                    {WEIGHTS.map(weight => (
                      <button
                        key={weight}
                        className={note.weight === weight ? css.on : undefined}
                        onClick={() => void setWeight(note.id, weight)}
                        title={`权重 ${weight}`}
                      >{weight}</button>
                    ))}
                    <span className={css.muted} style={{ marginLeft: 8, alignSelf: 'center' }}>权重 {note.weight} / 5</span>
                  </div>
                </div>
              </div>
            )
          })}

          {importing && (
            <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--xhs-border)', borderRadius: 12, background: 'var(--xhs-card)' }}>
              <ImportDialog api={api} accountId={accountId} onDone={() => { void refresh(); setImporting(false) }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
