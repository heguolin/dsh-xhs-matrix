/** 矩阵专属创作会话：账号级上下文组装、两阶段模型调用、结构化 SSE 与消息/草稿保存。 */
import type { ContentQualityService } from './content-quality.ts';
import { MatrixStore } from './store.ts';
import type { Draft, DraftEvidence, DraftQualityReport, StudioMessage } from './types.ts';
/** 一次模型补全请求（矩阵会话内，只含文本消息）。 */
export interface StudioCompleteRequest {
    system: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    maxTokens?: number;
}
/** 模型客户端抽象：注入实现，避免 studio 直接依赖 Host 服务。 */
export interface StudioLlmClient {
    complete(request: StudioCompleteRequest): Promise<{
        text: string;
    }>;
    /** 流式补全：onDelta 收到文本增量，返回完整文本。 */
    stream(request: StudioCompleteRequest, onDelta: (delta: string) => void): Promise<string>;
}
/** 从模型输出中拆分正文与封面提示词；无标记时整段视为正文。 */
export declare function parseCoverPrompt(text: string): {
    copy: string;
    coverPrompt: string;
};
/** 第一阶段原始初稿的标记：标记前为可审计创作计划，标记后为需自然化的原始初稿。 */
export declare const RAW_DRAFT_MARKER = "\u3010\u8349\u7A3F\u3011";
/**
 * 从第一阶段模型输出中拆分「可审计创作计划」与「原始初稿」。
 * 无标记时将整段视为原始初稿（计划为空），用于非流式路径的防御性回退。
 */
export declare function splitPlanDraft(text: string): {
    plan: string;
    rawDraft: string;
};
/** 创作上下文组装结果。 */
export interface StudioContext {
    context: string;
    truncated: boolean;
    warning?: string;
}
/** 只读取当前账号矩阵数据并组装为上下文；绝不复用主工作区内容。 */
export declare function buildStudioContext(store: MatrixStore, accountId: string, mode: 'full' | 'creative', maxInputChars?: number): StudioContext;
/** 结构化 SSE 事件类型（权威定义，见 task-6-brief）。 */
export type StudioSseEvent = {
    type: 'phase';
    phase: 'planning' | 'drafting' | 'polishing' | 'checking';
} | {
    type: 'evidence';
    evidence: DraftEvidence;
} | {
    type: 'plan_delta';
    delta: string;
} | {
    type: 'content_delta';
    delta: string;
} | {
    type: 'quality';
    report: DraftQualityReport;
    allowed: boolean;
} | {
    type: 'done';
    messageId: string;
    coverPrompt: string;
    quality: DraftQualityReport;
    evidence: DraftEvidence;
    personaId: string;
    deduplicated?: boolean;
} | {
    type: 'error';
    stage: string;
    retryable: boolean;
    message: string;
};
/** 流式发送可选参数。 */
export interface StudioStreamOptions {
    /** 请求幂等 id：完成后重试返回 deduplicated，进行中重复抛「请求进行中」。 */
    requestId?: string;
    maxInputChars?: number;
}
/** 流式发送结果：质量通过/重放时含 done；违禁词命中时 done 为 undefined。 */
export interface StudioStreamResult {
    done?: Extract<StudioSseEvent, {
        type: 'done';
    }>;
}
/** 同一请求 id 正在进行中（并发去重）。 */
export declare class StudioBusyError extends Error {
    constructor(message: string);
}
/** 命中人设违禁词，禁止保存草稿。 */
export declare class QualityBlockedError extends Error {
    constructor(message: string);
}
/** 创作会话服务：两阶段生成、结构化流式事件与消息/草稿保存。 */
export declare class StudioService {
    private readonly store;
    private readonly llm;
    private readonly quality;
    private readonly modelLabel;
    /** 进程内仅供进行中请求的去重 key；完成后从集合删除，禁止无界保存历史 requestId。 */
    private readonly inFlight;
    constructor(store: MatrixStore, llm: StudioLlmClient, quality: ContentQualityService, modelLabel?: string);
    /** 指定请求 id 是否正在生成中（供路由在 SSE 建流前返回 409）。 */
    isInFlight(requestId: string): boolean;
    private requireAccount;
    /** 取账号当前（唯一）人设；未分配或已删除时阻止创作。 */
    private requirePersona;
    private buildSystemPrompt;
    private buildMessages;
    /**
     * 阶段一：流式调用模型。只把【草稿】标记前的可审计创作计划作为 plan_delta 转发；
     * 标记后的原始初稿在服务端缓冲（不转发、不写会话），返回给阶段二自然化。
     */
    private streamPhase1;
    /** 计算 text 尾部与标记前缀重叠的最大长度（不含完整标记本身）。 */
    private trailingMarkerPrefixLength;
    private buildEvidence;
    /** 追加用户消息，组装上下文（只读当前人设快照），两阶段生成，质量通过后保存助手消息。 */
    send(accountId: string, input: string, mode: 'full' | 'creative', maxInputChars?: number): Promise<{
        message: StudioMessage;
        evidence: DraftEvidence;
        warning?: string;
    }>;
    /**
     * 流式发送（两阶段）：捕获账号与人设快照 → 构建证据 → 流式计划并缓冲原始初稿 →
     * naturalizeStream 输出最终稿增量 → 确定性违禁词扫描 → 质量通过后一次性落库 user/assistant 与 requestId → done。
     * 历史只读取相同 accountId 且 personaIdSnapshot 等于当前人设的消息。
     */
    sendStream(accountId: string, input: string, mode: 'full' | 'creative', onEvent: (event: StudioSseEvent) => void, options?: StudioStreamOptions): Promise<StudioStreamResult>;
    /** 完成态重放：不重新生成，返回 deduplicated 的 done（封面/质检信息不落库，从现有消息重建）。 */
    private buildDeduplicatedDone;
    /** 保存一条草稿（含人设快照与轻量质检报告）；命中违禁词抛 QualityBlockedError，不落库。 */
    saveDraft(accountId: string, payload: {
        copy: string;
        coverPrompt: string;
        evidence?: DraftEvidence;
    }): Draft;
}
