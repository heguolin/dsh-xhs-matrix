import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PanelController } from '../controller.ts'
import { AccountsTab } from './AccountsTab.tsx'
import { DraftsTab } from './DraftsTab.tsx'
import { NegativesTab } from './NegativesTab.tsx'
import { PersonasTab } from './PersonasTab.tsx'
import { TopicsTab } from './TopicsTab.tsx'
import css from './panel.module.css'

export type TabId = 'accounts' | 'personas' | 'topics' | 'negatives' | 'drafts'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'accounts', label: '账号' },
  { id: 'personas', label: '人设' },
  { id: 'topics', label: '选题' },
  { id: 'negatives', label: '黑名单' },
  { id: 'drafts', label: '草稿' },
]

export interface XhsPanelProps {
  controller: PanelController
  api: XhsApi
}

/** 五 Tab 配置面板容器。 */
export function XhsPanel(props: XhsPanelProps) {
  const { api } = props
  const [tab, setTab] = useState<TabId>('accounts')
  return (
    <div className={css.view}>
      <div className={css.header}><h2>小红书矩阵</h2></div>
      <div className={css.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? css.tabActive : css.tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'accounts' && <AccountsTab api={api} />}
      {tab === 'personas' && <PersonasTab api={api} />}
      {tab === 'topics' && <TopicsTab api={api} />}
      {tab === 'negatives' && <NegativesTab api={api} />}
      {tab === 'drafts' && <DraftsTab api={api} />}
    </div>
  )
}
