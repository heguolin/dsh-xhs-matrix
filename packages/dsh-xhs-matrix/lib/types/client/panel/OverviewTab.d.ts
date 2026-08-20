import type { XhsApi } from '../api.ts';
import type { PageId } from './XhsPanel.tsx';
interface AccountRow {
    id: string;
    name: string;
    personaId: string;
    enabled: boolean;
    connection?: {
        profileUrl?: string;
        externalId?: string;
        status: string;
        source?: string;
        lastError?: string;
        lastSuccessAt?: string;
    };
    collectionStatus?: {
        running: boolean;
        lastStatus: string;
        lastSuccessAt?: string;
        lastError?: string;
    };
}
/**
 * 运营总览（设计稿 content/hybrid-layout.html + 设计文档 §8.2）：
 * 矩阵级多账号总览 —— 显示所有账号的状态、指标、知识库表现与草稿摘要；
 * 趋势选题按账号隔离，每个账号卡片显示自己的外部趋势样本数，
 * 具体候选进入该账号的「趋势选题」工作区查看。
 */
export declare function OverviewTab({ api, accounts, onOpenAccount, onOpenStudio, onAccountUpdated }: {
    api: XhsApi;
    accounts: AccountRow[];
    onOpenAccount: (accountId: string, page: PageId) => void;
    onOpenStudio: (accountId: string) => void;
    onAccountUpdated: () => void;
}): import("react").JSX.Element;
export {};
