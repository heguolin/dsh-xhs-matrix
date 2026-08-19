import type { XhsApi } from '../api.ts';
import type { PanelController } from '../controller.ts';
export type TabId = 'accounts' | 'personas' | 'topics' | 'negatives' | 'drafts';
export interface XhsPanelProps {
    controller: PanelController;
    api: XhsApi;
}
/** 五 Tab 配置面板容器。 */
export declare function XhsPanel(props: XhsPanelProps): import("react").JSX.Element;
