// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { OverviewTab } from '../src/client/panel/OverviewTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

const account = { id: 'acc-a', name: '效率研究所', personaId: 'persona-1', enabled: true }

/** 轮询等待条件成立（异步刷新可能在重载环境下慢于固定延时）。 */
async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
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
