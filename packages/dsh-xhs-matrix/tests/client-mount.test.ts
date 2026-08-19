// @vitest-environment jsdom
// 注：brief 冒烟测试手动从 JSDOM 实例赋值 document/MutationObserver，
// 但 sidebar-entry.ts 的 family 过滤使用 `el instanceof HTMLElement`，
// node 环境缺少 HTMLElement 全局，故本文件 environment 置为 jsdom。

import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'
import { PanelController } from '../src/client/controller.ts'
import { mountSidebarEntry } from '../src/client/sidebar-entry.ts'

describe('mountSidebarEntry', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('在 New Session 按钮后插入入口行', () => {
    const dom = new JSDOM('<!doctype html><html><body><div data-pane="sidebar"><div><div class="logoRow"><button class="newSession">New Session</button></div></div></div></body></html>')
    globalThis.document = dom.window.document as unknown as Document
    globalThis.MutationObserver = dom.window.MutationObserver as unknown as typeof MutationObserver

    const controller = new PanelController()
    const dispose = mountSidebarEntry(controller)
    const entry = document.querySelector('[data-dsh-xhsmatrix-entry]')
    expect(entry).not.toBeNull()
    expect(entry?.textContent).toContain('矩阵')
    dispose()
    expect(document.querySelector('[data-dsh-xhsmatrix-entry]')).toBeNull()
  })
})
