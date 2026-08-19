/** 面板开合状态 + 跨插件中栏互斥（与 dsh-task-board / dsh-ssh 共享激活协议）。 */
/** 跨插件激活事件名。 */
export declare const ACTIVATE_EVENT = "dsh-panel-activate";
/** 本面板名。 */
export declare const PANEL_NAME = "xhsmatrix";
/** 本面板激活属性。 */
export declare const ACTIVE_ATTR = "data-dsh-xhsmatrix-active";
/** 需驱逐的兄弟面板激活属性。 */
export declare const OTHER_ACTIVE_ATTRS: string[];
/** 面板状态快照。 */
export interface PanelSnapshot {
    panelOpen: boolean;
}
/** 面板控制器。 */
export declare class PanelController {
    private open;
    private readonly listeners;
    getSnapshot(): PanelSnapshot;
    toggle(): void;
    openPanel(): void;
    close(): void;
    /** 订阅状态变化；返回退订函数。 */
    subscribe(listener: () => void): () => void;
    private notify;
}
