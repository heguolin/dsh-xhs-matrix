import type { XhsApi } from '../api.ts';
/** 后台数据导入简化版：标题（每行一个）+ 正文（与标题行号对应），构造 JSON 数组导入当前账号已发布笔记。 */
export declare function ImportDialog({ api, accountId, onDone }: {
    api: XhsApi;
    accountId: string;
    onDone: () => void;
}): import("react").JSX.Element;
