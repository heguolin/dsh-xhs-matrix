// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { ViralTab } from '../src/client/panel/ViralTab.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { ViralItem } from '../src/types.ts'

/** 一条待审核爆款样本。 */
const pendingItem: ViralItem = {
  id: 'v1',
  personaId: 'p1',
  title: '秋季通勤穿搭公式',
  body: '正文内容'.repeat(40),
  sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
  source: 'apify',
  status: 'pending',
  weight: 1,
  score: 86,
  reasons: ['命中穿搭方向', '高互动'],
  collectedAt: '2026-08-20T10:00:00.000Z',
}

/** 渲染 ViralTab 并等待异步刷新完成，返回宿主节点与 api mock。 */
async function renderTab() {
  const batch = { id: 'b1', accountId: 'acc-a', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [pendingItem] }
  const apiMock = {
    listViralBatches: vi.fn(async () => [batch]),
    collectViral: vi.fn(async () => []),
    reviewViralItem: vi.fn(async (_accountId: string, itemId: string, status: string) => ({ ...pendingItem, id: itemId, status })),
    deleteViralBatch: vi.fn(async () => 1),
    getApifyConfig: vi.fn(async () => ({ actorId: 'kuaima/xiaohongshu-search', apiToken: 'apify_api_test', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
    updateApifyConfig: vi.fn(async () => ({ actorId: 'kuaima/xiaohongshu-search', apiToken: 'apify_api_test', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(<ViralTab api={apiMock as unknown as XhsApi} accountId="acc-a" />)
  await new Promise(resolve => setTimeout(resolve, 100))
  return { host, root, apiMock }
}

/** 在宿主节点里按文案找按钮。 */
function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))
}

/** 爆款池页面：渲染列表、审核、采集交互。 */
describe('ViralTab 爆款池', () => {
  it('渲染待审核条目（标题/摘要截断/来源链接/推荐分/理由/状态），点「采纳」审核并刷新', async () => {
    const { host, root, apiMock } = await renderTab()

    // 列表内容：标题、截断正文、来源链接、推荐分、匹配理由、待审核徽标
    expect(host.textContent).toContain('秋季通勤穿搭公式')
    expect(host.textContent).toContain('正文内容')
    expect(host.textContent).toContain('…')
    expect(host.querySelector('a[href="https://www.xiaohongshu.com/explore/abc123"]')).not.toBeNull()
    expect(host.textContent).toContain('推荐分 86')
    expect(host.textContent).toContain('命中穿搭方向')
    expect(host.textContent).toContain('待审核')
    expect(apiMock.listViralBatches).toHaveBeenCalledWith('acc-a', undefined)

    // 点「采纳」→ reviewViralItem(accountId, id, 'accepted') 并刷新列表
    const adopt = findButton(host, '采纳')
    expect(adopt).not.toBeUndefined()
    adopt!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.reviewViralItem).toHaveBeenCalledWith('acc-a', 'v1', 'accepted')
    expect(apiMock.listViralBatches).toHaveBeenCalledTimes(2)

    root.unmount()
    host.remove()
  })

  it('点「采集爆款」调用 collectViral 并刷新列表', async () => {
    const { host, root, apiMock } = await renderTab()

    const collect = findButton(host, '采集爆款')
    expect(collect).not.toBeUndefined()
    collect!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.collectViral).toHaveBeenCalledWith('acc-a')
    expect(apiMock.listViralBatches).toHaveBeenCalledTimes(2)

    root.unmount()
    host.remove()
  })

  it('显示批次头并可删除该批次', async () => {
    const { host, root, apiMock } = await renderTab()
    // 批次头显示时间与条数
    expect(host.textContent).toContain('批次 ·')
    expect(host.textContent).toContain('1 条')
    expect(host.textContent).toContain('删除该批次')
    root.unmount()
    host.remove()
  })
})
