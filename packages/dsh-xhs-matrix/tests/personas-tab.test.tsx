// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { PersonasTab } from '../src/client/panel/PersonasTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

/** 人设 Tab 交互回归：三个输入字段必须可输入，点「添加人设」调用 createPersona。 */
describe('PersonasTab 输入', () => {
  it('人设名/提示词/口癖均可输入并提交', async () => {
    const created: Array<{ name: string; prompt: string; toneTags?: string[] }> = []
    const api = {
      listPersonas: async () => [],
      createPersona: async (payload: { name: string; prompt: string; toneTags?: string[] }) => {
        created.push(payload)
        return { id: 'p1' }
      },
      deletePersona: async () => {},
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(<PersonasTab api={api} />)
    await new Promise(resolve => setTimeout(resolve, 0))

    const input = host.querySelector<HTMLInputElement>('input')
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')
    expect(input).not.toBeNull()
    expect(textarea).not.toBeNull()

    // React 受控输入：用原生 setter + input 事件模拟真实键入。
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setInput.call(input, '干货风')
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    setArea.call(textarea, '专业、数据支撑、不废话')
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise(resolve => setTimeout(resolve, 0))

    const addBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '添加人设')
    expect(addBtn).not.toBeUndefined()
    addBtn!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(created).toEqual([{ name: '干货风', prompt: '专业、数据支撑、不废话', toneTags: undefined }])

    root.unmount()
    host.remove()
  })
})
