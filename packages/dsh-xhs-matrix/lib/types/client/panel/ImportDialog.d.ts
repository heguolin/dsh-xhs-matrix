import type { XhsApi } from '../api.ts';
/** 后台数据导入：CSV / JSON 粘贴导入当前账号已发布笔记。 */
export declare function ImportDialog({ api, accountId, onDone }: {
    api: XhsApi;
    accountId: string;
    onDone: () => void;
}): import("react").JSX.Element;
