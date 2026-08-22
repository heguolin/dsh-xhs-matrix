/**
 * 人设资产服务：路由与工具操作人设资产（知识库、爆款池、批次、权重、显式转移与待归属）的唯一入口。
 * 所有公开方法以 personaId 为主键，集中执行人设存在性与内容归属校验。
 *
 * 语义：人设是可复用内容资产的所有者；账号是发布与采集的运营载体。
 * 多个账号绑定同一人设时共享知识库、知识库权重、爆款池、爆款权重。
 */
import { MatrixStore, type PublishedNotePayload } from './store.ts';
import type { Persona, PendingOwnership, PublishedNote, ViralBatch, ViralItem, ViralStatus } from './types.ts';
import type { ManualViralPayload } from './store.ts';
/** 知识库导入内容载荷（不含 personaId / 来源账号）；来源账号由服务参数一并落库。 */
export type PersonaNoteImportInput = Omit<PublishedNotePayload, 'personaId' | 'sourceAccountId' | 'sourceAccountName'>;
/** 人设使用情况汇总。 */
export interface PersonaUsage {
    accountCount: number;
    noteCount: number;
    viralCount: number;
}
/** 人设资产服务：单一写入/查询入口。 */
export declare class PersonaAssetService {
    private readonly store;
    constructor(store: MatrixStore);
    /** 读取人设；不存在则抛错。 */
    getPersona(personaId: string): Persona;
    /** 人设下已发布笔记知识库（共享集合）。 */
    listNotes(personaId: string): PublishedNote[];
    /**
     * 导入一批笔记到指定人设。
     * @param personaId - 目标人设（显式归属，不依赖账号当前人设）。
     * @param sourceAccountId - 可选来源账号（追踪与指标采集）。
     * @param sourceAccountName - 可选来源账号名快照。
     */
    importNotes(personaId: string, payloads: PersonaNoteImportInput[], sourceAccountId?: string, sourceAccountName?: string): PublishedNote[];
    /** 调整笔记人工权重（0-5）。 */
    setNoteWeight(personaId: string, noteId: string, weight: number): PublishedNote;
    /** 显式把若干笔记转移到目标人设。 */
    transferNotes(personaId: string, noteIds: string[], targetPersonaId: string): PublishedNote[];
    /** 查询人设爆款池条目。 */
    listVirals(personaId: string, status?: ViralStatus, batchId?: string): ViralItem[];
    /** 查询人设爆款批次。 */
    listBatches(personaId: string, sourceAccountId?: string): ViralBatch[];
    /** 手动新增爆款：默认 accepted + weight 5。 */
    addManualViral(personaId: string, payload: ManualViralPayload): ViralItem;
    /** 审核爆款条目。 */
    reviewViral(personaId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem;
    /** 调整爆款人工权重（0-5）。 */
    setViralWeight(personaId: string, itemId: string, weight: number): ViralItem;
    /** 整批删除爆款条目；返回删除数量。 */
    deleteBatch(personaId: string, batchId: string): number;
    /** 显式把若干爆款条目转移到目标人设。 */
    transferVirals(personaId: string, itemIds: string[], targetPersonaId: string): ViralItem[];
    /** 待归属记录列表。 */
    listPending(): PendingOwnership[];
    /** 把一条待归属记录原子地归属到目标人设。 */
    assignPending(id: string, targetPersonaId: string): PublishedNote | ViralItem;
    /** 人设使用情况（绑定账号、知识库与爆款数量）。 */
    personaInUse(personaId: string): PersonaUsage;
}
