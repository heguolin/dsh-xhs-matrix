import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PageId } from './XhsPanel.tsx'
import css from './panel.module.css'
import { StatusBadge } from './StatusBadge.tsx'
import { accountDot } from './XhsPanel.tsx'

interface AccountRow {
  id: string; name: string; personaId: string; enabled: boolean
  connection?: { profileUrl?: string; externalId?: string; status: string; source?: string; lastError?: string; lastSuccessAt?: string }
  collectionStatus?: { running: boolean; lastStatus: string; lastSuccessAt?: string; lastError?: string }
}

/** 单账号在矩阵总览中的聚合摘要。 */
interface AccountSummary {
  account: AccountRow
  personaName: string
  noteCount: number
  highWeightCount: number
  reads: number
  draftCount: number
  viralCount: number
}

/**
 * 运营总览（设计稿 content/hybrid-layout.html + 设计文档 §8.2）：
 * 矩阵级多账号总览 —— 显示所有账号的状态、指标、知识库表现与草稿摘要；
 * 爆款池按账号隔离，每个账号卡片显示自己的爆款条数，
 * 具体条目进入该账号的「爆款池」工作区查看。
 */
export function OverviewTab({ api, accounts, onOpenAccount, onOpenStudio, onAccountUpdated }: {
  api: XhsApi
  accounts: AccountRow[]
  onOpenAccount: (accountId: string, page: PageId) => void
  onOpenStudio: (accountId: string) => void
  onAccountUpdated: () => void
}) {
  const [summaries, setSummaries] = useState<AccountSummary[]>([])
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState('')
  // 人设快捷绑定：bindingFor 为正在绑定的账号 id，bindPick 为下拉选择值。
  const [bindingFor, setBindingFor] = useState<string | null>(null)
  const [bindPick, setBindPick] = useState('')

  const refresh = useCallback(async () => {
    if (accounts.length === 0) { setSummaries([]); return }
    try {
      const [personaList, draftList] = await Promise.all([api.listPersonas(), api.listDrafts()])
      setPersonas(personaList)
      const rows = await Promise.all(accounts.map(async account => {
        const [noteList, metricList, viralList] = await Promise.all([
          api.listNotes(account.id),
          api.listMetrics(account.id),
          api.listViralItems(account.id),
        ])
        // 每篇笔记最新指标快照（按 collectedAt 取最近一次）
        const latestByNote = new Map<string, { reads: number; collectedAt: string }>()
        for (const m of metricList) {
          const prev = latestByNote.get(m.noteId)
          if (prev === undefined || m.collectedAt > prev.collectedAt) latestByNote.set(m.noteId, m)
        }
        const reads = [...latestByNote.values()].reduce((sum, m) => sum + m.reads, 0)
        return {
          account,
          personaName: personaList.find(p => p.id === account.personaId)?.name ?? '未分配',
          noteCount: noteList.length,
          highWeightCount: noteList.filter(n => n.weight >= 3).length,
          reads,
          draftCount: draftList.filter(d => d.accountId === account.id && d.status === 'generated').length,
          viralCount: viralList.length,
        }
      }))
      setSummaries(rows)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accounts])

  useEffect(() => { void refresh() }, [refresh])

  /** 在总览卡片上直接绑定/更换账号人设。 */
  const bindPersona = async (account: AccountRow): Promise<void> => {
    if (bindPick === '') { setError('请选择一个人设'); return }
    try {
      await api.updateAccount(account.id, { name: account.name, personaId: bindPick, enabled: account.enabled })
      setBindingFor(null)
      setBindPick('')
      setError('')
      await refresh()
      onAccountUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const totalNotes = summaries.reduce((sum, row) => sum + row.noteCount, 0)
  const totalDrafts = summaries.reduce((sum, row) => sum + row.draftCount, 0)
  const totalReads = summaries.reduce((sum, row) => sum + row.reads, 0)

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {accounts.length === 0 && (
        <div className={css.empty}>还没有账号。点击右上角「＋ 添加账号」创建第一个矩阵账号，开始建立独立工作区。</div>
      )}

      {accounts.length > 0 && (
        <>
          {/* 矩阵汇总指标 */}
          <div className={css.metrics} style={{ marginBottom: 14 }}>
            <div className={css.metric}>矩阵账号<b>{accounts.length}</b></div>
            <div className={css.metric}>累计已发布<b>{totalNotes}</b></div>
            <div className={css.metric}>累计浏览<b>{totalReads.toLocaleString()}</b></div>
          </div>

          {/* 账号卡片：每个账号一个独立工作区入口 */}
          {summaries.map(row => (
            <div key={row.account.id} className={css.libRow} style={{ flexDirection: 'column' }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={css.face} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{row.account.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span className={css.muted} style={{ fontSize: 11 }}>人设：{row.personaName}</span>
                    {bindingFor === row.account.id ? (
                      <>
                        <select
                          className={css.input}
                          style={{ width: 150, padding: '3px 8px', fontSize: 11 }}
                          value={bindPick}
                          onChange={e => setBindPick(e.target.value)}
                        >
                          <option value="">（选择人设）</option>
                          {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className={css.ghostBtn} style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => void bindPersona(row.account)}>确认</button>
                        <button className={css.ghostBtn} style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => { setBindingFor(null); setBindPick('') }}>取消</button>
                      </>
                    ) : (
                      <button
                        className={css.ghostBtn}
                        style={{ padding: '3px 10px', fontSize: 11 }}
                        onClick={() => { setBindingFor(row.account.id); setBindPick(row.account.personaId) }}
                      >
                        {row.personaName === '未分配' ? '绑定人设' : '更换人设'}
                      </button>
                    )}
                  </div>
                </div>
                <span className={`${css.statusDot} ${css[accountDot(row.account)]}`} />
                {row.account.connection !== undefined && <StatusBadge status={row.account.connection.status} />}
                {row.account.enabled ? <span className={css.badgeGreen}>启用</span> : <span className={css.badgeGray}>停用</span>}
                <span style={{ flex: 1 }} />
                <div className={css.rowActions}>
                  <button className={css.ghostBtn} onClick={() => onOpenAccount(row.account.id, 'knowledge')}>知识库</button>
                  <button className={css.ghostBtn} onClick={() => onOpenAccount(row.account.id, 'viral')}>爆款池</button>
                  <button className={css.ghostBtn} onClick={() => onOpenAccount(row.account.id, 'drafts')}>草稿</button>
                  <button className={css.primary} onClick={() => onOpenStudio(row.account.id)}>进入创作台</button>
                </div>
              </div>
              {/* 账号指标摘要（爆款条数按账号隔离显示） */}
              <div className={css.metrics} style={{ marginTop: 10 }}>
                <div className={css.metric}>已发布<b>{row.noteCount}</b></div>
                <div className={css.metric}>最近浏览<b>{row.reads.toLocaleString()}</b></div>
                <div className={css.metric}>高权重样本<b>{row.highWeightCount}</b></div>
              </div>
              <div className={css.muted} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>爆款池：{row.viralCount} 条</span>
                <button className={css.ghostBtn} style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onOpenAccount(row.account.id, 'viral')}>
                  {row.viralCount > 0 ? '查看该账号爆款池' : '去采集爆款'}
                </button>
              </div>
              {row.account.connection?.lastError !== undefined && <div className={css.muted} style={{ marginTop: 4 }}>连接：{row.account.connection.lastError}</div>}
              {row.account.collectionStatus?.lastError !== undefined && <div className={css.muted} style={{ marginTop: 4 }}>采集：{row.account.collectionStatus.lastError}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
