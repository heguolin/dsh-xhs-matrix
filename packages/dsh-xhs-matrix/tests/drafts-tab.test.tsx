// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { DraftsTab } from '../src/client/panel/DraftsTab.tsx'
import { DraftEditor } from '../src/client/panel/DraftEditor.tsx'
import type { XhsApi } from '../src/client/api.ts'

/** 草稿 Tab 交互回归：点击卡片可展开完整文案与封面提示词（编辑态），再点收起。 */
describe('DraftsTab 展开详情', () => {
  it('点击展开显示完整文案与封面提示词，再点收起', async () => {
    const longCopy = '这是标题\n' + '正文第一行。'.repeat(40)
    const api = {
      listDrafts: async () => [{
        id: 'd1', accountId: 'acc-a', topicId: 't1', date: '2026-08-19',
        copy: longCopy, coverPrompt: '红色背景 + 大字标题', status: 'generated',
      }],
      listAccounts: async () => [{ id: 'acc-a', name: '效率研究所' }],
      setDraftStatus: async () => {},
      updateDraft: async () => {},
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(<DraftsTab api={api} accountId="acc-a" onOpenStudio={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 100))

    // 初始为截断预览
    const preview = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('正文第一行'))
    expect(preview).not.toBeUndefined()
    expect(preview!.textContent).toContain('…')

    // 点击展开
    preview!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.textContent).toContain('正文第一行。'.repeat(40).slice(0, 20))
    // 封面提示词进入编辑态 textarea（DraftEditor 双栏）
    const coverArea = Array.from(host.querySelectorAll('textarea')).find(t => (t as HTMLTextAreaElement).value.includes('红色背景'))
    expect(coverArea).not.toBeUndefined()

    // 再点收起
    const expandedBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('这是标题'))
    expect(expandedBtn).not.toBeUndefined()
    expandedBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.querySelectorAll('textarea').length).toBe(0)

    root.unmount()
    host.remove()
  })
})

/** 草稿与编辑器展示 personIdSnapshot + qualityReport（v4 人设快照与质检）。 */
describe('DraftsTab 人设快照与质检报告', () => {
  function qualityApi(): XhsApi {
    return {
      listDrafts: async () => [{
        id: 'd2', accountId: 'acc-a', date: '2026-08-20',
        copy: '测试标题\n正文内容', coverPrompt: '封面', status: 'generated',
        personaIdSnapshot: 'p1',
        qualityReport: { reviewStatus: 'passed', forbiddenWordHits: [], checkedAt: '2026-08-22T10:00:00.000Z', personaSnapshot: 'p1' },
      }],
      listAccounts: async () => [{ id: 'acc-a', name: '效率研究所' }],
      listNotes: async () => [],
      listViralItems: async () => [],
      setDraftStatus: async () => {},
      updateDraft: async () => {},
    } as unknown as XhsApi
  }

  it('展开后草稿箱展示人设快照与质检报告', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(<DraftsTab api={qualityApi()} accountId="acc-a" onOpenStudio={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 0))
    // 展开草稿
    const preview = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('测试标题'))
    preview!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(host.textContent).toContain('人设快照')
    expect(host.textContent).toContain('p1')
    expect(host.textContent).toContain('质检报告')
    expect(host.textContent).toContain('通过')

    root.unmount()
    host.remove()
  })

  it('DraftEditor 右栏展示人设快照与质检报告', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    const draft = {
      id: 'd2', accountId: 'acc-a', copy: '测试标题\n正文内容', coverPrompt: '封面', status: 'generated',
      personaIdSnapshot: 'p1',
      qualityReport: { reviewStatus: 'failed', forbiddenWordHits: [{ word: '绝对', position: 3 }], checkedAt: '2026-08-22T10:00:00.000Z', personaSnapshot: 'p1' },
    }
    root.render(<DraftEditor api={qualityApi()} accountId="acc-a" draft={draft as never} onSaved={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(host.textContent).toContain('人设快照')
    expect(host.textContent).toContain('p1')
    expect(host.textContent).toContain('质检报告')
    expect(host.textContent).toContain('未通过')
    expect(host.textContent).toContain('绝对')

    root.unmount()
    host.remove()
  })
})
