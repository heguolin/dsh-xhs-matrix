/** 面板开合状态 + 跨插件中栏互斥（与 dsh-task-board / dsh-ssh 共享激活协议）。 */

/** 跨插件激活事件名。 */
export const ACTIVATE_EVENT = 'dsh-panel-activate'
/** 本面板名。 */
export const PANEL_NAME = 'xhsmatrix'
/** 本面板激活属性。 */
export const ACTIVE_ATTR = 'data-dsh-xhsmatrix-active'
/** 需驱逐的兄弟面板激活属性。 */
export const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']

/** 面板状态快照。 */
export interface PanelSnapshot {
  panelOpen: boolean
}

/** 面板控制器。 */
export class PanelController {
  private open = false
  private readonly listeners = new Set<() => void>()

  getSnapshot(): PanelSnapshot {
    return { panelOpen: this.open }
  }

  toggle(): void {
    if (this.open) this.close()
    else this.openPanel()
  }

  openPanel(): void {
    if (this.open) return
    this.open = true
    this.notify()
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.notify()
  }

  /** 订阅状态变化；返回退订函数。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
