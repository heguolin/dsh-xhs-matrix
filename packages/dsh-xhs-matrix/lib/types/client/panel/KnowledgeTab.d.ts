import type { XhsApi } from '../api.ts';
/**
 * 已发布知识库（设计稿 content/detail-surfaces.html）：
 * 筛选 chips + 笔记行（缩略图/指标/0-5 权重），权重即控制杆。
 */
export declare function KnowledgeTab({ api, accountId }: {
    api: XhsApi;
    accountId: string;
}): import("react").JSX.Element;
