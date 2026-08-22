import type { XhsApi } from '../api.ts';
import type { PanelController } from '../controller.ts';
export type PageId = 'overview' | 'knowledge' | 'viral' | 'studio' | 'drafts' | 'personas';
/** 账号行（与 api.listAccounts 返回结构一致，供侧栏/总览/弹窗共用）。 */
export type AccountRow = Awaited<ReturnType<XhsApi['listAccounts']>>[number];
/** 根据连接与采集状态计算左侧状态点（绿/橙/红/灰）。 */
export declare function accountDot(account: {
    connection?: {
        status: string;
    };
    collectionStatus?: {
        running: boolean;
        lastStatus: string;
    };
}): 'ok' | 'warn' | 'error' | 'idle';
export interface XhsPanelProps {
    controller: PanelController;
    api: XhsApi;
}
/**
 * 矩阵工作台：左侧导航承载账号切换与运营/创作/设置模块，右侧为当前账号的独立工作区。
 *
 * v4：人设成为内容资产主体。XhsPanel 统一保存「资产人设作用域」assetPersonaId：
 * 默认跟随当前账号人设，知识库/爆款池允许临时切换，再次选择账号时重新跟随其
 * 人设。asset methods 以该作用域为主参数，不再把账号 id 当作人设发送。
 */
export declare function XhsPanel(props: XhsPanelProps): import("react").JSX.Element;
