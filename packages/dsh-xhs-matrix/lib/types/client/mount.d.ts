/** 面板视图挂载：中栏接管为独立 React root，data 属性控制显隐。 */
import type { XhsApi } from './api.ts';
import { type PanelController } from './controller.ts';
/**
 * 挂载面板 React 树到中栏并绑定显隐。
 * @param controller - 面板控制器。
 * @param api - 数据通道。
 * @returns disposer。
 */
export declare function mountPanel(controller: PanelController, api: XhsApi): () => void;
