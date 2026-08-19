// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { DraftsTab } from '../src/client/panel/DraftsTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

/** 草稿 Tab 交互回归：点击卡片可展开完整文案与封面提示词，再点收起。 */
describe('DraftsTab 展开详情', () => {
  it('点击展开显示完整文案与封面提示词，再点收起', async () => {
    const longCopy = '这是标题\n' + '正文第一行。'.repeat(40)
    const api = {
      listDrafts: async () => [{
        id: 'd1', accountId: 'acc-a', topicId: 't1', date: '2026-08-19',
        copy: longCopy, coverPrompt: '红色背景 + 大字标题', status: 'generated',
      }],
      setDraftStatus: async () => {},
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(<DraftsTab api={api} />)
    await new Promise(resolve => setTimeout(resolve, 100))

    // 初始为截断预览
    const preview = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('正文第一行'))
    expect(preview).not.toBeUndefined()
    expect(preview!.textContent).toContain('…')

    // 点击展开
    preview!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.textContent).toContain('红色背景 + 大字标题')
    expect(host.textContent).toContain('正文第一行。'.repeat(40).slice(0, 20))

    // 再点收起
    const expandedBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('这是标题'))
    expect(expandedBtn).not.toBeUndefined()
    expandedBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.textContent).not.toContain('红色背景 + 大字标题')

    root.unmount()
    host.remove()
  })
})
