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
  // 行内编辑状态：editingId 为正在编辑的账号 id。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPersonaId, setEditPersonaId] = useState('')

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
    try {
      await api.updateAccount(account.id, { name: account.name, personaId: account.personaId, enabled: !account.enabled })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await api.deleteAccount(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const startEdit = (account: AccountRow): void => {
    setEditingId(account.id)
    setEditName(account.name)
    setEditPersonaId(account.personaId)
  }

  const saveEdit = async (account: AccountRow): Promise<void> => {
    try {
      await api.updateAccount(account.id, { name: editName, personaId: editPersonaId, enabled: account.enabled })
      setEditingId(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const cancelEdit = (): void => setEditingId(null)

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
        {personas.length === 0 && <span className={css.empty}>还没有人设，请先到「人设」Tab 创建（人设名 + 提示词）。</span>}
      </div>
      <button className={css.primary} onClick={() => void create()}>添加账号</button>
      {accounts.map(account => (
        <div key={account.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          {editingId === account.id ? (
            <>
              <div className={css.field}>
                <label>账号名</label>
                <input className={css.input} value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className={css.field}>
                <label>人设</label>
                <select className={css.input} value={editPersonaId} onChange={e => setEditPersonaId(e.target.value)}>
                  <option value="">（未分配）</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <button className={css.primary} onClick={() => void saveEdit(account)}>保存</button>
                <button className={css.button} onClick={cancelEdit}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <span style={{ fontWeight: 600 }}>{account.name}</span>
                <span className={css.muted} style={{ marginLeft: 10 }}>
                  {account.personaId === ''
                    ? <span className={css.badgeGray}>未分配</span>
                    : <span className={css.badge}>{personas.find(p => p.id === account.personaId)?.name ?? '未知人设'}</span>}
                </span>
                <span className={css.muted} style={{ marginLeft: 10 }}>
                  {account.enabled ? <span className={css.badgeGreen}>启用</span> : <span className={css.badgeGray}>停用</span>}
                </span>
              </div>
              <div>
                <button className={css.button} onClick={() => startEdit(account)}>编辑</button>
                <button className={css.button} onClick={() => void toggle(account)}>{account.enabled ? '停用' : '启用'}</button>
                <button className={`${css.button} ${css.danger}`} onClick={() => void remove(account.id)}>删除</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
