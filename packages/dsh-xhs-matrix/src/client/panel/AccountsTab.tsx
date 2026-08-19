import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface AccountRow { id: string; name: string; personaId: string; enabled: boolean }

/** 账号 Tab：增删改 + 分配人设 + 启用/停用。 */
export function AccountsTab({ api }: { api: XhsApi }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [name, setName] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [accs, pers] = await Promise.all([api.listAccounts(), api.listPersonas()])
      setAccounts(accs)
      setPersonas(pers)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const create = async (): Promise<void> => {
    try {
      await api.createAccount({ name, personaId, enabled: true })
      setName('')
      setPersonaId('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggle = async (account: AccountRow): Promise<void> => {
    await api.updateAccount(account.id, { name: account.name, personaId: account.personaId, enabled: !account.enabled })
    await refresh()
  }

  const remove = async (id: string): Promise<void> => {
    await api.deleteAccount(id)
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}>
        <label>账号名</label>
        <input className={css.input} value={name} onChange={e => setName(e.target.value)} placeholder="账号A" />
      </div>
      <div className={css.field}>
        <label>人设</label>
        <select className={css.input} value={personaId} onChange={e => setPersonaId(e.target.value)}>
          <option value="">（未分配）</option>
          {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button className={css.button} onClick={() => void create()}>添加账号</button>
      {accounts.map(account => (
        <div key={account.id} className={css.row}>
          <span>{account.name}</span>
          <span className={css.muted}>{personas.find(p => p.id === account.personaId)?.name ?? '未分配'}</span>
          <span className={css.muted}>{account.enabled ? '启用' : '停用'}</span>
          <button className={css.button} onClick={() => void toggle(account)}>{account.enabled ? '停用' : '启用'}</button>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(account.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
