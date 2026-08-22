// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { PersonasTab } from '../src/client/panel/PersonasTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (el instanceof HTMLTextAreaElement) setArea.call(el, value)
  else setInput.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 50))

const BASE_PERSONA = {
  id: 'p1', name: '干货风', prompt: '专业、数据支撑、不废话',
  toneTags: ['口语化'],
  writingStyles: ['痛点切入', '真实对比'],
  endingHookConstraints: '自然邀请读者分享经验或一起学习；不制造焦虑。',
  endingHookExamples: ['你也在学这块的话，可以一起来学习学习。', '你踩过哪些坑？欢迎把真实经历留在评论区。'],
  forbiddenWords: ['绝对', '百分百'],
}

function baseApi(overrides: Record<string, unknown> = {}): XhsApi {
  return {
    listPersonas: async () => [BASE_PERSONA],
    listAccounts: async () => [{ id: 'acc-a', name: '效率研究所', personaId: 'p1', enabled: true }],
    createPersona: async () => ({ id: 'p1' }),
    updatePersona: async () => ({ id: 'p1' }),
    deletePersona: async () => {},
    ...overrides,
  } as unknown as XhsApi
}

async function mount(api: XhsApi): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(<PersonasTab api={api} />)
  await settle()
  return { host, root }
}

function unmount(root: Root, host: HTMLDivElement): void {
  root.unmount()
  host.remove()
}

function clickPersona(host: HTMLDivElement, name: string): void {
  const btn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(name))
  expect(btn).not.toBeUndefined()
  btn!.click()
}

/** 人设配置页：写作风格 / 结尾互动钩子 / 人设违禁词 / 生效范围 四区块。 */
describe('PersonasTab 人设写作规则', () => {
  it('渲染四区块并展示写作风格标签，且不再把写作风格称为钩子', async () => {
    const { host, root } = await mount(baseApi())
    clickPersona(host, '干货风')
    await settle()

    expect(host.textContent).toContain('写作风格')
    expect(host.textContent).toContain('结尾互动钩子')
    expect(host.textContent).toContain('人设违禁词')
    expect(host.textContent).toContain('生效范围')

    expect(host.textContent).toContain('痛点切入')
    expect(host.textContent).toContain('真实对比')
    expect(host.textContent).not.toContain('钩子风格')
    expect(host.textContent).toContain('口癖')
    expect(host.textContent).toContain('口语化')
    expect(host.textContent).toContain('自然邀请读者分享经验或一起学习；不制造焦虑。')
    expect(host.textContent).toContain('绝对')
    expect(host.textContent).toContain('百分百')

    unmount(root, host)
  })

  it('写作风格可自由新增（回车）与删除', async () => {
    const { host, root } = await mount(baseApi())
    clickPersona(host, '干货风')
    await settle()

    const wsInput = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(i => i.placeholder === '输入自定义风格后回车')
    expect(wsInput).not.toBeUndefined()
    typeInto(wsInput!, '数据支撑')
    wsInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(host.textContent).toContain('数据支撑')

    const chip = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('痛点切入') && b.textContent?.includes('×'))
    expect(chip).not.toBeUndefined()
    chip!.click()
    await settle()
    expect(host.textContent).not.toContain('痛点切入')

    unmount(root, host)
  })

  it('结尾互动钩子最佳案例可增删', async () => {
    const { host, root } = await mount(baseApi())
    clickPersona(host, '干货风')
    await settle()

    const examples = (): number => Array.from(host.querySelectorAll<HTMLInputElement>('input')).filter(i => i.placeholder !== undefined && i.placeholder.includes('案例')).length
    expect(examples()).toBe(2)

    const addBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('添加案例'))
    expect(addBtn).not.toBeUndefined()
    addBtn!.click()
    await settle()
    expect(examples()).toBe(3)

    const delBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('删除案例'))
    expect(delBtn).not.toBeUndefined()
    delBtn!.click()
    await settle()
    expect(examples()).toBe(2)

    unmount(root, host)
  })

  it('保存人设设置把写作风格/结尾钩子/违禁词写入载荷', async () => {
    const saved: Array<Record<string, unknown>> = []
    const api = baseApi({
      updatePersona: async (_id: string, payload: Record<string, unknown>) => { saved.push(payload); return { id: 'p1' } },
    })
    const { host, root } = await mount(api)
    clickPersona(host, '干货风')
    await settle()

    const fwInput = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(i => i.placeholder === '输入违禁词后回车')
    typeInto(fwInput!, '包过')
    fwInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    const saveBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '保存设置')
    expect(saveBtn).not.toBeUndefined()
    saveBtn!.click()
    await settle()

    expect(saved.length).toBe(1)
    expect(saved[0].writingStyles).toEqual(['痛点切入', '真实对比'])
    expect(saved[0].endingHookConstraints).toContain('自然邀请读者分享经验')
    expect(saved[0].endingHookExamples).toContain('你也在学这块的话，可以一起来学习学习。')
    expect(saved[0].forbiddenWords).toEqual(['绝对', '百分百', '包过'])
    expect(saved[0].toneTags).toEqual(['口语化'])

    unmount(root, host)
  })

  it('人设仍有绑定账号或内容资产时删除展示 409 依赖数量', async () => {
    const api = baseApi({
      deletePersona: async () => {
        const err = new Error('该人设仍有绑定账号或内容资产，请先转移或处理') as Error & { body?: unknown }
        err.body = { error: '该人设仍有绑定账号或内容资产，请先转移或处理', usage: { accountCount: 2, noteCount: 3, viralCount: 4 } }
        throw err
      },
    })
    const origConfirm = window.confirm
    window.confirm = () => true
    try {
      const { host, root } = await mount(api)
      clickPersona(host, '干货风')
      await settle()

      const delBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '删除人设')
      expect(delBtn).not.toBeUndefined()
      delBtn!.click()
      await settle()

      expect(host.textContent).toContain('2 个账号')
      expect(host.textContent).toContain('3 篇笔记')
      expect(host.textContent).toContain('4 条爆款')

      unmount(root, host)
    } finally {
      window.confirm = origConfirm
    }
  })
})

/** 新建人设表单可输入，点「保存设置」调用 createPersona。 */
describe('PersonasTab 新建人设', () => {
  it('新建人设：输入名称/提示词/定位并提交', async () => {
    const created: Array<{ name: string; prompt: string; positioning?: string }> = []
    const api = {
      listPersonas: async () => [],
      listAccounts: async () => [],
      createPersona: async (payload: { name: string; prompt: string; positioning?: string }) => {
        created.push(payload)
        return { id: 'p1' }
      },
      updatePersona: async () => {},
      deletePersona: async () => {},
    } as unknown as XhsApi

    const { host, root } = await mount(api)

    // 点击「＋ 新建人设」展开表单
    const createBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('新建人设'))
    expect(createBtn).not.toBeUndefined()
    createBtn!.click()
    await settle()

    const inputs = host.querySelectorAll<HTMLInputElement>('input')
    const textareas = host.querySelectorAll<HTMLTextAreaElement>('textarea')
    expect(inputs.length).toBeGreaterThan(0)
    expect(textareas.length).toBeGreaterThan(0)

    typeInto(inputs[0], '干货风')
    typeInto(textareas[0], '专业、数据支撑、不废话')

    const saveBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '保存设置')
    expect(saveBtn).not.toBeUndefined()
    saveBtn!.click()
    await settle()

    expect(created.length).toBe(1)
    expect(created[0].name).toBe('干货风')
    expect(created[0].prompt).toBe('专业、数据支撑、不废话')

    unmount(root, host)
  })
})
