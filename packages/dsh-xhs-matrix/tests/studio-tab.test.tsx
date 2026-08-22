// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { StudioTab } from '../src/client/panel/StudioTab.tsx'
import type { XhsApi } from '../src/client/api.ts'
import type { StudioSseEvent } from '../src/studio.ts'

const setTextarea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 60))

const PERSONA = {
  id: 'p1', name: '干货风', prompt: '专业、数据支撑、不废话',
  writingStyles: ['痛点切入', '真实对比'],
  endingHookConstraints: '自然邀请读者分享经验',
  endingHookExamples: ['可以一起来学习学习'],
  forbiddenWords: ['绝对', '百分百'],
}

const ISO = '2026-08-22T00:00:00.000Z'
const PASS_QUALITY = {
  reviewStatus: 'passed' as const, forbiddenWordHits: [], checkedAt: ISO, personaSnapshot: PERSONA.name,
}
const FAIL_QUALITY = {
  reviewStatus: 'failed' as const, forbiddenWordHits: [{ word: '必看', position: 0 }], checkedAt: ISO, personaSnapshot: PERSONA.name,
}

/**
 * 可控流式假 API：studioSendStream 捕获 onEvent 并等待 release()。
 * emit 可在流进行中注入事件；若注入 error 事件，release 后按真实行为抛错；
 * 若注入 done，release 后返回正常 summary，否则不返回 done（模拟违禁词命中）。 */
interface StreamHarness {
  api: XhsApi
  emit: (event: StudioSseEvent) => void
  release: () => void
  saveCount: number
}
function makeHarness(initial: StudioSseEvent[] = []): StreamHarness {
  let onEvent: ((e: StudioSseEvent) => void) | null = null
  let releaseFn: (() => void) | null = null
  let didError = false
  let errMsg = ''
  let didDone = false
  let saveCount = 0
  const hold = new Promise<void>(resolve => { releaseFn = resolve })
  const api = {
    listStudioMessages: async () => [],
    listPersonas: async () => [PERSONA],
    listNotes: async () => [],
    listViralItems: async () => [],
    studioSendStream: async (_a: string, _b: string, _c: string, cb: (e: StudioSseEvent) => void) => {
      onEvent = cb
      for (const e of initial) cb(e)
      await hold
      if (didError) throw new Error(errMsg)
      if (didDone) return { messageId: 'm1', coverPrompt: '', evidence: { persona: PERSONA.name, noteIds: [], trendIds: [], reasons: ['参考素材'] }, personaId: 'p1' }
      // 违禁词命中：无 done，客户端将抛「流式响应未正常结束」。
      throw new Error('流式响应未正常结束')
    },
    studioSaveDraft: async () => { saveCount += 1; return { id: 'd1' } },
    listDrafts: async () => [],
  } as unknown as XhsApi
  return {
    api,
    emit: e => {
      if (e.type === 'error') { didError = true; errMsg = e.message }
      if (e.type === 'done') didDone = true
      onEvent?.(e)
    },
    release: () => { releaseFn?.() },
    get saveCount() { return saveCount },
  }
}

async function mount(api: XhsApi): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(<StudioTab api={api} accountId="a1" personaId="p1" onOpenDraft={() => {}} />)
  await settle()
  return { host, root }
}
function unmount(root: Root, host: HTMLDivElement): void { root.unmount(); host.remove() }

function typeInto(el: HTMLTextAreaElement, value: string): void {
  setTextarea.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function textarea(host: HTMLDivElement): HTMLTextAreaElement {
  const el = Array.from(host.querySelectorAll('textarea')).find(t => t.placeholder.includes('创作指令'))
  expect(el).toBeDefined()
  return el as HTMLTextAreaElement
}
function clickSend(host: HTMLDivElement): void {
  const btn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '发送 ↑')
  expect(btn).toBeDefined()
  ;(btn as HTMLButtonElement).click()
}
function findButton(host: HTMLDivElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)
}
function scroller(host: HTMLDivElement): HTMLElement {
  const el = host.querySelector('[data-testid="studio-list"]')
  expect(el).toBeDefined()
  return el as HTMLElement
}
/** 用可控 getter/setter 模拟滚动几何（jsdom 不参与布局）。 */
function mockScroll(el: HTMLElement, height: number, clientHeight: number): { readonly state: { scrollTop: number } } {
  const state = { scrollTop: 0 }
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight })
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => state.scrollTop, set: (v: number) => { state.scrollTop = v } })
  return { state }
}

describe('StudioTab 结构化流式创作与智能跟随底部', () => {
  it('流式中渲染四阶段进度、可折叠创作说明、最终稿与依据侧栏', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    harness.emit({ type: 'phase', phase: 'planning' })
    harness.emit({ type: 'evidence', evidence: { persona: PERSONA.name, noteIds: ['n1'], trendIds: ['v1'], reasons: ['高权重参考'] } })
    harness.emit({ type: 'phase', phase: 'drafting' })
    harness.emit({ type: 'plan_delta', delta: '角度：真实复盘；结构：场景→判断→互动。' })
    harness.emit({ type: 'phase', phase: 'polishing' })
    harness.emit({ type: 'content_delta', delta: '最终稿正文第一句。' })
    harness.emit({ type: 'phase', phase: 'checking' })
    harness.emit({ type: 'quality', report: PASS_QUALITY, allowed: true })
    await settle()

    expect(host.textContent).toContain('规划')
    expect(host.textContent).toContain('起草')
    expect(host.textContent).toContain('去 AI 味')
    expect(host.textContent).toContain('违禁词检查')
    expect(host.textContent).toContain('创作说明')
    expect(host.textContent).toContain('本次创作依据')
    expect(host.textContent).toContain('保存为草稿')

    unmount(root, host)
  })

  it('plan_delta 只写入创作说明，content_delta 只写最终稿正文', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    harness.emit({ type: 'plan_delta', delta: '计划：先讲问题再给办法。' })
    harness.emit({ type: 'content_delta', delta: '正文：真正有用的办法。' })
    await settle()

    const planBody = host.querySelector('[data-testid="studio-plan"]')
    const finalBody = host.querySelector('[data-testid="studio-final"]')
    expect(planBody).not.toBeNull()
    expect(finalBody).not.toBeNull()
    expect(planBody!.textContent).toContain('计划：先讲问题再给办法。')
    expect(planBody!.textContent).not.toContain('真正有用的办法')
    expect(finalBody!.textContent).toContain('真正有用的办法')
    expect(finalBody!.textContent).not.toContain('计划：先讲问题再给办法。')

    unmount(root, host)
  })

  it('quality.allowed === false 禁用保存并为最终稿标记未通过', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    harness.emit({ type: 'content_delta', delta: '这篇必看的文章。' })
    harness.emit({ type: 'quality', report: FAIL_QUALITY, allowed: false })
    harness.release()
    await settle()

    expect(host.textContent).toContain('必看')
    const saveBtn = findButton(host, '保存为草稿')
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.disabled).toBe(true)

    unmount(root, host)
  })

  it('可重试错误显示错误与重试', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    harness.emit({ type: 'error', stage: 'stream', retryable: true, message: '模型调用失败' })
    harness.release()
    await settle()

    expect(host.textContent).toContain('模型调用失败')
    const retryBtn = findButton(host, '重试')
    expect(retryBtn).toBeDefined()

    unmount(root, host)
  })

  it('底部附近持续跟随新内容到底部，不显示回到最新', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    const el = scroller(host)
    const { state } = mockScroll(el, 1000, 200)
    // 用户仍在底部附近（1000 - 930 - 200 = -130 <= 80）。
    state.scrollTop = 930
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
    // 新内容到达：跟随应滚到底，且不出「回到最新」。
    harness.emit({ type: 'content_delta', delta: '新内容' })
    await settle()
    expect(state.scrollTop).toBe(1000)
    expect(findButton(host, '回到最新')).toBeUndefined()

    unmount(root, host)
  })

  it('用户上滚后暂停跟随，点击回到最新后恢复', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮我写一篇')
    clickSend(host)
    await settle()
    const el = scroller(host)
    const { state } = mockScroll(el, 1000, 200)
    // 主动上滚超过阈值（1000 - 120 - 200 = 680 > 80）。
    state.scrollTop = 120
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()

    // 新内容此时不应强行跟随，且出现「回到最新」。
    harness.emit({ type: 'content_delta', delta: '新内容' })
    await settle()
    expect(state.scrollTop).toBe(120)

    const backBtn = findButton(host, '回到最新')
    expect(backBtn).toBeDefined()
    backBtn!.click()
    await settle()
    expect(state.scrollTop).toBe(1000)
    expect(findButton(host, '回到最新')).toBeUndefined()

    unmount(root, host)
  })

  it('切换账号/人设后重置跟随并滚到底部', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮写一篇')
    clickSend(host)
    await settle()
    const el = scroller(host)
    const { state } = mockScroll(el, 1000, 200)
    // 主动上滚超阈值，进入暂停跟随态。
    state.scrollTop = 120
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
    expect(findButton(host, '回到最新')).toBeDefined()

    // 切换人设（same account, 组件不卸载）→ 必须重置跟随并滚到底部。
    root.render(<StudioTab api={harness.api} accountId="a1" personaId="p2" onOpenDraft={() => {}} />)
    await settle()
    expect(findButton(host, '回到最新')).toBeUndefined()
    expect(state.scrollTop).toBe(1000)

    harness.release()
    unmount(root, host)
  })

  it('流式中断（无 done/quality）时禁用保存且点击为 no-op', async () => {
    const harness = makeHarness()
    const { host, root } = await mount(harness.api)
    typeInto(textarea(host), '帮写一篇')
    clickSend(host)
    await settle()
    const finalBody = host.querySelector('[data-testid="studio-final"]')
    expect(finalBody).not.toBeNull()

    // 只收到部分 content_delta，然后中断（无 done / quality）→ 保存按钮必须禁用。
    harness.emit({ type: 'content_delta', delta: '半截最终稿' })
    harness.release()
    await settle()

    expect(host.querySelector('[data-testid="studio-final"]')?.textContent).toContain('半截最终稿')
    const saveBtn = findButton(host, '保存为草稿')
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.disabled).toBe(true)

    // 点击为 no-op：即使触发也不会落库。
    saveBtn!.click()
    await settle()
    expect(harness.saveCount).toBe(0)

    unmount(root, host)
  })
})
