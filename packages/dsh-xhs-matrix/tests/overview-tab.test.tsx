// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { OverviewTab } from '../src/client/panel/OverviewTab.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { PublishedNote } from '../src/types.ts'

const account = { id: 'acc-a', name: '效率研究所', personaId: 'persona-1', enabled: true }
const accountB = { id: 'acc-b', name: '数据分析', personaId: 'persona-1', enabled: true }

/** 轮询等待条件成立（异步刷新可能在重载环境下慢于固定延时）。 */
async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/** 从渲染 DOM 解析矩阵「累计已发布」与每个账号卡片「已发布」数字。 */
function parseOverview(host: HTMLElement): { matrixPublished: number; accountPublished: Record<string, number> } {
  const matrix = host.querySelector('[data-testid="overview-metrics"]')
  const matrixMetric = (label: string): number => {
    if (!matrix) return NaN
    const div = Array.from(matrix.querySelectorAll('div')).find(d => d.textContent?.includes(label))
    const bold = div?.querySelector('b')
    return bold ? Number(bold.textContent) : NaN
  }
  const accountPublished: Record<string, number> = {}
  const titles = host.querySelectorAll('[data-testid="overview-account-title"]')
  for (const title of Array.from(titles)) {
    const name = title.querySelector('div')?.textContent ?? ''
    const card = title.parentElement?.parentElement
    const divs = Array.from(card?.querySelectorAll('div') ?? [])
    const pub = divs.find(d => d.textContent?.replace(/\s/g, '').startsWith('已发布'))
    const bold = pub?.querySelector('b')
    accountPublished[name] = bold ? Number(bold.textContent) : NaN
  }
  return { matrixPublished: matrixMetric('累计已发布'), accountPublished }
}

/** 运营总览：知识库与爆款按账号人设作用域查询，不再把裸账号 id 当作人设，避免 404。 */
describe('OverviewTab 人设作用域查询', () => {
  it('listNotes/listViralItems 使用 { accountId } 兼容作用域而非裸字符串', async () => {
    const noteScopes: unknown[] = []
    const viralScopes: unknown[] = []
    const api = {
      listPersonas: async () => [{ id: 'persona-1', name: '干货风' }],
      listDrafts: async () => [],
      listMetrics: async () => [],
      updateAccount: async () => ({ id: 'acc-a' }),
      listNotes: async (scope: unknown) => { noteScopes.push(scope); return [] },
      listViralItems: async (scope: unknown) => { viralScopes.push(scope); return [] },
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(
      <OverviewTab
        api={api}
        accounts={[account]}
        onOpenAccount={() => {}}
        onOpenStudio={() => {}}
        onAccountUpdated={() => {}}
      />,
    )
    await waitFor(() => noteScopes.length > 0 && viralScopes.length > 0)

    expect(noteScopes.length).toBeGreaterThan(0)
    expect(viralScopes.length).toBeGreaterThan(0)
    expect(noteScopes[0]).toEqual({ accountId: 'acc-a' })
    expect(viralScopes[0]).toEqual({ accountId: 'acc-a' })

    root.unmount()
    host.remove()
  })
})

/** Fix #3: 同人设共享资产不得在矩阵/账号指标中重复计数。 */
describe('OverviewTab 人设共享资产指标不重复计数', () => {
  it('两个账号绑定同一人设、一条来源账号 A 的共享笔记时，矩阵累计已发布=1、账号A已发布=1、账号B已发布=0', async () => {
    const sharedNote: PublishedNote = {
      id: 'note-shared',
      personaId: 'persona-1',
      sourceAccountId: 'acc-a',
      sourceAccountName: '效率研究所',
      title: '共享笔记',
      copy: '内容',
      publishedAt: '2026-08-22T00:00:00.000Z',
      source: 'manual',
      weight: 5,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    }
    const api = {
      listPersonas: async () => [{ id: 'persona-1', name: '干货风' }],
      listDrafts: async () => [],
      listMetrics: async () => [],
      updateAccount: async () => ({ id: 'acc-a' }),
      // 人设作用域：两账号绑定同一人设，listNotes 对两者都返回同一条共享笔记
      listNotes: async () => [sharedNote],
      listViralItems: async () => [],
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(
      <OverviewTab
        api={api}
        accounts={[account, accountB]}
        onOpenAccount={() => {}}
        onOpenStudio={() => {}}
        onAccountUpdated={() => {}}
      />,
    )
    await waitFor(() => Object.keys(parseOverview(host).accountPublished).length >= 2)

    const { matrixPublished, accountPublished } = parseOverview(host)
    expect(matrixPublished).toBe(1)
    expect(accountPublished['效率研究所']).toBe(1)
    expect(accountPublished['数据分析']).toBe(0)

    root.unmount()
    host.remove()
  })
})
