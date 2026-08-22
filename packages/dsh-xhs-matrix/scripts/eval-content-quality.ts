/**
 * pnpm eval:quality — 用真实模型跑固定评估集，验证「去 AI 味」+ 人设违禁词质量门。
 * 无模型凭证（XHS_EVAL_API_KEY / XHS_EVAL_MODEL）时退出非零，绝不伪装通过。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Persona } from '../src/types.ts'
import type { StudioCompleteRequest, StudioLlmClient } from '../src/studio.ts'
import { createQualityService } from '../src/content-quality.ts'

/** 评估样例形状（与 fixtures/content-quality-eval.json 对齐）。 */
interface EvalSample {
  id: string
  rawDraft: string
  requiredFacts: string[]
  forbiddenFacts: string[]
  persona: Persona
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, '..', 'tests', 'fixtures', 'content-quality-eval.json')
const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as { samples: EvalSample[] }
const samples = parsed.samples

// ——— 凭证：缺失即退出非零，不伪装通过 ———
const baseUrl = (process.env.XHS_EVAL_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
const apiKey = process.env.XHS_EVAL_API_KEY ?? ''
const model = process.env.XHS_EVAL_MODEL ?? ''
if (apiKey === '' || model === '') {
  console.error('[eval:quality] 缺少模型凭证：请设置 XHS_EVAL_API_KEY 与 XHS_EVAL_MODEL（可选 XHS_EVAL_BASE_URL）后再运行真实模型评估。')
  process.exit(1)
}

/** OpenAI 兼容 chat/completions 端点。 */
function chatEndpoint(): string { return baseUrl + '/chat/completions' }

/** 组装 OpenAI 消息（system 优先作为 system 角色）。 */
function toMessages(request: StudioCompleteRequest): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = []
  if (request.system !== undefined && request.system !== '') messages.push({ role: 'system', content: request.system })
  for (const m of request.messages) messages.push({ role: m.role, content: m.content })
  return messages
}

async function postChat(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
  const res = await fetch(chatEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, text }
}

/** 真实模型客户端（stream/complete 均走真实 API）。 */
const client: StudioLlmClient = {
  async complete(request) {
    const { status, text } = await postChat({ model, messages: toMessages(request), max_tokens: request.maxTokens ?? 2000 })
    if (status !== 200) throw new Error('模型调用失败 status ' + status + ': ' + text.slice(0, 200))
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
    return { text: data.choices?.[0]?.message?.content ?? '' }
  },
  async stream(request, onDelta) {
    const { status, text } = await postChat({ model, messages: toMessages(request), max_tokens: request.maxTokens ?? 2000, stream: true })
    if (status !== 200) throw new Error('模型调用失败 status ' + status + ': ' + text.slice(0, 200))
    const out: string[] = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '' || !trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') break
      try {
        const data = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = data.choices?.[0]?.delta?.content ?? ''
        if (typeof delta === 'string' && delta !== '') { onDelta(delta); out.push(delta) }
      } catch { /* 忽略无法解析的行 */ }
    }
    return out.join('')
  },
}

// ——— 质量门判定 ———
const forbiddenMarkers = ['作为 AI', '我是人工智能', '系统提示词', '写作风格', '违禁词']
const forceFollowMarkers = ['记得关注', '点赞关注', '求关注', '关注我', '点个赞']

const quality = createQualityService(client)
const failures: string[] = []

for (const sample of samples) {
  const issues: string[] = []
  let text = ''
  try {
    text = await quality.naturalizeStream(sample.rawDraft, sample.persona, () => {})
  } catch (err) {
    issues.push('模型调用失败：' + (err instanceof Error ? err.message : String(err)))
  }
  if (issues.length === 0) {
    const { report, allowed } = quality.check(text, sample.persona)
    for (const fact of sample.requiredFacts) if (!text.includes(fact)) issues.push('缺失必需事实：' + fact)
    for (const fact of sample.forbiddenFacts) if (text.includes(fact)) issues.push('新增禁止事实：' + fact)
    if (!allowed || report.forbiddenWordHits.length > 0) issues.push('违禁词命中：' + JSON.stringify(report.forbiddenWordHits))
    for (const marker of forbiddenMarkers) if (text.includes(marker)) issues.push('输出包含提示词回显/自述：' + marker)
    for (const marker of forceFollowMarkers) if (text.includes(marker)) issues.push('结尾强制互动：' + marker)
  }
  if (issues.length > 0) {
    failures.push('样例 ' + sample.id + ': ' + issues.join('；'))
    console.error('✗ ' + sample.id + ': ' + issues.join('；'))
  } else {
    console.log('✓ ' + sample.id)
  }
}

if (failures.length > 0) {
  console.error('\n[eval:quality] ' + failures.length + '/' + samples.length + ' 个样例未通过质量门：')
  for (const f of failures) console.error(f)
  process.exit(1)
}
console.log('\n[eval:quality] ' + samples.length + '/' + samples.length + ' 个样例全部通过。')
