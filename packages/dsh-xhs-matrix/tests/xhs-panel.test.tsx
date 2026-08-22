// @vitest-environment jsdom
// XhsPanel 面板数据流回归（Task 8 统一人设作用域状态与账号创建后即时选中）：
// 1) 创建账号后等待刷新并立即选中新账号（listAccounts 恰好调用两次）；
// 2) 资产人设作用域默认跟随当前账号人设、切换账号重新跟随、知识库/爆款池可临时切换。

import { describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { XhsPanel } from '../src/client/panel/XhsPanel.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { PanelController } from '../src/client/controller.ts'

/** 账号行（含连接与采集状态，用于侧栏状态点与人设解析）。 */
interface AccountRow {
  id: string; name: string; personaId: string; enabled: boolean; createdAt: string
}

interface PersonaRow { id: string; name: string; prompt: string; createdAt: string }

/** 构造面板 api mock：listAccounts 返回同一份可变数组，createAccount 会追加并回发新 id。 */
function makeApi(initialAccounts: AccountRow[]) {
  const accounts: AccountRow[] = [...initialAccounts]
  const personas: PersonaRow[] = [
    { id: 'p1', name: '人设一', prompt: '', createdAt: '2026-08-20T00:00:00.000Z' },
    { id: 'p2', name: '人设二', prompt: '', createdAt: '2026-08-20T00:00:00.000Z' },
  ]
  const api = {
    listAccounts: vi.fn(async () => accounts),
    listPersonas: vi.fn(async () => personas),
    createAccount: vi.fn(async (payload: { name: string; personaId: string; enabled: boolean }) => {
      const id = 'a' + (accounts.length + 1)
      accounts.push({ id, name: payload.name, personaId: payload.personaId, enabled: true, createdAt: '2026-08-20T00:00:00.000Z' })
      return { id }
    }),
    updateAccount: vi.fn(async () => ({ id: 'x' })),
    deleteAccount: vi.fn(async () => undefined),
    listNotes: vi.fn(async () => []),
    listMetrics: vi.fn(async () => []),
    saveMetricSnapshot: vi.fn(async () => undefined),
    setNoteWeight: vi.fn(async () => undefined),
    listViralBatches: vi.fn(async () => []),
    listViralItems: vi.fn(async () => []),
    collectViral: vi.fn(async () => []),
    reviewViralItem: vi.fn(async () => ({})),
    deleteViralBatch: vi.fn(async () => 0),
    getApifyConfig: vi.fn(async () => ({ actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
    updateApifyConfig: vi.fn(async () => ({ actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
    listStudioMessages: vi.fn(async () => []),
    studioSendStream: vi.fn(async () => ({ messageId: 'm1', coverPrompt: '' })),
    studioSaveDraft: vi.fn(async () => ({ id: 'd1' })),
    listDrafts: vi.fn(async () => []),
  }
  return { api, accounts, personas }
}

type MockApi = ReturnType<typeof makeApi>['api']

/** 渲染 XhsPanel 并等待首次加载完成。 */
async function renderPanel(initialAccounts: AccountRow[]) {
  const { api, accounts, personas } = makeApi(initialAccounts)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(<XhsPanel controller={{} as unknown as PanelController} api={api as unknown as XhsApi} />)
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  return { host, root, api, accounts, personas }
}

/** 当前选中的账号名（侧栏中带 aria-current 的账号按钮的文字）。 */
function selectedAccount(host: HTMLElement): string | null {
  const active = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.getAttribute('aria-current') === 'true')
  return active?.textContent?.trim() ?? null
}

/** 点击某账号按钮切换选中。 */
function clickAccount(host: HTMLElement, name: string): void {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.trim() === name)
  if (btn === undefined) throw new Error('账号按钮不存在: ' + name)
  btn.click()
}

/** 打开侧栏导航到指定页面。 */
function gotoPage(host: HTMLElement, label: string): void {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(label))
  if (btn === undefined) throw new Error('导航按钮不存在: ' + label)
  btn.click()
}

/** 通过原生 setter 写入受控输入。 */
function setInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 通过原生 setter 写入受控 select。 */
function setSelectValue(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 打开账号弹窗 → 填「新账号名」与「人设」→ 点弹窗「添加账号」。 */
async function createAccount(host: HTMLElement, name: string, personaId: string): Promise<void> {
  const openBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('添加账号'))
  if (openBtn === undefined) throw new Error('添加账号按钮不存在')
  openBtn.click()
  await new Promise(resolve => setTimeout(resolve, 0))

  const nameInput = Array.from(host.querySelectorAll<HTMLInputElement>('input'))
    .find(i => i.placeholder === '效率研究所')
  if (nameInput === undefined) throw new Error('新账号名输入框不存在')
  setInputValue(nameInput, name)

  const personaLabel = Array.from(host.querySelectorAll('label'))
    .find(l => l.textContent?.trim() === '人设')
  const personaSelect = personaLabel?.parentElement?.querySelector('select')
  if (personaSelect == null) throw new Error('人设下拉不存在')
  setSelectValue(personaSelect, personaId)

  const createBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.trim() === '添加账号')
  if (createBtn === undefined) throw new Error('弹窗添加账号按钮不存在')
  createBtn.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('创建账号', () => {
  it('后等待刷新并立即选中新账号', async () => {
    const { host, root, api } = await renderPanel([{ id: 'a1', name: '账号A', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' }])
    expect(api.listAccounts).toHaveBeenCalledTimes(1)
    await createAccount(host, '新账号', 'p1')
    expect(api.listAccounts).toHaveBeenCalledTimes(2)
    expect(selectedAccount(host)).toBe('新账号')
    root.unmount()
    host.remove()
  })
})

describe('人设作用域', () => {
  const accounts: AccountRow[] = [
    { id: 'a1', name: '账号A', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
    { id: 'a2', name: '账号B', personaId: 'p2', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
  ]

  it('默认跟随当前账号人设', async () => {
    const { host, root, api } = await renderPanel(accounts)
    // 默认选中第一个账号 a1 → 知识库以 a1 的人设 p1 作为作用域。
    gotoPage(host, '已发布知识库')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(selectedAccount(host)).toBe('账号A')
    expect(api.listNotes).toHaveBeenCalledWith('p1')
    root.unmount()
    host.remove()
  })

  it('切换账号后人设作用域重新跟随该账号人设', async () => {
    const { host, root, api } = await renderPanel(accounts)
    // 先切到账号B（人设 p2），再进入知识库 → 资产作用域重新跟随 p2。
    clickAccount(host, '账号B')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(selectedAccount(host)).toBe('账号B')
    gotoPage(host, '已发布知识库')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(api.listNotes).toHaveBeenCalledWith('p2')
    root.unmount()
    host.remove()
  })

  it('知识库人设作用域允许临时切换', async () => {
    const { host, root, api } = await renderPanel(accounts)
    gotoPage(host, '已发布知识库')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    // 当前账号仍是账号A（p1），临时把知识库作用域切到 p2。
    const selector = host.querySelector<HTMLSelectElement>('select[aria-label="切换人设"]')
    expect(selector).not.toBeNull()
    setSelectValue(selector!, 'p2')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(selectedAccount(host)).toBe('账号A')
    expect(api.listNotes).toHaveBeenCalledWith('p2')
    root.unmount()
    host.remove()
  })
})