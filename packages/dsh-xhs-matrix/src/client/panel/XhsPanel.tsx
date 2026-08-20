import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PanelController } from '../controller.ts'
import { AccountsTab } from './AccountsTab.tsx'
import { DraftsTab } from './DraftsTab.tsx'
import { KnowledgeTab } from './KnowledgeTab.tsx'
import { OverviewTab } from './OverviewTab.tsx'
import { PersonasTab } from './PersonasTab.tsx'
import { StudioTab } from './StudioTab.tsx'
import { TopicsTab } from './TopicsTab.tsx'
import css from './panel.module.css'

export type TabId = 'overview' | 'accounts' | 'personas' | 'knowledge' | 'topics' | 'drafts' | 'studio'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'accounts', label: '账号' },
  { id: 'personas', label: '人设' },
  { id: 'knowledge', label: '知识库' },
  { id: 'topics', label: '选题' },
  { id: 'drafts', label: '草稿' },
  { id: 'studio', label: '创作台' },
]

export interface XhsPanelProps {
  controller: PanelController
  api: XhsApi
}

/** 混合布局面板容器：运营总览 + 账号管理 + 知识库 + 创作台。 */
export function XhsPanel(props: XhsPanelProps) {
  const { api } = props
  const [tab, setTab] = useState<TabId>('overview')
  const [accountId, setAccountId] = useState('')

  const openStudio = (id: string): void => {
    setAccountId(id)
    setTab('studio')
  }

  return (
    <div className={css.view}>
      <div className={css.header}><span className={css.headerDot} /><h2>小红书矩阵</h2></div>
      <div className={css.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? css.tabActive : css.tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab api={api} onOpenStudio={openStudio} />}
      {tab === 'accounts' && <AccountsTab api={api} />}
      {tab === 'personas' && <PersonasTab api={api} />}
      {tab === 'knowledge' && <KnowledgeTab api={api} accountId={accountId} />}
      {tab === 'topics' && <TopicsTab api={api} />}
      {tab === 'drafts' && <DraftsTab api={api} />}
      {tab === 'studio' && <StudioTab api={api} accountId={accountId} onOpenDraft={() => setTab('drafts')} />}
    </div>
  )
}
