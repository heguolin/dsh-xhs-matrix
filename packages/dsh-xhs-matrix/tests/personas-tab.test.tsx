// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { PersonasTab } from '../src/client/panel/PersonasTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

/** 人设 Tab 交互回归：新建人设表单可输入，点「保存设置」调用 createPersona。 */
describe('PersonasTab 新建人设', () => {
  it('新建人设：输入名称/提示词/定位并提交', async () => {
    const created: Array<{ name: string; prompt: string; positioning?: string }> = []
    const api = {
      listPersonas: async () => [],
      createPersona: async (payload: { name: string; prompt: string; positioning?: string }) => {
        created.push(payload)
        return { id: 'p1' }
      },
      updatePersona: async () => {},
      deletePersona: async () => {},
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(<PersonasTab api={api} />)
    await new Promise(resolve => setTimeout(resolve, 0))

    // 点击「＋ 新建人设」展开表单
    const createBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('新建人设'))
    expect(createBtn).not.toBeUndefined()
    createBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    const inputs = host.querySelectorAll<HTMLInputElement>('input')
    const textareas = host.querySelectorAll<HTMLTextAreaElement>('textarea')
    expect(inputs.length).toBeGreaterThan(0)
    expect(textareas.length).toBeGreaterThan(0)

    // React 受控输入：用原生 setter + input 事件模拟真实键入。
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    const nameInput = inputs[0]
    setInput.call(nameInput, '干货风')
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }))
    const promptArea = textareas[0]
    setArea.call(promptArea, '专业、数据支撑、不废话')
    promptArea!.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise(resolve => setTimeout(resolve, 0))

    const saveBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '保存设置')
    expect(saveBtn).not.toBeUndefined()
    saveBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(created.length).toBe(1)
    expect(created[0].name).toBe('干货风')
    expect(created[0].prompt).toBe('专业、数据支撑、不废话')

    root.unmount()
    host.remove()
  })
})
