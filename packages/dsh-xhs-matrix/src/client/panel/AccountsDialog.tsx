import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { ImportDialog } from './ImportDialog.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { accountDot, type AccountRow } from './XhsPanel.tsx'

/**
 * 账号管理弹窗：列表 + 创建/编辑表单 + 绑定主页 + 笔记导入入口。
 *
 * v4：账号列表单一来源为父级 XhsPanel，本弹窗只接收 accounts 快照；创建成功后
 * 通过 onSaved(createdId) 通知父级「刷新→选中→关闭」，不再维护无法通知侧栏的账号副本。
 */
export function AccountsDialog({ api, accounts, onClose, onSaved, onChanged }: {
  api: XhsApi
  accounts: AccountRow[]
  onClose: () => void
  onSaved: (createdId: string) => Promise<void> | void
  onChanged: () => void | Promise<void>
}) {
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [name, setName] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // 行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPersonaId, setEditPersonaId] = useState('')
  const [editProfileUrl, setEditProfileUrl] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)

  const refreshPersonas = useCallback(async () => {
    try {
      setPersonas(await api.listPersonas())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refreshPersonas() }, [refreshPersonas])

  const create = async (): Promise<void> => {
    if (name.trim() === '') { setError('请输入账号名'); return }
    setError('')
    try {
      const { id } = await api.createAccount({ name: name.trim(), personaId, enabled: true })
      if (profileUrl.trim() !== '') {
        await api.updateAccount(id, { name: name.trim(), personaId, enabled: true, connection: { profileUrl: profileUrl.trim(), status: 'awaiting-import', source: 'manual' } })
      }
      // 成功顺序由父级固定：已创建 → await refreshAccounts() → setAccountId(createdId) → 关闭弹窗。
      await onSaved(id)
    } catch (e) {
      // 失败：保留表单并显示错误，不关弹窗。
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggle = async (account: AccountRow): Promise<void> => {
    try {
      await api.updateAccount(account.id, { name: account.name, personaId: account.personaId, enabled: !account.enabled })
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm('确定删除该账号？其笔记、指标、草稿与创作记录会一并删除。')) return
    try {
      await api.deleteAccount(id)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const startEdit = (account: AccountRow): void => {
    setEditingId(account.id)
    setEditName(account.name)
    setEditPersonaId(account.personaId)
    setEditProfileUrl(account.connection?.profileUrl ?? '')
  }

  const saveEdit = async (account: AccountRow): Promise<void> => {
    try {
      await api.updateAccount(account.id, {
        name: editName, personaId: editPersonaId, enabled: account.enabled,
        connection: editProfileUrl.trim() === '' ? undefined : { profileUrl: editProfileUrl.trim(), status: account.connection?.status === 'bound' || account.connection?.status === 'authorized' ? account.connection.status : 'awaiting-import', source: account.connection?.source ?? 'manual' },
      })
      setEditingId(null)
      setNotice('账号信息已保存。')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const cancelEdit = (): void => setEditingId(null)

  return (
    <div className={css.overlay} onClick={onClose}>
      <div className={css.dialog} onClick={e => e.stopPropagation()}>
        <button className={css.dialogClose} onClick={onClose} aria-label="关闭">×</button>
        <h3>账号管理</h3>
        {error !== '' && <div className={css.danger}>{error}</div>}
        {notice !== '' && <div className={css.success}>{notice}</div>}

        <div className={css.field}>
          <label>新账号名</label>
          <input className={css.input} value={name} onChange={e => setName(e.target.value)} placeholder="效率研究所" />
        </div>
        <div className={css.field}>
          <label>人设</label>
          <select className={css.input} value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">（未分配）</option>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {personas.length === 0 && <span className={css.muted}>还没有人设，请先到「人设配置」创建。</span>}
        </div>
        <div className={css.field}>
          <label>小红书主页 URL（可选，绑定后标记「待导入」）</label>
          <input className={css.input} value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder="https://www.xiaohongshu.com/user/profile/..." />
        </div>
        <button className={css.primary} onClick={() => void create()}>添加账号</button>

        <div style={{ marginTop: 16 }} />
        {accounts.map(account => (
          <div key={account.id} className={css.dialogRow}>
            <span className={css.face} />
            {editingId === account.id ? (
              <>
                <input className={css.input} style={{ width: 120 }} value={editName} onChange={e => setEditName(e.target.value)} />
                <select className={css.input} style={{ width: 110 }} value={editPersonaId} onChange={e => setEditPersonaId(e.target.value)}>
                  <option value="">（未分配）</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input className={css.input} style={{ width: 170 }} value={editProfileUrl} onChange={e => setEditProfileUrl(e.target.value)} placeholder="主页 URL" />
                <div className={css.dialogRowActions}>
                  <button className={css.button} onClick={() => void saveEdit(account)}>保存</button>
                  <button className={css.button} onClick={cancelEdit}>取消</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{account.name}</div>
                  <div className={css.muted} style={{ fontSize: 11 }}>
                    {account.personaId === '' ? '未分配人设' : personas.find(p => p.id === account.personaId)?.name ?? '未知人设'}
                    {' · '}{account.enabled ? '启用' : '停用'}
                  </div>
                </div>
                <span className={`${css.statusDot} ${css[accountDot(account)]}`} />
                {account.connection !== undefined && <StatusBadge status={account.connection.status} />}
                <div className={css.dialogRowActions}>
                  {account.connection?.profileUrl !== undefined && account.connection.profileUrl !== ''
                    && <button className={css.ghostBtn} title={account.connection.profileUrl} onClick={() => { const url = account.connection?.profileUrl; if (url !== undefined) void navigator.clipboard.writeText(url).catch(() => undefined) }}>主页</button>}
                  <button className={css.ghostBtn} onClick={() => setImportingId(importingId === account.id ? null : account.id)}>导入笔记</button>
                  <button className={css.ghostBtn} onClick={() => startEdit(account)}>编辑</button>
                  <button className={css.ghostBtn} onClick={() => void toggle(account)}>{account.enabled ? '停用' : '启用'}</button>
                  <button className={css.dangerBtn} onClick={() => void remove(account.id)}>删除</button>
                </div>
              </>
            )}
          </div>
        ))}
        {accounts.length === 0 && <div className={css.empty}>暂无账号。</div>}

        {importingId !== null && (
          <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--xhs-border)', borderRadius: 12, background: 'var(--xhs-card)' }}>
            <ImportDialog
              api={api}
              accountId={importingId}
              personaId={accounts.find(account => account.id === importingId)?.personaId ?? ''}
              onDone={() => { void onChanged(); setImportingId(null) }}
            />
          </div>
        )}
      </div>
    </div>
  )
}