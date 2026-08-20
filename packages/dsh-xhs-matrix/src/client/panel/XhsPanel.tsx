import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PanelController } from '../controller.ts'
import { AccountsDialog } from './AccountsDialog.tsx'
import { DraftsTab } from './DraftsTab.tsx'
import { KnowledgeTab } from './KnowledgeTab.tsx'
import { OverviewTab } from './OverviewTab.tsx'
import { PersonasTab } from './PersonasTab.tsx'
import { StudioTab } from './StudioTab.tsx'
import { TopicsTab } from './TopicsTab.tsx'
import css from './panel.module.css'

export type PageId = 'overview' | 'knowledge' | 'topics' | 'studio' | 'drafts' | 'personas'

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: PageId; icon: string; label: string }> }> = [
  {
    group: '运营',
    items: [
      { id: 'overview', icon: '◈', label: '总览' },
      { id: 'knowledge', icon: '▤', label: '已发布知识库' },
      { id: 'topics', icon: '✦', label: '趋势选题' },
    ],
  },
  {
    group: '创作',
    items: [
      { id: 'studio', icon: '✎', label: '创作台' },
      { id: 'drafts', icon: '▣', label: '草稿箱' },
    ],
  },
  {
    group: '设置',
    items: [{ id: 'personas', icon: '◉', label: '人设配置' }],
  },
]

interface AccountRow {
  id: string; name: string; personaId: string; enabled: boolean
  connection?: { status: string }
  collectionStatus?: { running: boolean; lastStatus: string }
}

/** 根据连接与采集状态计算左侧状态点（绿/橙/红/灰）。 */
export function accountDot(account: AccountRow): 'ok' | 'warn' | 'error' | 'idle' {
  const status = account.connection?.status ?? ''
  if (status === 'failed' || account.collectionStatus?.lastStatus === 'failed') return 'error'
  if (status === 'awaiting-import' || status === 'unbound' || account.collectionStatus?.running) return 'warn'
  if (status === 'bound' || status === 'authorized') return 'ok'
  return 'idle'
}

const PAGE_TITLES: Record<PageId, string> = {
  overview: '账号运营总览',
  knowledge: '已发布知识库',
  topics: '趋势选题',
  studio: '专属创作台',
  drafts: '草稿箱',
  personas: '人设配置',
}

export interface XhsPanelProps {
  controller: PanelController
  api: XhsApi
}

/**
 * 矩阵工作台（依据设计稿 content/hybrid-layout.html 的混合布局）：
 * 左侧导航承载账号切换与运营/创作/设置模块，右侧为当前页面工作区。
 */
export function XhsPanel(props: XhsPanelProps) {
  const { api } = props
  const [page, setPage] = useState<PageId>('overview')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await api.listAccounts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refreshAccounts() }, [refreshAccounts])

  const current = accounts.find(item => item.id === accountId)

  const openStudio = (id: string): void => {
    setAccountId(id)
    setPage('studio')
  }

  const openDrafts = (): void => setPage('drafts')

  return (
    <div className={css.view}>
      {/* ---- 左侧导航 ---- */}
      <aside className={css.sidebar}>
        <div className={css.brand}><span className={css.brandLogo}>薯</span>矩阵工作台</div>

        <div className={css.group}>我的账号</div>
        {accounts.map(account => (
          <button
            key={account.id}
            className={accountId === account.id ? `${css.accountItem} ${css.active}` : css.accountItem}
            onClick={() => setAccountId(account.id)}
            title={account.name}
          >
            <span className={css.face} />
            <span className={css.accountName}>{account.name}</span>
            <span className={`${css.statusDot} ${css[accountDot(account)]}`} />
          </button>
        ))}
        {accounts.length === 0 && <div className={css.empty}>还没有账号，点击下方添加。</div>}
        <button className={css.accountAdd} onClick={() => setDialogOpen(true)}>＋ 添加账号</button>

        {NAV_GROUPS.map(group => (
          <div key={group.group}>
            <div className={css.group}>{group.group}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                className={page === item.id ? `${css.navItem} ${css.active}` : css.navItem}
                onClick={() => setPage(item.id)}
              >
                <span className={css.navIcon}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ---- 主工作区 ---- */}
      <main className={css.workspace}>
        <div className={css.topbar}>
          <div>
            <h3>{page === 'overview' && current !== undefined ? `${current.name} · ${PAGE_TITLES.overview}` : PAGE_TITLES[page]}</h3>
            <div className={css.topbarSub}>
              {page === 'studio' && current !== undefined ? '人设、知识库、Apify 趋势已隔离加载 · 仅矩阵内容' : '小红书矩阵内容管理'}
            </div>
          </div>
          <div className={css.topbarRight}>
            {page === 'overview' && (
              <div className={css.modeSwitch}>
                <button className={css.on} onClick={() => setPage('overview')}>运营总览</button>
                <button onClick={() => { if (accountId !== '') openStudio(accountId) }}>专属创作台</button>
              </div>
            )}
            <button className={css.primary} onClick={() => setDialogOpen(true)}>＋ 添加账号</button>
          </div>
        </div>

        <div className={css.content}>
          {error !== '' && <div className={css.danger}>{error}</div>}
          {page === 'overview' && (
            <OverviewTab api={api} accountId={accountId} accounts={accounts} onOpenStudio={openStudio} />
          )}
          {page === 'knowledge' && <KnowledgeTab api={api} accountId={accountId} />}
          {page === 'topics' && <TopicsTab api={api} accountId={accountId} />}
          {page === 'studio' && (
            <StudioTab api={api} accountId={accountId} onOpenDraft={openDrafts} />
          )}
          {page === 'drafts' && <DraftsTab api={api} onOpenStudio={openStudio} />}
          {page === 'personas' && <PersonasTab api={api} />}
        </div>
      </main>

      {dialogOpen && (
        <AccountsDialog
          api={api}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { void refreshAccounts() }}
        />
      )}
    </div>
  )
}
