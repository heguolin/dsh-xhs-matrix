import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'
import { DraftEditor } from './DraftEditor.tsx'

interface DraftRow {
  id: string; accountId: string; date: string
  copy: string; coverPrompt: string; tags?: string; status: string
  metrics?: { reads: number; likes: number; comments: number; collected: string }
  evidence?: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }
}

/**
 * 草稿箱：列表 + 展开编辑（DraftEditor 双栏）+ 标记 published/dropped + 录入指标。
 * 草稿保持「草稿」状态，发布由人工在端内完成。
 */
export function DraftsTab({ api, accountId, onOpenStudio }: { api: XhsApi; accountId: string; onOpenStudio: (accountId: string) => void }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [draftList, accountList] = await Promise.all([api.listDrafts(), api.listAccounts()])
      setDrafts(draftList)
      setAccounts(accountList)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const accountName = (id: string): string => accounts.find(a => a.id === id)?.name ?? id

  // 草稿箱按当前账号隔离：只显示该账号工作区的草稿。
  const visibleDrafts = accountId === '' ? drafts : drafts.filter(d => d.accountId === accountId)

  const toggleExpand = (id: string): void => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const copyDraft = async (draft: DraftRow): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`【标题】${draft.copy}\n【封面提示词】${draft.coverPrompt}`)
    } catch {
      setError('复制失败：请手动复制')
    }
  }

  const publish = async (draft: DraftRow): Promise<void> => {
    const reads = window.prompt(`录入「${draft.date}」草稿的阅读量（留空跳过指标）`, '')
    if (reads === null) return
    const metrics = reads.trim() === ''
      ? undefined
      : { reads: Number(reads) || 0, likes: 0, comments: 0, collected: new Date().toISOString() }
    try {
      await api.setDraftStatus(draft.id, 'published', metrics)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const drop = async (draft: DraftRow): Promise<void> => {
    try {
      await api.setDraftStatus(draft.id, 'dropped')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {accountId === '' && <div className={css.empty}>请先在左侧选择账号，草稿箱按账号隔离。</div>}
      {accountId !== '' && visibleDrafts.length === 0 && <div className={css.muted}>该账号暂无草稿。在「创作台」中生成，或让助手为你撰写后保存。</div>}
      {visibleDrafts.map(draft => {
        const expanded = expandedId === draft.id
        return (
          <div key={draft.id} className={css.libRow} style={{ flexDirection: 'column' }}>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{draft.date}</span>
              <span className={css.muted}>账号 {accountName(draft.accountId)}</span>
              {draft.status === 'generated' ? <span className={css.badgeGray}>已生成</span>
                : draft.status === 'published' ? <span className={css.badgeGreen}>已发布</span>
                : <span className={css.badgeGray}>已弃用</span>}
              {draft.metrics !== undefined && <span className={css.badge}>阅读 {draft.metrics.reads}</span>}
              <span style={{ flex: 1 }} />
              <button className={css.ghostBtn} onClick={() => toggleExpand(draft.id)}>{expanded ? '收起' : '展开'}</button>
            </div>
            <button
              className={css.ghostBtn}
              style={{ width: '100%', textAlign: 'left', whiteSpace: 'pre-wrap', cursor: 'pointer', color: 'var(--xhs-text-sub)' }}
              onClick={() => toggleExpand(draft.id)}
              title="点击查看完整文案"
            >
              {expanded
                ? <><span style={{ fontWeight: 600, color: 'var(--xhs-text)' }}>{draft.copy.split('\n')[0]}</span>{'\n'}{draft.copy}</>
                : <span>{draft.copy.slice(0, 100)}{draft.copy.length > 100 ? '…' : ''}</span>}
            </button>
            {expanded && (
              <div style={{ width: '100%' }}>
                <div className={css.rowActions} style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                  <button className={css.ghostBtn} onClick={() => void copyDraft(draft)}>复制文案</button>
                  {draft.status === 'generated' && (
                    <>
                      <button className={css.primary} onClick={() => void publish(draft)}>标记已发布</button>
                      <button className={css.dangerBtn} onClick={() => void drop(draft)}>标记弃用</button>
                    </>
                  )}
                  <button className={css.ghostBtn} onClick={() => onOpenStudio(draft.accountId)}>在创作台继续</button>
                </div>
                {draft.metrics !== undefined && (
                  <div className={css.field}>
                    <label>流量指标</label>
                    <div className={css.muted}>阅读 {draft.metrics.reads} · 点赞 {draft.metrics.likes} · 评论 {draft.metrics.comments}（采集于 {draft.metrics.collected.slice(0, 10)}）</div>
                  </div>
                )}
                <DraftEditor api={api} accountId={draft.accountId} draft={draft} onSaved={() => void refresh()} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
