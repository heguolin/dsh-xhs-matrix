// @vitest-environment jsdom
// KnowledgeTab (v4)：已发布知识库的人设资产视图。
// 覆盖：默认以当前人设加载、临时切换人设、来源账号快照、0-5 权重、显式转移、
// 待归属入口（仅 pending>0 显示）、违禁词警告不阻止收录、导入目标为当前人设。
import { describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { KnowledgeTab } from '../src/client/panel/KnowledgeTab.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { PublishedNote } from '../src/types.ts'

/** 一条已发布笔记（人设归属 + 来源账号快照）。 */
const note: PublishedNote = {
  id: 'n1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '工程师傅',
  title: '大模型项目落地，我为什么先做评估集', copy: '真实项目复盘：先定义失败，再选择模型和框架。',
  source: 'manual', weight: 5, publishedAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
}

/** 命中人设违禁词的笔记（用于「警告不阻止收录」）。 */
const forbiddenNote: PublishedNote = {
  ...note, id: 'n2', title: '别把 AI 当许愿池', copy: '这款「最强」的工具我用了半年。', weight: 3,
}

const personas = [
  { id: 'p1', name: '人设一', prompt: '', createdAt: '2026-08-20T00:00:00.000Z', forbiddenWords: ['最强', '百分百'] },
  { id: 'p2', name: '人设二', prompt: '', createdAt: '2026-08-20T00:00:00.000Z', forbiddenWords: ['绝对'] },
]

const accounts = [
  { id: 'a1', name: '工程师傅', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
  { id: 'a2', name: '学生成长实验室', personaId: 'p1', enabled: true, createdAt: '2026-08-20T00:00:00.000Z' },
]

/** 构造 KnowledgeTab 的 api mock（缺省返回干净数据，可覆盖具体行为）。 */
function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listPersonas: vi.fn(async () => personas),
    listAccounts: vi.fn(async () => accounts),
    listPending: vi.fn(async () => []),
    listNotes: vi.fn(async () => [note]),
    setNoteWeight: vi.fn(async () => undefined),
    transferNotes: vi.fn(async () => [note]),
    importPublishedNotes: vi.fn(async () => 1),
    assignPending: vi.fn(async () => note),
    ...overrides,
  }
}
type MockApi = ReturnType<typeof makeApi>

/** 冲刷微任务 + 多次宏任务，确保所有异步 effect（personas/accounts/pending/notes）落库。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

async function renderTab(apiMock: MockApi, personaId = 'p1') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const onPersonaChange = vi.fn()
  root.render(<KnowledgeTab api={apiMock as unknown as XhsApi} accountId="a1" personaId={personaId} onPersonaChange={onPersonaChange} />)
  await flush()
  return { host, root, onPersonaChange }
}

function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))
}

function findButtonExact(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
}

function setSelectValue(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('KnowledgeTab 已发布知识库', () => {
  it('默认以当前人设作用域加载笔记，并渲染人设资产视图（作用域带/统计/卡片/来源快照）', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    // 以 personaId 作为作用域加载笔记（绝不把账号 id 当人设）。
    expect(apiMock.listNotes).toHaveBeenCalledWith('p1')
    // 作用域带：人设名 + 标题 + 统计
    expect(host.textContent).toContain('人设一')
    expect(host.textContent).toContain('已发布知识库')
    expect(host.textContent).toContain('已发布')
    expect(host.textContent).toContain('高权重')
    expect(host.textContent).toContain('共享账号')
    // 共享账号数为绑定该人设的账号数（2 个）
    expect(apiMock.listAccounts).toHaveBeenCalled()
    // 卡片：标题 + 来源账号快照
    expect(host.textContent).toContain('大模型项目落地，我为什么先做评估集')
    expect(host.textContent).toContain('来源：工程师傅')

    root.unmount()
    host.remove()
  })

  it('临时切换人设通过 onPersonaChange 上抛（作用域由父级统一持有）', async () => {
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

  it('待归属入口仅在 pending 数量大于 0 时显示', async () => {
    // pending 为空：不显示待归属入口。
    const empty = makeApi()
    const r1 = await renderTab(empty)
    expect(findButton(r1.host, '待归属')).toBeUndefined()
    r1.root.unmount()
    r1.host.remove()

    // pending 有遗留：显示「待归属 N」入口。
    const pending = makeApi({
      listPending: vi.fn(async () => [{ id: 'pd1', kind: 'published-note', payload: note, sourceAccountId: 'a1', sourceAccountName: '工程师傅', reason: '账号未绑定人设', migratedAt: '2026-08-20T10:00:00.000Z' }]),
    })
    const r2 = await renderTab(pending)
    expect(findButton(r2.host, '待归属 1')).not.toBeUndefined()
    r2.root.unmount()
    r2.host.remove()
  })

  it('0-5 权重按钮调用 setNoteWeight 并传 personaId 作用域', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    const w4 = host.querySelector<HTMLButtonElement>('button[title="权重 4"]')
    expect(w4).not.toBeNull()
    w4!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.setNoteWeight).toHaveBeenCalledWith('p1', 'n1', 4)

    root.unmount()
    host.remove()
  })

  it('显式转移：选择目标人设后调用 transferNotes(personaId, target, noteIds)', async () => {
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
    expect(confirm).not.toBeUndefined()
    confirm!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(apiMock.transferNotes).toHaveBeenCalledWith('p1', 'p2', ['n1'])
    expect(apiMock.listNotes).toHaveBeenCalledTimes(2)

    root.unmount()
    host.remove()
  })

  it('参考素材命中人设违禁词只显示警告，不阻止收录', async () => {
    const apiMock = makeApi({ listNotes: vi.fn(async () => [forbiddenNote]) })
    const { host, root } = await renderTab(apiMock)

    expect(host.textContent).toContain('命中人设违禁词')
    expect(host.textContent).toContain('最强')
    expect(host.textContent).toContain('不阻止收录')
    // 笔记仍然被收录渲染，未被排除
    expect(host.textContent).toContain('别把 AI 当许愿池')

    root.unmount()
    host.remove()
  })

  it('点击「导入已发布笔记」打开导入弹窗，导入目标为当前人设', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock)

    // 当前作用域人设名已在弹窗内只读展示（归属人设）。
    const importing = findButton(host, '导入已发布笔记')
    expect(importing).not.toBeUndefined()
    importing!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(host.textContent).toContain('归属人设')
    expect(host.textContent).toContain('标题（每行一个，必填）')
    const personaInput = Array.from(host.querySelectorAll('input')).find(i => i.readOnly)
    expect(personaInput?.value).toBe('人设一')
    // 导入由当前账号（绑定当前人设）提交。
    const area = Array.from(host.querySelectorAll('textarea'))[0] as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(area, '标题一')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    const area2 = Array.from(host.querySelectorAll('textarea'))[1] as HTMLTextAreaElement
    setter.call(area2, '正文一')
    area2.dispatchEvent(new Event('input', { bubbles: true }))
    const run = findButtonExact(host, '导入')
    run!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.importPublishedNotes).toHaveBeenCalledWith('a1', 'json', JSON.stringify([{ title: '标题一', copy: '正文一' }]), 'p1')

    root.unmount()
    host.remove()
  })

  it('临时切换人设作用域到 B 后导入，目标为 B 而非账号人设', async () => {
    const apiMock = makeApi()
    const { host, root } = await renderTab(apiMock, 'p2')

    const importing = findButton(host, '导入已发布笔记')
    importing!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const personaInput = Array.from(host.querySelectorAll('input')).find(i => i.readOnly)
    expect(personaInput?.value).toBe('人设二')

    const area = Array.from(host.querySelectorAll('textarea'))[0] as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(area, '标题一')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    const area2 = Array.from(host.querySelectorAll('textarea'))[1] as HTMLTextAreaElement
    setter.call(area2, '正文一')
    area2.dispatchEvent(new Event('input', { bubbles: true }))
    const run = findButtonExact(host, '导入')
    run!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    // 导入以当前作用域人设 B 为目标，账号 a1 仅作来源快照。
    expect(apiMock.importPublishedNotes).toHaveBeenCalledWith('a1', 'json', JSON.stringify([{ title: '标题一', copy: '正文一' }]), 'p2')

    root.unmount()
    host.remove()
  })

  it('待归属每行独立选择目标人设，互不覆盖（单行 assign）', async () => {
    const apiMock = makeApi({
      listPending: vi.fn(async () => [
        { id: 'pd1', kind: 'published-note', payload: note, sourceAccountId: 'a1', sourceAccountName: '工程师傅', reason: '账号未绑定人设', migratedAt: '2026-08-20T10:00:00.000Z' },
        { id: 'pd2', kind: 'published-note', payload: { ...note, id: 'n2', title: '另一篇' }, sourceAccountId: 'a1', sourceAccountName: '工程师傅', reason: '账号未绑定人设', migratedAt: '2026-08-20T10:00:00.000Z' },
      ]),
    })
    const { host, root } = await renderTab(apiMock)
    const pendingBtn = findButton(host, '待归属 2')
    pendingBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    const selects = Array.from(host.querySelectorAll<HTMLSelectElement>('select[aria-label="归属目标人设"]'))
    expect(selects).toHaveLength(2)
    setSelectValue(selects[0], 'p2')
    await new Promise(resolve => setTimeout(resolve, 0))
    // 第二行未被第一行选择覆盖。
    expect(selects[1].value).toBe('')

    const assignBtns = Array.from(host.querySelectorAll('button')).filter(b => b.textContent?.includes('归属到该人设'))
    assignBtns[0].click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiMock.assignPending).toHaveBeenCalledWith('pd1', 'p2')

    root.unmount()
    host.remove()
  })
})