// @vitest-environment jsdom
// ImportDialog (v4)：知识库导入的人设资产视图。
// - 导入目标为当前人设作用域：只读展示「归属人设」为当前选中人设名。
// - 标题与正文必须按行一一对应，缺正文时前端拦截。
import { describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { ImportDialog } from '../src/client/panel/ImportDialog.tsx'
import type { XhsApi } from '../src/client/api.ts'

/** 通过原生 value setter 触发受控 textarea 的 change（模拟用户输入）。 */
function typeText(host: HTMLElement, label: string, value: string): void {
  const labelNode = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.includes(label))
  expect(labelNode).not.toBeUndefined()
  const area = labelNode!.parentElement!.querySelector('textarea') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter!.call(area, value)
  area.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 渲染 ImportDialog，返回宿主节点与 api mock。 */
async function renderDialog(personaId = 'p1') {
  const apiMock = {
    listPersonas: vi.fn(async () => [{ id: 'p1', name: '人设一' }]),
    importPublishedNotes: vi.fn(async () => 2),
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(<ImportDialog api={apiMock as unknown as XhsApi} accountId="acc-a" personaId={personaId} onDone={() => {}} />)
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  return { host, root, apiMock }
}

/** 导入弹窗交互（v4）：导入目标为当前人设作用域，标题与正文按行一一对应。 */
describe('ImportDialog 导入', () => {
  it('导入目标为当前人设作用域（只读展示人设名，不当作账号裸传）', async () => {
    const { host, root, apiMock } = await renderDialog('p1')

    const personaInput = Array.from(host.querySelectorAll('input'))
      .find(input => input.readOnly)
    expect(personaInput).not.toBeUndefined()
    expect(personaInput!.value).toBe('人设一')
    expect(apiMock.listPersonas).toHaveBeenCalled()

    root.unmount()
    host.remove()
  })

  it('只填标题不填正文时前端拦截并提示具体行号，不调用 importPublishedNotes', async () => {
    const { host, root, apiMock } = await renderDialog()

    typeText(host, '标题', '标题一\n标题二')
    const run = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('导入'))
    expect(run).not.toBeUndefined()
    run!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(host.textContent).toContain('第 1 行')
    expect(host.textContent).toContain('缺少正文')
    expect(apiMock.importPublishedNotes).not.toHaveBeenCalled()

    root.unmount()
    host.remove()
  })

  it('标题与正文按行对应填写后调用 importPublishedNotes 并提交 JSON 数组', async () => {
    const { host, root, apiMock } = await renderDialog()

    typeText(host, '标题', '标题一\n标题二')
    typeText(host, '正文', '正文一\n正文二')
    const run = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('导入'))
    run!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(apiMock.importPublishedNotes).toHaveBeenCalledTimes(1)
    expect(apiMock.importPublishedNotes).toHaveBeenCalledWith(
      'acc-a',
      'json',
      JSON.stringify([{ title: '标题一', copy: '正文一' }, { title: '标题二', copy: '正文二' }]),
    )
    expect(host.textContent).toContain('已导入 2 条')

    root.unmount()
    host.remove()
  })

  it('正文行数少于标题行数时按原始行号拦截（第 2 行缺少正文）', async () => {
    const { host, root, apiMock } = await renderDialog()

    typeText(host, '标题', '标题一\n标题二')
    typeText(host, '正文', '正文一')
    const run = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('导入'))
    run!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(host.textContent).toContain('第 2 行缺少正文')
    expect(apiMock.importPublishedNotes).not.toHaveBeenCalled()

    root.unmount()
    host.remove()
  })
})