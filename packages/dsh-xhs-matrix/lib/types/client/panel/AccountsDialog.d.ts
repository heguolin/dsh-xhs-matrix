import type { XhsApi } from '../api.ts';
import { type AccountRow } from './XhsPanel.tsx';
/**
 * 账号管理弹窗：列表 + 创建/编辑表单 + 绑定主页 + 笔记导入入口。
 *
 * v4：账号列表单一来源为父级 XhsPanel，本弹窗只接收 accounts 快照；创建成功后
 * 通过 onSaved(createdId) 通知父级「刷新→选中→关闭」，不再维护无法通知侧栏的账号副本。
 */
export declare function AccountsDialog({ api, accounts, onClose, onSaved, onChanged }: {
    api: XhsApi;
    accounts: AccountRow[];
    onClose: () => void;
    onSaved: (createdId: string) => Promise<void> | void;
    onChanged: () => void | Promise<void>;
}): import("react").JSX.Element;
