import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { StatusBadge } from './StatusBadge.tsx'

interface AccountRow {
  id: string; name: string; personaId: string; enabled: boolean
  connection?: { profileUrl?: string; externalId?: string; status: string; source?: string; lastError?: string; lastSuccessAt?: string }
  collectionStatus?: { running: boolean; lastStatus: string; lastSuccessAt?: string; lastError?: string }
}

interface NoteRow { id: string; title: string; weight: number; publishedAt: string }
interface MetricRow { noteId: string; reads: number; collectedAt: string }
interface TrendRow { id: string; title: string }

/**
 * 运营总览（设计稿 content/hybrid-layout.html）：
 * 账号表现指标卡 + 高权重历史内容 + 专属创作台摘要 + 今日趋势选题。
 */
export function OverviewTab({ api, accountId, accounts, onOpenStudio }: {
  api: XhsApi; accountId: string; accounts: AccountRow[]; onOpenStudio: (id: string) => void
}) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [trends, setTrends] = useState<TrendRow[]>([])
  const [draftsCount, setDraftsCount] = useState(0)
  const [personaName, setPersonaName] = useState('')
  const [error, setError] = useState('')
  const [collecting, setCollecting] = useState(false)
  const [manualTopic, setManualTopic] = useState('')

  const account = accounts.find(item => item.id === accountId)

  const refresh = useCallback(async () => {
    if (accountId === '') { setNotes([]); setMetrics([]); setTrends([]); setDraftsCount(0); setPersonaName(''); return }
    try {
      const [noteList, metricList, trendList, draftList, personaList] = await Promise.all([
        api.listNotes(accountId),
        api.listMetrics(accountId),
        api.listTrends(accountId),
        api.listDrafts(),
        api.listPersonas(),
      ])
      setNotes(noteList)
      setMetrics(metricList)
      setTrends(trendList)
      setDraftsCount(draftList.filter(d => d.accountId === accountId && d.status === 'generated').length)
      const persona = personaList.find(p => p.id === accounts.find(a => a.id === accountId)?.personaId)
      setPersonaName(persona?.name ?? '')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId, accounts])

  useEffect(() => { void refresh() }, [refresh])

  // 每篇笔记的最新指标快照（按 collectedAt 取最近一次）
  const latestByNote = new Map<string, MetricRow>()
  for (const m of metrics) {
    const prev = latestByNote.get(m.noteId)
    if (prev === undefined || m.collectedAt > prev.collectedAt) latestByNote.set(m.noteId, m)
  }
  const weekReads = [...latestByNote.values()].reduce((sum, m) => sum + m.reads, 0)
  const highWeight = [...notes].filter(n => n.weight >= 3).sort((a, b) => b.weight - a.weight).slice(0, 5)

  const collect = async (): Promise<void> => {
    if (accountId === '') return
    setCollecting(true)
    try {
      await api.collectTrends(accountId, undefined, 10)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCollecting(false)
    }
  }

  const addManualTopic = async (): Promise<void> => {
    const title = manualTopic.trim()
    if (title === '') return
    try {
      await api.addTopic(title)
      setManualTopic('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (accountId === '') {
    return (
      <div>
        <div className={css.empty}>还没有选择账号。先在左侧「我的账号」选择一个账号，或点击右上角「＋ 添加账号」创建。</div>
      </div>
    )
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}

      <div className={css.overview}>
        {/* 左：账号表现 + 高权重历史内容 */}
        <section className={css.panel}>
          <div className={css.panelTitle}>
            <span>账号表现 · {account?.name ?? ''}</span>
            {account?.connection !== undefined && <StatusBadge status={account.connection.status} />}
          </div>
          <div className={css.metrics}>
            <div className={css.metric}>已发布<b>{notes.length}</b></div>
            <div className={css.metric}>最近浏览<b>{weekReads.toLocaleString()}</b></div>
            <div className={css.metric}>待处理草稿<b>{String(draftsCount).padStart(2, '0')}</b></div>
          </div>
          <div className={css.panelTitle} style={{ marginTop: 16 }}>
            <span>高权重历史内容</span>
            <span className={css.muted}>权重 ≥ 3 优先进入创作上下文</span>
          </div>
          {highWeight.length === 0 && <div className={css.muted}>还没有高权重笔记。在「已发布知识库」中给笔记打权重。</div>}
          {highWeight.map(note => (
            <div key={note.id} className={css.post}>
              <div className={css.thumb} />
              <div className={css.postBody}>
                <div className={css.postTitle}>{note.title}</div>
                <div className={css.postMeta}>
                  浏览 {latestByNote.get(note.id)?.reads?.toLocaleString() ?? '—'} · 权重 {note.weight}
                </div>
                <div className={css.bar}><i style={{ width: `${note.weight * 20}%` }} /></div>
              </div>
            </div>
          ))}
        </section>

        {/* 右：专属创作台摘要 */}
        <section className={`${css.panel} ${css.chat}`}>
          <div className={css.chathead}>
            <span>专属创作台</span>
            <span className={css.pill}>百万上下文</span>
          </div>
          <div className={css.bubble}>已加载本账号人设、{notes.length} 篇已发布笔记（含 {highWeight.length} 篇高权重）和 {trends.length} 个外部趋势样本。</div>
          <div className={css.bubble} style={{ alignSelf: 'flex-end', background: 'var(--xhs-red)', color: '#fff' }}>先给我 3 个今天适合写的选题</div>
          <div className={css.bubble}>正在按人设标准筛选……点击「专属创作台」可进入完整对话。</div>
          <div className={css.chatInput}>
            <span>输入创作指令……</span>
            <button className={css.chatSend} onClick={() => onOpenStudio(accountId)}>进入创作台</button>
          </div>
        </section>
      </div>

      {/* 下：今日趋势选题 */}
      <div className={css.below}>
        <section className={css.panel}>
          <div className={css.panelTitle}>
            <span>今日趋势选题</span>
            <button className={css.ghostBtn} onClick={() => void collect()} disabled={collecting}>
              {collecting ? '采集中…' : '获取最新候选'}
            </button>
          </div>
          <div className={css.chips}>
            {trends.length === 0 && <span className={css.muted}>暂无趋势样本，点击「获取最新候选」从 Apify 采集。</span>}
            {trends.slice(0, 12).map(trend => <span key={trend.id} className={css.chip}>{trend.title.length > 14 ? `${trend.title.slice(0, 14)}…` : trend.title}</span>)}
          </div>
        </section>
        <section className={css.panel}>
          <div className={css.panelTitle}><span>手动添加选题</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className={css.chipInput} value={manualTopic} onChange={e => setManualTopic(e.target.value)} placeholder="输入一个选题标题" />
            <button className={css.primary} onClick={() => void addManualTopic()}>加入选题池</button>
          </div>
        </section>
      </div>
    </div>
  )
}
