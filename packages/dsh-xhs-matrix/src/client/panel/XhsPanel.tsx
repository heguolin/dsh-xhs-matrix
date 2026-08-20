import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PanelController } from '../controller.ts'
import { AccountsDialog } from './AccountsDialog.tsx'
import { DraftsTab } from './DraftsTab.tsx'
import { KnowledgeTab } from './KnowledgeTab.tsx'
import { OverviewTab } from './OverviewTab.tsx'
import { PersonasTab } from './PersonasTab.tsx'
import { StudioTab } from './StudioTab.tsx'
import { ViralTab } from './ViralTab.tsx'
import css from './panel.module.css'

export type PageId = 'overview' | 'knowledge' | 'viral' | 'studio' | 'drafts' | 'personas'

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: PageId; icon: string; label: string }> }> = [
  {
    group: '运营',
    items: [
      { id: 'overview', icon: '◈', label: '总览' },
      { id: 'knowledge', icon: '▤', label: '已发布知识库' },
      { id: 'viral', icon: '✦', label: '爆款池' },
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
  viral: '爆款池',
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
 * 左侧导航承载账号切换与运营/创作/设置模块，右侧为当前账号的独立工作区。
 *
 * 每个账号拥有独立的工作区：页面位置（pageByAccount）、创作台对话、筛选
 * 与草稿均按账号隔离；切换账号后各自状态保留，切回即恢复。
 */
export function XhsPanel(props: XhsPanelProps) {
  const { api } = props
  const [pageByAccount, setPageByAccount] = useState<Record<string, PageId>>({})
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

  // 自动选中：有账号时始终保证有一个当前账号；删除/失效时回退到第一个。
  useEffect(() => {
    if (accounts.length === 0) { setAccountId(''); return }
    if (!accounts.some(item => item.id === accountId)) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const current = accounts.find(item => item.id === accountId)
  const currentPage = accountId === '' ? 'overview' : (pageByAccount[accountId] ?? 'overview')

  /** 记录当前账号所在的页面位置。 */
  const rememberPage = (next: PageId): void => {
    if (accountId !== '') setPageByAccount(prev => ({ ...prev, [accountId]: next }))
  }

  /** 导航点击：只在当前账号的工作区里切换页面。 */
  const navigate = (page: PageId): void => rememberPage(page)

  /** 切换到指定账号并打开其工作区中的某个页面。 */
  const openAccountPage = (id: string, page: PageId): void => {
    setAccountId(id)
    setPageByAccount(prev => ({ ...prev, [id]: page }))
  }

  /** 进入某账号的创作台（总览/草稿入口）。 */
  const openStudio = (id: string): void => openAccountPage(id, 'studio')

  const openDrafts = (): void => rememberPage('drafts')

  return (
    <div className={css.viewGrid}>
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
                className={currentPage === item.id ? `${css.navItem} ${css.active}` : css.navItem}
                onClick={() => navigate(item.id)}
              >
                <span className={css.navIcon}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ---- 主工作区（当前账号独立工作区） ---- */}
      <main className={css.workspace}>
        <div className={css.topbar}>
          <div>
            <h3>
              {currentPage === 'overview' && current !== undefined
                ? `${current.name} · ${PAGE_TITLES.overview}`
                : currentPage === 'studio' && current !== undefined
                  ? `${PAGE_TITLES.studio} · ${current.name}`
                  : PAGE_TITLES[currentPage]}
            </h3>
            <div className={css.topbarSub}>
              {currentPage === 'studio' && current !== undefined ? '人设、知识库、Apify 趋势已隔离加载 · 仅矩阵内容' : '小红书矩阵内容管理'}
            </div>
          </div>
          <div className={css.topbarRight}>
            {currentPage === 'overview' && (
              <div className={css.modeSwitch}>
                <button className={css.on} onClick={() => rememberPage('overview')}>运营总览</button>
                <button onClick={() => { if (accountId !== '') openStudio(accountId) }}>专属创作台</button>
              </div>
            )}
            <button className={css.primary} onClick={() => setDialogOpen(true)}>＋ 添加账号</button>
          </div>
        </div>

        <div className={css.content}>
          {error !== '' && <div className={css.danger}>{error}</div>}
          {currentPage === 'overview' && (
            <OverviewTab
              api={api}
              accounts={accounts}
              onOpenAccount={openAccountPage}
              onOpenStudio={openStudio}
              onAccountUpdated={() => { void refreshAccounts() }}
            />
          )}
          {currentPage === 'knowledge' && <KnowledgeTab key={`kb-${accountId}`} api={api} accountId={accountId} />}
          {currentPage === 'viral' && <ViralTab key={`vp-${accountId}`} api={api} accountId={accountId} />}
          {currentPage === 'studio' && (
            <StudioTab key={`st-${accountId}`} api={api} accountId={accountId} onOpenDraft={openDrafts} />
          )}
          {currentPage === 'drafts' && <DraftsTab key={`df-${accountId}`} api={api} accountId={accountId} onOpenStudio={openStudio} />}
          {currentPage === 'personas' && <PersonasTab api={api} />}
        </div>
      </main>

      {dialogOpen && (
        <AccountsDialog
          api={api}
          onClose={() => setDialogOpen(false)}
          onSaved={(createdId?: string) => {
            if (createdId !== undefined) setAccountId(createdId)
            void refreshAccounts()
          }}
        />
      )}
    </div>
  )
}
