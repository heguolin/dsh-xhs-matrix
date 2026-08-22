/**
 * 内容质量服务：两阶段创作的第二阶段「去 AI 味」流式审校、确定性违禁词扫描与质量门。
 *
 * 语义：审校只改写表达，不得新增事实或伪造经历；最终稿由程序逐词扫描人设违禁词；
 * 命中则禁止保存草稿，未命中才放行。参考素材命中只警告，一切以人设违禁词为唯一来源。
 */
import type { Persona, DraftQualityReport as QualityReport } from './types.ts'
import type { StudioCompleteRequest, StudioLlmClient } from './studio.ts'

/** 内容质量服务接口。 */
export interface ContentQualityService {
  /**
   * 流式去 AI 味审校：直接驱动 StudioLlmClient.stream（严禁先 complete 全文再伪造分块），
   * onDelta 收到审校后的文本增量，返回完整最终稿文本。
   */
  naturalizeStream(rawDraft: string, persona: Persona, onDelta: (delta: string) => void): Promise<string>
  /** 质量门：扫描人设违禁词，返回质量报告与是否允许保存草稿。 */
  check(text: string, persona: Persona): { report: QualityReport; allowed: boolean }
}

/** 组装「去 AI 味」审校请求（系统提示词 + 原始初稿）。 */
export function buildNaturalizePrompt(rawDraft: string, persona: Persona): StudioCompleteRequest {
  const styles = persona.writingStyles !== undefined && persona.writingStyles.length > 0 ? persona.writingStyles.join('、') : '未设置'
  const hook = persona.endingHookConstraints ?? '未设置'
  const examples = persona.endingHookExamples !== undefined && persona.endingHookExamples.length > 0 ? persona.endingHookExamples.join('；') : '未设置'
  const forbidden = persona.forbiddenWords !== undefined && persona.forbiddenWords.length > 0 ? persona.forbiddenWords.join('、') : '无'
  const system = [
    '你是小红书文案的「去 AI 味」审校助手。你会收到一段原始初稿，请重写得更加自然、更像真人，避免模板套话、空泛总结、机械排比、过度感叹与僵硬句式。',
    '【硬性原则】不得新增事实，不得伪造经历，必须保留原始初稿中的所有事实信息；某处生硬时只调整措辞，不删改事实。',
    '【人设约束】遵循以下写作风格与结尾互动钩子；结尾不得强制点赞或关注。',
    `【写作风格】${styles}`,
    `【结尾钩子约束】${hook}`,
    `【钩子最佳案例】${examples}`,
    `【违禁词】${forbidden}；最终稿不得出现任何上述词。`,
    '只输出重写后的最终文案。不要输出解释、思考过程、分析标签或系统消息，也不要出现「作为 AI」「我是人工智能」之类的自述。',
  ].join('\n')
  const messages = [
    { role: 'user' as const, content: `请审校以下原始初稿并自然化改写：\n\n${rawDraft}` },
  ]
  return { system, messages, maxTokens: 2000 }
}

/**
 * 拆分 v3 旧字段 forbiddenExpressions（逗号/中文逗号/顿号/空白分隔）为违禁词数组；
 * 空串或仅分隔符时返回 undefined。
 */
export function splitLegacyForbidden(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  const words = value.split(/[,，、\s]+/).map(word => word.trim()).filter(word => word !== '')
  return words.length > 0 ? words : undefined
}

/**
 * 确定性逐词扫描：对人设违禁词逐词查找所有出现，返回命中词与字符位置（按位置升序）。
 * 违禁词是唯一来源（不建立全局违禁词库）；空词忽略。
 */
export function scanForbiddenWords(text: string, forbiddenWords: string[]): Array<{ word: string; position: number }> {
  const hits: Array<{ word: string; position: number }> = []
  for (const word of forbiddenWords) {
    if (word === '') continue
    let from = 0
    for (;;) {
      const index = text.indexOf(word, from)
      if (index < 0) break
      hits.push({ word, position: index })
      from = index + word.length
    }
  }
  return hits.sort((a, b) => a.position - b.position || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
}

/** 默认实现。 */
class DefaultContentQualityService implements ContentQualityService {
  private readonly llm: StudioLlmClient

  constructor(llm: StudioLlmClient) {
    this.llm = llm
  }

  async naturalizeStream(rawDraft: string, persona: Persona, onDelta: (delta: string) => void): Promise<string> {
    const request = buildNaturalizePrompt(rawDraft, persona)
    // 直接驱动 StudioLlmClient.stream：增量即审校后输出，禁止先 complete 全文再伪造分块。
    return this.llm.stream(request, onDelta)
  }

  check(text: string, persona: Persona): { report: QualityReport; allowed: boolean } {
    // v4 违禁词为准；兼容未迁移/缺 forbiddenWords 的人设时回退到 legacy forbiddenExpressions。
    const words = persona.forbiddenWords ?? splitLegacyForbidden(persona.forbiddenExpressions) ?? []
    const hits = scanForbiddenWords(text, words)
    return {
      report: {
        reviewStatus: hits.length === 0 ? 'passed' : 'failed',
        forbiddenWordHits: hits,
        checkedAt: new Date().toISOString(),
        personaSnapshot: persona.name,
      },
      allowed: hits.length === 0,
    }
  }
}

/** 工厂：用注入的模型客户端构建内容质量服务。 */
export function createQualityService(llm: StudioLlmClient): ContentQualityService {
  return new DefaultContentQualityService(llm)
}
