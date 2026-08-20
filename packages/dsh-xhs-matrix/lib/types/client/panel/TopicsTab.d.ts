import type { XhsApi } from '../api.ts';
/**
 * 趋势选题（设计稿 content/detail-surfaces.html）：
 * 左栏 Apify 趋势候选（推荐分 + 可解释匹配理由），右栏账号选题标准；
 * 下部保留选题池管理（手动添加 / 批量导入 / 状态过滤）。
 */
export declare function TopicsTab({ api, accountId }: {
    api: XhsApi;
    accountId: string;
}): import("react").JSX.Element;
