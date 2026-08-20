import type { XhsApi } from '../api.ts';
import type { PanelController } from '../controller.ts';
export type TabId = 'overview' | 'accounts' | 'personas' | 'knowledge' | 'topics' | 'drafts' | 'studio';
export interface XhsPanelProps {
    controller: PanelController;
    api: XhsApi;
}
/** 混合布局面板容器：运营总览 + 账号管理 + 知识库 + 创作台。 */
export declare function XhsPanel(props: XhsPanelProps): import("react").JSX.Element;
