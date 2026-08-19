import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface NegativeRow { id: string; accountId?: string; keyword: string; reason: string }

/** 黑名单 Tab：账号级/全局条目增删。 */
export function NegativesTab({ api }: { api: XhsApi }) {
  const [negatives, setNegatives] = useState<NegativeRow[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [keyword, setKeyword] = useState('')
  const [reason, setReason] = useState('')
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [negs, accs] = await Promise.all([api.listNegatives(), api.listAccounts()])
      setNegatives(negs)
      setAccounts(accs)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const add = async (): Promise<void> => {
    try {
      await api.addNegative({ keyword, reason, accountId: accountId === '' ? undefined : accountId })
      setKeyword('')
      setReason('')
      setAccountId('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await api.deleteNegative(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}><label>关键词</label><input className={css.input} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="美妆技巧" /></div>
      <div className={css.field}><label>原因</label><input className={css.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="上次没流量" /></div>
      <div className={css.field}>
        <label>作用范围</label>
        <select className={css.input} value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">全局</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <button className={css.button} onClick={() => void add()}>添加黑名单</button>
      {negatives.map(negative => (
        <div key={negative.id} className={css.row}>
          <span>{negative.keyword}</span>
          <span className={css.muted}>{negative.accountId === undefined ? '全局' : accounts.find(a => a.id === negative.accountId)?.name ?? negative.accountId}</span>
          <span className={css.muted}>{negative.reason}</span>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(negative.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
