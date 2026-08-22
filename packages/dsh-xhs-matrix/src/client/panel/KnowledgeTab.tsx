import { useCallback, useEffect, useMemo, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { NoteWeight, PendingOwnership, PublishedNote } from '../../types.ts'
import css from './panel.module.css'
import { ImportDialog } from './ImportDialog.tsx'
import { PersonaScopeSelector } from './PersonaScopeSelector.tsx'

const WEIGHTS = [0, 1, 2, 3, 4, 5] as const

/** 返回文本中命中的违禁词列表（仅用于参考素材警告，不阻止收录）。 */
function forbiddenHit(text: string, words: string[]): string[] {
  return words.filter(word => word !== '' && text.includes(word))
}

/** 已发布知识库（v4 人设资产视图，设计稿 persona-owned-content-ui-reference）： */
export function KnowledgeTab({ api, accountId, personaId, onPersonaChange }: { api: XhsApi; accountId: string; personaId: string; onPersonaChange: (id: string) => void }) {
  const [notes, setNotes] = useState<PublishedNote[]>([])
  const [allPersonas, setAllPersonas] = useState<Array<{ id: string; name: string; forbiddenWords: string[] }>>([])
  const [sharedAccounts, setSharedAccounts] = useState(0)
  const [pending, setPending] = useState<PendingOwnership[]>([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [transferNote, setTransferNote] = useState<PublishedNote | null>(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [pendingOpen, setPendingOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const persona = allPersonas.find(p => p.id === personaId)

  const refresh = useCallback(async (): Promise<void> => {
    if (personaId === '') { setNotes([]); return }
    try {
      setNotes(await api.listNotes(personaId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, personaId])

  useEffect(() => { void refresh() }, [refresh])

  // 当前人设（违禁词用于素材警告）+ 全部人设（转移目标下拉） + 共享账号数 + 待归属数。
  useEffect(() => {
    api.listPersonas()
      .then(list => setAllPersonas(list.map(p => ({ id: p.id, name: p.name, forbiddenWords: p.forbiddenWords ?? [] }))))
      .catch(() => setAllPersonas([]))
  }, [api])

  useEffect(() => {
    api.listAccounts()
      .then(list => setSharedAccounts(list.filter(a => a.personaId === personaId).length))
      .catch(() => setSharedAccounts(0))
  }, [api, personaId])

  useEffect(() => {
    api.listPending()
      .then(list => setPending(list))
      .catch(() => setPending([]))
  }, [api])

  const setWeight = async (noteId: string, weight: NoteWeight): Promise<void> => {
    try {
      await api.setNoteWeight(personaId, noteId, weight)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const transfer = async (): Promise<void> => {
    if (transferNote === null) return
    if (transferTarget === '' || transferTarget === personaId) return
    setBusy(true)
    try {
      await api.transferNotes(personaId, transferTarget, [transferNote.id])
      setTransferNote(null)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const assign = async (pendingId: string, kind: 'published-note' | 'viral-item'): Promise<void> => {
    // 归属目标人设由 entry 级选择下拉决定（每行一个 assignTarget）；这里用全局 assignTarget 简化归属。
    void kind
    if (assignTarget === '') return
    try {
      await api.assignPending(pendingId, assignTarget)
      setPending(prev => prev.filter(entry => entry.id !== pendingId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const sourceAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const note of notes) if (note.sourceAccountName !== undefined) set.add(note.sourceAccountName)
    return Array.from(set)
  }, [notes])

  const highCount = notes.filter(note => note.weight >= 4).length
  const filtered = notes
    .filter(note => {
      if (search !== '' && !(note.title.includes(search) || note.copy.includes(search))) return false
      if (sourceFilter !== '' && note.sourceAccountName !== sourceFilter) return false
      return true
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const personaName = persona?.name ?? (personaId === '' ? '未分配' : personaId)

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {accountId === '' && <div className={css.empty}>请先在左侧选择账号。</div>}

      {accountId !== '' && (
        <>
          <PersonaScopeSelector api={api} value={personaId} onChange={onPersonaChange} />
          {personaId === '' && <div className={css.empty}>该账号未绑定人设，请在右上角切换到某个人设，或先到「人设配置」为账号绑定人设。</div>}

          {personaId !== '' && (
            <>
              <div className={css.scopeBand}>
                <div>
                  <h2>{personaName} · 已发布知识库</h2>
                  <p>同一人设下的账号共同复用；发布账号作为来源快照保留。</p>
                </div>
                <div className={css.scopeStats}>
                  <div><b>{notes.length}</b><span>已发布</span></div>
                  <div><b>{highCount}</b><span>高权重</span></div>
                  <div><b>{sharedAccounts}</b><span>共享账号</span></div>
                </div>
              </div>

              <div className={css.toolbar}>
                <input className={css.input} style={{ width: 180 }} placeholder="搜索标题或正文" value={search} onChange={e => setSearch(e.target.value)} />
                <select className={css.input} aria-label="来源账号" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                  <option value="">全部来源账号</option>
                  {sourceAccounts.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <span className={css.spacer} />
                {pending.length > 0 && <button className={css.button} onClick={() => { setPendingOpen(true); setAssignTarget('') }}>待归属 {pending.length}</button>}
                <button className={css.primary} onClick={() => setImporting(true)}>导入已发布笔记</button>
              </div>

              {notes.length === 0 && <div className={css.empty}>该人设还没有已发布笔记。点击「导入已发布笔记」导入后台数据到该人设。</div>}
              {notes.length > 0 && filtered.length === 0 && <div className={css.muted}>当前筛选下没有笔记。</div>}

              {filtered.length > 0 && (
                <div className={css.noteGrid}>
                  {filtered.map(note => {
                    const hits = forbiddenHit(note.title + note.copy, persona?.forbiddenWords ?? [])
                    return (
                      <div key={note.id} className={css.noteCard}>
                        <div className={css.meta}>
                          <span className={css.chipGreen}>已发布</span>
                          {note.sourceAccountName !== undefined && <span className={css.chip}>来源：{note.sourceAccountName}</span>}
                        </div>
                        <h3>{note.title}</h3>
                        <p>{note.copy.length > 90 ? `${note.copy.slice(0, 90)}…` : note.copy}</p>
                        {hits.length > 0 && (
                          <div className={css.warning}>参考素材命中人设违禁词「{hits[0]}」：只警告，不阻止收录；生成内容会强制拦截。</div>
                        )}
                        <div className={css.itemActions}>
                          <span className={css.muted}>参考权重</span>
                          <div className={css.weight}>
                            {WEIGHTS.map(weight => (
                              <button
                                key={weight}
                                className={note.weight === weight ? css.on : undefined}
                                title={`权重 ${weight}`}
                                onClick={() => void setWeight(note.id, weight)}
                              >{weight}</button>
                            ))}
                          </div>
                          <button className={css.textAction} onClick={() => { setTransferNote(note); setTransferTarget('') }}>转移人设</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {importing && (
                <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--xhs-border)', borderRadius: 12, background: 'var(--xhs-card)' }}>
                  <ImportDialog api={api} accountId={accountId} personaId={personaId} onDone={() => { void refresh(); setImporting(false) }} />
                </div>
              )}

              {transferNote !== null && (
                <div className={css.overlay} onClick={() => setTransferNote(null)}>
                  <div className={css.dialog} onClick={e => e.stopPropagation()}>
                    <button className={css.dialogClose} onClick={() => setTransferNote(null)} aria-label="关闭">×</button>
                    <h3>转移笔记到其他人设</h3>
                    <div className={css.field}><label>目标人设</label>
                      <select className={css.input} aria-label="转移目标人设" value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                        <option value="">选择目标人设</option>
                        {allPersonas.filter(p => p.id !== personaId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className={css.rowActions}>
                      <button className={css.primary} disabled={busy || transferTarget === '' || transferTarget === personaId} onClick={() => void transfer()}>确认转移</button>
                      <button className={css.ghostBtn} onClick={() => setTransferNote(null)}>取消</button>
                    </div>
                  </div>
                </div>
              )}

              {pendingOpen && (
                <div className={css.overlay} onClick={() => setPendingOpen(false)}>
                  <div className={css.dialog} onClick={e => e.stopPropagation()}>
                    <button className={css.dialogClose} onClick={() => setPendingOpen(false)} aria-label="关闭">×</button>
                    <h3>待归属数据</h3>
                    <div className={css.muted} style={{ marginBottom: 10 }}>以下内容在迁移时无法解析人设，请显式归属到目标人设。</div>
                    {pending.length === 0 && <div className={css.muted}>没有待归属数据。</div>}
                    {pending.map(entry => (
                      <div key={entry.id} className={css.field} style={{ borderTop: '1px solid var(--xhs-border)', paddingTop: 10 }}>
                        <label>{(entry.payload as { title?: string }).title ?? entry.kind}</label>
                        <select className={css.input} aria-label="归属目标人设" value={assignTarget} onChange={e => setAssignTarget(e.target.value)}>
                          <option value="">选择目标人设</option>
                          {allPersonas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className={css.primary} style={{ marginTop: 8 }} onClick={() => void assign(entry.id, entry.kind)}>归属到该人设</button>
                      </div>
                    ))}
                    <div className={css.rowActions}><button className={css.ghostBtn} onClick={() => setPendingOpen(false)}>关闭</button></div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}