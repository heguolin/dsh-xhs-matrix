/**
 * 内容质量服务：两阶段创作的第二阶段「去 AI 味」流式审校、确定性违禁词扫描与质量门。
 *
 * 语义：审校只改写表达，不得新增事实或伪造经历；最终稿由程序逐词扫描人设违禁词；
 * 命中则禁止保存草稿，未命中才放行。参考素材命中只警告，一切以人设违禁词为唯一来源。
 */
import type { Persona, DraftQualityReport as QualityReport } from './types.ts';
import type { StudioCompleteRequest, StudioLlmClient } from './studio.ts';
/** 内容质量服务接口。 */
export interface ContentQualityService {
    /**
     * 流式去 AI 味审校：直接驱动 StudioLlmClient.stream（严禁先 complete 全文再伪造分块），
     * onDelta 收到审校后的文本增量，返回完整最终稿文本。
     */
    naturalizeStream(rawDraft: string, persona: Persona, onDelta: (delta: string) => void): Promise<string>;
    /** 质量门：扫描人设违禁词，返回质量报告与是否允许保存草稿。 */
    check(text: string, persona: Persona): {
        report: QualityReport;
        allowed: boolean;
    };
}
/** 组装「去 AI 味」审校请求（系统提示词 + 原始初稿）。 */
export declare function buildNaturalizePrompt(rawDraft: string, persona: Persona): StudioCompleteRequest;
/**
 * 拆分 v3 旧字段 forbiddenExpressions（逗号/中文逗号/顿号/空白分隔）为违禁词数组；
 * 空串或仅分隔符时返回 undefined。
 */
export declare function splitLegacyForbidden(value: string | undefined): string[] | undefined;
/**
 * 确定性逐词扫描：对人设违禁词逐词查找所有出现，返回命中词与字符位置（按位置升序）。
 * 违禁词是唯一来源（不建立全局违禁词库）；空词忽略。
 */
export declare function scanForbiddenWords(text: string, forbiddenWords: string[]): Array<{
    word: string;
    position: number;
}>;
/** 工厂：用注入的模型客户端构建内容质量服务。 */
export declare function createQualityService(llm: StudioLlmClient): ContentQualityService;
