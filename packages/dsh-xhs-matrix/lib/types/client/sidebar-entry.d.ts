/** 侧边栏入口注入：DOM 级扩展（shell 无可注册槽位），self-heal 于 React 重渲染。 */
import type { PanelController } from './controller.ts';
/** 入口行标识。 */
export declare const ENTRY_SELECTOR = "[data-dsh-xhsmatrix-entry]";
/**
 * 挂载侧边栏入口，等待 shell 渲染并自愈。
 * @param controller - 面板控制器。
 * @returns disposer。
 */
export declare function mountSidebarEntry(controller: PanelController): () => void;
