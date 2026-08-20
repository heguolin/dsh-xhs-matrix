/** 面板视图挂载：中栏接管为独立 React root，data 属性控制显隐。 */

import { createRoot, type Root } from 'react-dom/client'
import type { XhsApi } from './api.ts'
import { ACTIVATE_EVENT, ACTIVE_ATTR, OTHER_ACTIVE_ATTRS, PANEL_NAME, type PanelController } from './controller.ts'
import { XhsPanel } from './panel/XhsPanel.tsx'
import css from './panel/panel.module.css'

const PANEL_VIEW_SELECTOR = '[data-dsh-xhsmatrix-view]'
const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'

function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

/**
 * 挂载面板 React 树到中栏并绑定显隐。
 * @param controller - 面板控制器。
 * @param api - 数据通道。
 * @returns disposer。
 */
export function mountPanel(controller: PanelController, api: XhsApi): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    container = document.createElement('div')
    container.dataset.dshXhsmatrixView = ''
    container.className = css.view
    column.appendChild(container)
    root = createRoot(container)
    root.render(<XhsPanel controller={controller} api={api} />)
  }

  const waitObserver = new MutationObserver(() => { ensure() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyPanelStyle = (): void => {
    // 显隐与左右分栏由内联样式兜底：即使页面残留旧版 CSS 标签（注入去重跳过），
    // 布局与显隐依然由宿主元素自身保证，不依赖任何外部样式表。
    if (container === undefined) return
    const open = controller.getSnapshot().panelOpen
    container.style.setProperty('display', open ? 'grid' : 'none', 'important')
    container.style.setProperty('grid-template-columns', '188px minmax(0, 1fr)', 'important')
    container.style.setProperty('grid-template-rows', 'minmax(0, 1fr)', 'important')
    container.style.setProperty('width', '100%', 'important')
    container.style.setProperty('height', '100%', 'important')
  }

  const applyActive = (): void => {
    if (controller.getSnapshot().panelOpen) {
      for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
    applyPanelStyle()
  }

  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    if (detail !== PANEL_NAME && controller.getSnapshot().panelOpen) controller.close()
  }

  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!controller.getSnapshot().panelOpen) return
    const target = event.target as HTMLElement | null
    if (target === null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
  }

  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = controller.subscribe(applyActive)
  ensure()
  applyActive()

  return () => {
    document.removeEventListener('click', onClickSidebarRow, true)
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
    waitObserver.disconnect()
    unsubscribe()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
