// @vitest-environment jsdom
// ViralTab (v4)：爆款池的人设资产视图。
// 覆盖：默认以当前人设加载、批次左侧摘要 + 右侧可扫描列表（不默认展开全文）、
// 临时切换人设、手动新增后即时显示 accepted+5、来源账号、爆款权重、批次删除、
// 显式转移、待归属入口（仅 pending>0）、违禁词警告不阻止收录。
import { describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { ViralTab } from '../src/client/panel/ViralTab.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { ViralItem } from '../src/types.ts'

/** 待审核爆款条目（正文足够长以验证摘要截断）。 */
const pendingItem: ViralItem = {
  id: 'v1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '工程师傅',
  title: '用 AI 写代码一年后，我留下的 4 条真心得', body: '别把 AI 当成许愿池。拆任务、给上下文、写测试，比一句“帮我写个系统”靠谱得多。'.repeat(20),
  sourceUrl: 'https://www.xiaohongshu.com/explore/abc123', source: 'apify', status: 'pending', weight: 1,
  score: 86, reasons: ['命中编程方向'], collectedAt: '2026-08-20T10:00:00.000Z', batchId: 'b1',
}

/** 已采纳（手动）爆款条目。 */
const acceptedItem: ViralItem = {
  ...pendingItem, id: 'v2', title: 'Cursor 真正省时间的不是补全', body: '一个真实的重构案例。', source: 'manual', status: 'accepted', weight: 5, score: 0, reasons: ['手动新增'],
}

/** 命中人设违禁词的条目（用于「警告不阻止收录」）。 */
const forbiddenItem: ViralItem = {
  ...pendingItem, id: 'v3', title: '绝对能涨粉的套路', body: '这款工具「绝对」好用。', weight: 1,
}

const personas = [
  { id: 'p1', name: '人设一', prompt: '', createdAt: '2026-08-20T00:00:00.000Z', forbiddenWords: ['最强', '绝对', '百分百'] },
  { id: 'p2', name: '人设二', prompt: '', createdAt: '2026-08-20T00:00:00.000Z', forbiddenWords: [] },
]

const accounts = [
  { id: 'a1', name: '工程师傅', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
  { id: 'a2', name: '学生成长实验室', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
]

interface MockApi {
  listPersonas: ReturnType<typeof vi.fn>
  listAccounts: ReturnType<typeof vi.fn>
  listPending: ReturnType<typeof vi.fn>
  listViralBatches: ReturnType<typeof vi.fn>
  addManualViral: ReturnType<typeof vi.fn>
  deleteViralBatch: ReturnType<typeof vi.fn>
  reviewViralItem: ReturnType<typeof vi.fn>
  transferVirals: ReturnType<typeof vi.fn>
  collectViral: ReturnType<typeof vi.fn>
  getApifyConfig: ReturnType<typeof vi.fn>
  updateApifyConfig: ReturnType<typeof vi.fn>
}

/** 构造 ViralTab 的 api mock（缺省返回一组批次，可覆盖具体行为）。 */
function makeApi(overrides: Partial<MockApi> = {}): MockApi {
  const items = [pendingItem, acceptedItem]
  const batch = { id: 'b1', personaId: 'p1', sourceAccountId: 'a1', query: 'AI 编程', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: items.length, items }
  return {
    listPersonas: vi.fn(async () => personas),
    listAccounts: vi.fn(async () => accounts),
    listPending: vi.fn(async () => []),
    listViralBatches: vi.fn(async () => [batch]),
    addManualViral: vi.fn(async (personaId: string, payload: { title: string; body: string; sourceUrl?: string; publishedAt?: string }) => {
      const item: ViralItem = {
        id: 'm1', personaId, sourceAccountId: 'a1', sourceAccountName: '工程师傅', title: payload.title, body: payload.body,
        sourceUrl: payload.sourceUrl, publishedAt: payload.publishedAt, source: 'manual', status: 'accepted', weight: 5,
        score: 0, reasons: ['手动新增'], collectedAt: '2026-08-20T10:00:00.000Z', batchId: 'manual',
      }
      items.push(item)
      return item
    }),
    deleteViralBatch: vi.fn(async () => 2),
    reviewViralItem: vi.fn(async (_scope: string, itemId: string, status: string) => ({ ...pendingItem, id: itemId, status })),
    transferVirals: vi.fn(async () => [acceptedItem]),
    collectViral: vi.fn(async () => []),
    getApifyConfig: vi.fn(async () => ({ actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
    updateApifyConfig: vi.fn(async () => ({ actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 120000, maxPolls: 60 })),
    ...overrides,
  }
}

/** 冲刷微任务 + 多次宏任务，确保所有异步 effect（personas/accounts/pending/batches/默认展开）落库。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

async function renderTab(apiMock: MockApi, personaId = 'p1') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const onPersonaChange = vi.fn()
  root.render(<ViralTab api={apiMock as unknown as XhsApi} accountId="a1" personaId={personaId} onPersonaChange={onPersonaChange} />)
  await flush()
  return { host, root, onPersonaChange }
}

function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))
}

function setSelectValue(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 通过 label 文案写入 input/textarea。 */
function typeInto(host: HTMLElement, label: string, value: string): void {
  const labelNode = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.trim().startsWith(label))
  expect(labelNode).not.toBeUndefined()
  const container = labelNode!.parentElement!
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ViralTab 爆款池', () => {
  it('默认以当前人设加载，左侧批次摘要 + 右侧条目列表，条目只显示摘要不默认展开全文', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    expect(apiMock.listViralBatches).toHaveBeenCalledWith('p1', undefined)
    // 批次摘要（左侧）
    expect(host.textContent).toContain('AI 编程')
    // 条目标题 + 来源账号快照
    expect(host.textContent).toContain('用 AI 写代码一年后，我留下的 4 条真心得')
    expect(host.textContent).toContain('来源：工程师傅')
    // 正文为截断摘要（以 … 结尾），不把超长全文全部展开
    expect(host.textContent).toContain('…')
    expect(host.textContent).not.toContain('比一句“帮我写个系统”靠谱得多。'.repeat(2))

    root.unmount()
    host.remove()
  })

  it('临时切换人设通过 onPersonaChange 上抛', async () => {
    const apiMock = makeApi()
    const { host, root, onPersonaChange } = await renderTab(apiMock)

    const selector = host.querySelector<HTMLSelectElement>('select[aria-label="切换人设"]')
    expect(selector).not.toBeNull()
    setSelectValue(selector!, 'p2')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onPersonaChange).toHaveBeenCalledWith('p2')

    root.unmount()
    host.remove()
  })

  it('手动新增爆款：弹窗只读归属人设、明确「默认已采纳 · 权重 5」，保存后即时展示 accepted+5', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    const open = findButton(host, '＋ 手动新增')
    expect(open).not.toBeUndefined()
    open!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    // 弹窗字段：归属人设（只读当前作用域）+ 标题/正文/可选来源/发布时间 + 「默认已采纳 · 权重 5」
    const personaInput = Array.from(host.querySelectorAll('input')).find(i => i.readOnly)
    expect(personaInput?.value).toBe('人设一')
    expect(host.textContent).toContain('默认已采纳 · 权重 5')

    typeInto(host, '标题', '我的手动精选')
    typeInto(host, '正文', '这是一条手动精选爆款')

    const save = findButton(host, '保存到该人设')
    expect(save).not.toBeUndefined()
    save!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    // addManualViral 以 personaId 为主参数（绝不把账号裸传为人设）。
    expect(apiMock.addManualViral).toHaveBeenCalledWith('p1', { title: '我的手动精选', body: '这是一条手动精选爆款' })
    // 保存后立即展示：已采纳 + 权重 5
    expect(host.textContent).toContain('我的手动精选')
    expect(host.textContent).toContain('权重 5 / 5')

    root.unmount()
    host.remove()
  })

  it('爆款权重以 0-5 控件呈现并显示当前值', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    expect(host.querySelector('button[title="权重 5"]')).not.toBeNull()
    expect(host.textContent).toContain('权重 5 / 5')
    expect(host.textContent).toContain('权重 1 / 5')

    root.unmount()
    host.remove()
  })

  it('批次删除：调用 deleteViralBatch(personaId, batchId)', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    // 弹窗确认
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const del = findButton(host, '删除该批次')
    expect(del).not.toBeUndefined()
    del!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.deleteViralBatch).toHaveBeenCalledWith('p1', 'b1')
    confirmSpy.mockRestore()

    root.unmount()
    host.remove()
  })

  it('显式转移：选择目标人设后调用 transferVirals(personaId, target, itemIds)', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    const transferBtn = findButton(host, '转移人设')
    expect(transferBtn).not.toBeUndefined()
    transferBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    const target = host.querySelector<HTMLSelectElement>('select[aria-label="转移目标人设"]')
    expect(target).not.toBeNull()
    setSelectValue(target!, 'p2')
    const confirm = findButton(host, '确认转移')
    confirm!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(apiMock.transferVirals).toHaveBeenCalledWith('p1', 'p2', ['v1'])
    expect(apiMock.listViralBatches).toHaveBeenCalledTimes(2)

    root.unmount()
    host.remove()
  })

  it('待归属入口仅在 pending 数量大于 0 时显示', async () => {
    const empty = makeApi()
    const r1 = await renderTab(empty)
    expect(findButton(r1.host, '待归属')).toBeUndefined()
    r1.root.unmount()
    r1.host.remove()

    const pending = makeApi({ listPending: vi.fn(async () => [{ id: 'pd1', kind: 'viral-item', payload: pendingItem, sourceAccountId: 'a1', sourceAccountName: '工程师傅', reason: '账号未绑定人设', migratedAt: '2026-08-20T10:00:00.000Z' }]) })
    const r2 = await renderTab(pending)
    expect(findButton(r2.host, '待归属 1')).not.toBeUndefined()
    r2.root.unmount()
    r2.host.remove()
  })

  it('参考素材命中人设违禁词只显示警告，不阻止收录', async () => {
    const apiMock = makeApi({ listViralBatches: vi.fn(async () => [{ id: 'b1', personaId: 'p1', sourceAccountId: 'a1', query: '涨粉', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [forbiddenItem] }]) })
    const { host, root } = await renderTab(apiMock)

    expect(host.textContent).toContain('命中人设违禁词')
    expect(host.textContent).toContain('绝对')
    expect(host.textContent).toContain('不阻止收录')
    expect(host.textContent).toContain('绝对能涨粉的套路')

    root.unmount()
    host.remove()
  })
})