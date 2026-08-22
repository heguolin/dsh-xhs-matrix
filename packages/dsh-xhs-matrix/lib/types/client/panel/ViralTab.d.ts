import type { XhsApi } from '../api.ts';
/**
 * 爆款池（v3 取代趋势选题页）：
 * 顶部为状态筛选与「采集爆款」「配置 Apify」操作；列表按账号展示爆款条目，
 * 待审核条目可「采纳 / 忽略」，采集与审核后自动刷新。
 */
export declare function ViralTab({ api, accountId, personaId, onPersonaChange }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onPersonaChange: (id: string) => void;
}): import("react").JSX.Element;
