import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { StatusBadge } from './StatusBadge.tsx'

interface AccountRow {
  id: string; name: string; personaId: string; enabled: boolean
  connection?: { status: string; profileUrl?: string; source?: string; lastError?: string }
  collectionStatus?: { running: boolean; lastStatus: string; lastSuccessAt?: string; lastError?: string }
}

/** 运营总览：多账号状态、指标摘要、高权重笔记和草稿数。 */
export function OverviewTab({ api, onOpenStudio }: { api: XhsApi; onOpenStudio: (accountId: string) => void }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setAccounts(await api.listAccounts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {accounts.length === 0 && <div className={css.empty}>还没有账号。先在「账号」Tab 创建并绑定真实小红书账号。</div>}
      {accounts.map(account => (
        <div key={account.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{account.name}</span>
            {account.connection !== undefined && <StatusBadge status={account.connection.status} />}
            {account.collectionStatus !== undefined && account.collectionStatus.lastStatus !== 'idle'
              && <StatusBadge status={account.collectionStatus.lastStatus} />}
            {account.enabled ? <span className={`${css.badge} ${css.badgeGreen}`}>启用</span> : <span className={`${css.badge} ${css.badgeGray}`}>停用</span>}
          </div>
          {account.connection?.profileUrl !== undefined && <div className={css.muted}>{account.connection.profileUrl}</div>}
          {account.collectionStatus?.lastError !== undefined && <div className={css.danger}>{account.collectionStatus.lastError}</div>}
          <button className={css.primary} onClick={() => onOpenStudio(account.id)}>打开创作台</button>
        </div>
      ))}
    </div>
  )
}
