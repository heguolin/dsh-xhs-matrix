import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { NoteWeight, PendingOwnership, ViralBatch, ViralItem, ViralStatus } from '../../types.ts'
import css from './panel.module.css'
import { PersonaScopeSelector } from './PersonaScopeSelector.tsx'

const WEIGHTS = [0, 1, 2, 3, 4, 5] as const
const BODY_PREVIEW_LENGTH = 90

const SOURCE_LABEL: Record<string, string> = { apify: '自动采集', manual: '手动新增', import: '导入' }

function forbiddenHit(text: string, words: string[]): string[] {
  return words.filter(word => word !== '' && text.includes(word))
}

export function ViralTab({ api, accountId, personaId, onPersonaChange }: { api: XhsApi; accountId: string; personaId: string; onPersonaChange: (id: string) => void }) {
  const [batches, setBatches] = useState<Array<ViralBatch & { items: ViralItem[] }>>([])
  const [allPersonas, setAllPersonas] = useState<Array<{ id: string; name: string; forbiddenWords: string[] }>>([])
  const [sharedAccounts, setSharedAccounts] = useState(0)
  const [pending, setPending] = useState<PendingOwnership[]>([])
  const [filter, setFilter] = useState<'' | ViralStatus>('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [error, setError] = useState('')
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualBody, setManualBody] = useState('')
  const [manualSourceUrl, setManualSourceUrl] = useState('')
  const [manualPublishedAt, setManualPublishedAt] = useState('')
  const [transferItem, setTransferItem] = useState<ViralItem | null>(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [pendingOpen, setPendingOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [reviewingId, setReviewingId] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [apifyConfigured, setApifyConfigured] = useState(false)
  const [actorId, setActorId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [maxItems, setMaxItems] = useState('10')
  const [savingConfig, setSavingConfig] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (personaId === '') { setBatches([]); return }
    try {
      setBatches(await api.listViralBatches(personaId, filter === '' ? undefined : filter))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, personaId, filter])

  useEffect(() => { void refresh() }, [refresh])

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

  const initialBatchSet = useRef(false)
  useEffect(() => {
    if (!initialBatchSet.current && batches.length > 0) {
      initialBatchSet.current = true
      setExpandedBatchId(batches[0].id)
    }
  }, [batches])

  useEffect(() => {
    api.getApifyConfig()
      .then(config => {
        setApifyConfigured(config.actorId !== '' && config.apiToken !== '')
        setActorId(config.actorId)
        setApiToken(config.apiToken)
        setMaxItems(String(config.maxItems ?? 10))
      })
      .catch(() => {})
  }, [api])

  const collect = async (): Promise<void> => {
    if (accountId === '') { setError('请先在左侧选择账号'); return }
    setCollecting(true)
    try {
      await api.collectViral(accountId)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCollecting(false)
    }
  }

  const review = async (itemId: string, status: 'accepted' | 'ignored'): Promise<void> => {
    setReviewingId(itemId)
    try {
      await api.reviewViralItem(personaId, itemId, status)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReviewingId('')
    }
  }

  const deleteBatch = async (batchId: string): Promise<void> => {
    if (!window.confirm('确定删除这个采集批次？该批次的全部爆款（含已采纳）将被移除，不影响其他批次。')) return
    try {
      await api.deleteViralBatch(personaId, batchId)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 调整爆款人工权重（0-5），以 personaId 为主参数。 */
  const setWeight = async (itemId: string, weight: NoteWeight): Promise<void> => {
    try {
      await api.setViralWeight(personaId, itemId, weight)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const addManual = async (): Promise<void> => {
    if (manualTitle.trim() === '' || manualBody.trim() === '') { setError('标题与正文必填'); return }
    const payload: { title: string; body: string; sourceUrl?: string; publishedAt?: string } = {
      title: manualTitle.trim(),
      body: manualBody.trim(),
    }
    if (manualSourceUrl.trim() !== '') payload.sourceUrl = manualSourceUrl.trim()
    if (manualPublishedAt !== '') payload.publishedAt = manualPublishedAt
    setBusy(true)
    try {
      await api.addManualViral(personaId, payload)
      setManualOpen(false)
      setManualTitle('')
      setManualBody('')
      setManualSourceUrl('')
      setManualPublishedAt('')
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const transfer = async (): Promise<void> => {
    if (transferItem === null) return
    if (transferTarget === '' || transferTarget === personaId) return
    setBusy(true)
    try {
      await api.transferVirals(personaId, transferTarget, [transferItem.id])
      setTransferItem(null)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const assign = async (pendingId: string): Promise<void> => {
    if (assignTarget === '') return
    try {
      await api.assignPending(pendingId, assignTarget)
      setPending(prev => prev.filter(entry => entry.id !== pendingId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const openConfig = (): void => {
    void api.getApifyConfig().then(config => {
      setActorId(config.actorId)
      setApiToken(config.apiToken)
      setMaxItems(String(config.maxItems ?? 10))
      setConfigOpen(true)
    }).catch(() => setConfigOpen(true))
  }

  const saveConfig = async (): Promise<void> => {
    if (actorId.trim() === '' || apiToken.trim() === '') { setError('Actor ID 与 API Token 必填'); return }
    if (!actorId.includes('/')) { setError('Actor ID 格式应为「用户名/Actor名」'); return }
    setSavingConfig(true)
    try {
      await api.updateApifyConfig({ actorId: actorId.trim(), apiToken: apiToken.trim(), maxItems: Number(maxItems) > 0 ? Number(maxItems) : 10 })
      setApifyConfigured(true)
      setConfigOpen(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingConfig(false)
    }
  }

  const persona = allPersonas.find(p => p.id === personaId)
  const personaName = persona?.name ?? (personaId === '' ? '未分配' : personaId)

  const allItems = useMemo(() => batches.flatMap(batch => batch.items), [batches])
  const acceptedCount = allItems.filter(item => item.status === 'accepted').length
  const pendingCount = allItems.filter(item => item.status === 'pending').length
  const avgWeight = allItems.length === 0 ? '0' : (allItems.reduce((sum, item) => sum + item.weight, 0) / allItems.length).toFixed(1)
  const expandedBatch = batches.find(batch => batch.id === expandedBatchId) ?? null

  const filterSource = (item: ViralItem): boolean => {
    if (sourceFilter === '') return true
    const kind = item.source === 'apify' ? 'auto' : 'manual'
    return kind === sourceFilter
  }

  const visibleItems = (batch: ViralBatch & { items: ViralItem[] }) => batch.items.filter(item => {
    if (!filterSource(item)) return false
    if (filter !== '' && item.status !== filter) return false
    return true
  })

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}

      <PersonaScopeSelector api={api} value={personaId} onChange={onPersonaChange} />
      {personaId === '' && <div className={css.empty}>该账号未绑定人设，请在右上角切换到某个人设，或先到「人设配置」为账号绑定人设。</div>}

      {personaId !== '' && (
        <>
          <div className={css.scopeBand}>
            <div>
              <h2>{personaName} · 共享爆款池</h2>
              <p>由 {sharedAccounts} 个账号共同使用；切换账号不会搬移或复制内容。</p>
            </div>
            <div className={css.scopeStats}>
              <div><b>{acceptedCount}</b><span>已采纳</span></div>
              <div><b>{pendingCount}</b><span>待审核</span></div>
              <div><b>{avgWeight}</b><span>平均权重</span></div>
            </div>
          </div>

          <div className={css.toolbar}>
            <select className={css.input} value={filter} onChange={e => setFilter(e.target.value as '' | ViralStatus)} aria-label="状态">
              <option value="">全部状态</option>
              <option value="accepted">已采纳</option>
              <option value="pending">待审核</option>
              <option value="ignored">已忽略</option>
            </select>
            <select className={css.input} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="来源">
              <option value="">全部来源</option>
              <option value="auto">自动采集</option>
              <option value="manual">手动新增</option>
            </select>
            <span className={css.spacer} />
            {pending.length > 0 && <button className={css.button} onClick={() => { setPendingOpen(true); setAssignTarget('') }}>待归属 {pending.length}</button>}
            <button className={css.ghostBtn} onClick={openConfig}>配置 Apify</button>
            <button className={css.primary} onClick={() => void collect()} disabled={collecting}>{collecting ? '采集中…' : '采集爆款'}</button>
            <button className={css.primary} onClick={() => setManualOpen(true)}>＋ 手动新增</button>
          </div>

          {batches.length === 0 && (
            <div className={css.muted}>
              爆款池为空。点击「采集爆款」从外部数据源拉取内容并按当前人设与知识库排序；
              {!apifyConfigured && ' 先点击「配置 Apify」填写 Actor ID 与 API Token。'}
            </div>
          )}

          {batches.length > 0 && (
            <div className={css.split}>
              <aside className={css.batchList}>
                <div className={css.panelHead}><h3>采集批次</h3><span className={css.muted}>{batches.length} 批</span></div>
                {batches.map(batch => (
                  <button
                    key={batch.id}
                    className={expandedBatchId === batch.id ? css.batch + ' ' + css.active : css.batch}
                    onClick={() => setExpandedBatchId(batch.id)}
                  >
                    <span className={css.batchCount}>{batch.items.length}</span>
                    <strong>{batch.query !== undefined && batch.query !== '' ? batch.query : batch.id}</strong>
                    <small>自动采集 · {batch.collectedAt.slice(0, 16).replace('T', ' ')}</small>
                  </button>
                ))}
              </aside>

              <section className={css.panel}>
                {expandedBatch === null ? (
                  <div className={css.muted} style={{ padding: 16 }}>选择一个批次查看条目。</div>
                ) : (
                  <>
                    <div className={css.panelHead}>
                      <h3>{expandedBatch.query !== undefined && expandedBatch.query !== '' ? expandedBatch.query : expandedBatch.id}</h3>
                      <div>
                        <span className={css.chipAmber}>{visibleItems(expandedBatch).filter(item => item.status === 'pending').length} 待审核</span>{' '}
                        <span className={css.chipGreen}>{visibleItems(expandedBatch).filter(item => item.status === 'accepted').length} 已采纳</span>
                      </div>
                    </div>
                    <button className={css.dangerBtn} style={{ border: 0, borderBottom: '1px solid var(--xhs-border)', borderRadius: 0, width: '100%' }} onClick={() => void deleteBatch(expandedBatch.id)}>删除该批次</button>
                    {visibleItems(expandedBatch).length === 0 && <div className={css.muted} style={{ padding: 16 }}>该批次在当前筛选下没有条目。</div>}
                    {visibleItems(expandedBatch).map(item => {
                      const hits = forbiddenHit(item.title + item.body, persona?.forbiddenWords ?? [])
                      const preview = item.body.length > BODY_PREVIEW_LENGTH ? item.body.slice(0, BODY_PREVIEW_LENGTH) + '…' : item.body
                      return (
                        <div key={item.id} className={css.item}>
                          <div className={css.itemTop}>
                            <div>
                              <h4>{item.title}</h4>
                              <div className={css.meta}>
                                <span className={item.source === 'manual' ? css.chipRed : css.chip}>{SOURCE_LABEL[item.source] ?? item.source}</span>
                                {item.sourceAccountName !== undefined && <span>来源：{item.sourceAccountName}</span>}
                                <span>机器评分 {item.score}</span>
                              </div>
                            </div>
                            {item.status === 'accepted' && <span className={css.chipGreen}>已采纳</span>}
                            {item.status === 'pending' && <span className={css.chipAmber}>待审核</span>}
                            {item.status === 'ignored' && <span className={css.chip}>已忽略</span>}
                          </div>
                          <p className={css.excerpt}>{preview === '' ? <span className={css.muted}>（无正文摘要）</span> : preview}</p>
                          {item.sourceUrl !== undefined && (
                            <div className={css.excerpt} style={{ marginTop: 0 }}>
                              <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>来源链接 ↗</a>
                            </div>
                          )}
                          {hits.length > 0 && (
                            <div className={css.warning}>参考素材命中人设违禁词「{hits[0]}」：只警告，不阻止收录；生成内容会强制拦截。</div>
                          )}
                          <div className={css.itemActions}>
                            <span className={css.muted}>人工权重</span>
                            <div className={css.weight}>
                              {WEIGHTS.map(weight => (
                                <button key={weight} className={item.weight === weight ? css.on : undefined} title={'权重 ' + weight} disabled={reviewingId === item.id} onClick={() => void setWeight(item.id, weight)}>{weight}</button>
                              ))}
                            </div>
                            <span className={css.muted}>权重 {item.weight} / 5</span>
                            <button className={css.textAction} onClick={() => { setTransferItem(item); setTransferTarget('') }}>转移人设</button>
                            {item.status === 'pending' && (
                              <>
                                <button className={css.primary} disabled={reviewingId === item.id} onClick={() => void review(item.id, 'accepted')}>采纳</button>
                                <button className={css.ghostBtn} disabled={reviewingId === item.id} onClick={() => void review(item.id, 'ignored')}>忽略</button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {manualOpen && (
        <div className={css.overlay} onClick={() => setManualOpen(false)}>
          <div className={css.dialog} onClick={e => e.stopPropagation()}>
            <button className={css.dialogClose} onClick={() => setManualOpen(false)} aria-label="关闭">×</button>
            <h3>手动新增爆款笔记</h3>
            <div className={css.field}><label>归属人设</label><input className={css.input} value={personaName} readOnly /></div>
            <div className={css.field}><label>标题</label><input className={css.input} value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="爆款标题" /></div>
            <div className={css.field}><label>正文</label><textarea className={css.textarea} rows={4} value={manualBody} onChange={e => setManualBody(e.target.value)} placeholder="粘贴或输入爆款笔记正文。" /></div>
            <div className={css.field}><label>来源链接 · 可选</label><input className={css.input} value={manualSourceUrl} onChange={e => setManualSourceUrl(e.target.value)} placeholder="https://" /></div>
            <div className={css.field}><label>发布时间 · 可选</label><input className={css.input} type="date" value={manualPublishedAt} onChange={e => setManualPublishedAt(e.target.value)} /></div>
            <p className={css.helper}>默认已采纳 · 权重 5</p>
            <div className={css.rowActions}>
              <button className={css.ghostBtn} onClick={() => setManualOpen(false)}>取消</button>
              <button className={css.primary} disabled={busy} onClick={() => void addManual()}>保存到该人设</button>
            </div>
          </div>
        </div>
      )}

      {transferItem !== null && (
        <div className={css.overlay} onClick={() => setTransferItem(null)}>
          <div className={css.dialog} onClick={e => e.stopPropagation()}>
            <button className={css.dialogClose} onClick={() => setTransferItem(null)} aria-label="关闭">×</button>
            <h3>转移到其他人设</h3>
            <div className={css.field}><label>目标人设</label>
              <select className={css.input} aria-label="转移目标人设" value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                <option value="">选择目标人设</option>
                {allPersonas.filter(p => p.id !== personaId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className={css.rowActions}>
              <button className={css.primary} disabled={busy || transferTarget === '' || transferTarget === personaId} onClick={() => void transfer()}>确认转移</button>
              <button className={css.ghostBtn} onClick={() => setTransferItem(null)}>取消</button>
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
                <button className={css.primary} style={{ marginTop: 8 }} onClick={() => void assign(entry.id)}>归属到该人设</button>
              </div>
            ))}
            <div className={css.rowActions}><button className={css.ghostBtn} onClick={() => setPendingOpen(false)}>关闭</button></div>
          </div>
        </div>
      )}

      {configOpen && (
        <div className={css.overlay} onClick={() => setConfigOpen(false)}>
          <div className={css.dialog} onClick={e => e.stopPropagation()}>
            <button className={css.dialogClose} onClick={() => setConfigOpen(false)} aria-label="关闭">×</button>
            <h3>配置 Apify 爆款数据源</h3>
            <div className={css.muted} style={{ marginBottom: 12, lineHeight: 1.7 }}>
              <b>如何获取：</b>
              <br />1. 打开 <a href="https://apify.com" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>apify.com</a> 注册账号。
              <br />2. <b>API Token</b>：Settings → Integrations 复制（形如 <code>apify_api_xxx</code>）。
              <br />3. <b>Actor ID</b>：Apify Store 搜索小红书 Actor（如 <code>kuaima/xiaohongshu-search</code>）。
              <br />4. 保存配置后点「采集爆款」。采集消耗 Apify 平台额度，请按需使用。
            </div>
            <div className={css.field}><label>Actor ID</label><input className={css.input} value={actorId} onChange={e => setActorId(e.target.value)} placeholder="如 kuaima/xiaohongshu-search" /></div>
            <div className={css.field}><label>API Token</label><input className={css.input} type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="apify_api_..." /></div>
            <div className={css.field}><label>单次最大候选数</label><input className={css.input} type="number" min={1} value={maxItems} onChange={e => setMaxItems(e.target.value)} /></div>
            <div className={css.rowActions}>
              <button className={css.primary} onClick={() => void saveConfig()} disabled={savingConfig}>{savingConfig ? '保存中…' : '保存配置'}</button>
              <button className={css.ghostBtn} onClick={() => setConfigOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}