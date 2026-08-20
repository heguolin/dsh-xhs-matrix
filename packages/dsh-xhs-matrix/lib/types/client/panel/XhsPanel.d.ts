import type { XhsApi } from '../api.ts';
import type { PanelController } from '../controller.ts';
export type PageId = 'overview' | 'knowledge' | 'topics' | 'studio' | 'drafts' | 'personas';
interface AccountRow {
    id: string;
    name: string;
    personaId: string;
    enabled: boolean;
    connection?: {
        status: string;
    };
    collectionStatus?: {
        running: boolean;
        lastStatus: string;
    };
}
/** 根据连接与采集状态计算左侧状态点（绿/橙/红/灰）。 */
export declare function accountDot(account: AccountRow): 'ok' | 'warn' | 'error' | 'idle';
export interface XhsPanelProps {
    controller: PanelController;
    api: XhsApi;
}
/**
 * 矩阵工作台（依据设计稿 content/hybrid-layout.html 的混合布局）：
 * 左侧导航承载账号切换与运营/创作/设置模块，右侧为当前页面工作区。
 */
export declare function XhsPanel(props: XhsPanelProps): import("react").JSX.Element;
export {};
