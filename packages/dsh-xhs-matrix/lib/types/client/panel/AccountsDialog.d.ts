import type { XhsApi } from '../api.ts';
/**
 * 账号管理弹窗：列表 + 创建/编辑表单 + 绑定主页 + 笔记导入入口。
 * 账号与采集状态用状态点与徽标区分，失败可重试绑定。
 */
export declare function AccountsDialog({ api, onClose, onSaved }: {
    api: XhsApi;
    onClose: () => void;
    onSaved: () => void;
}): import("react").JSX.Element;
