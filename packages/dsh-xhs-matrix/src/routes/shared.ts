/** 路由族共享工具：JSON 响应、请求体解析、查询参数、围栏与方法检查。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackRequest } from '../loopback.ts'
import type { MatrixStore } from '../store.ts'

/** JSON 请求体上限。 */
const MAX_JSON_BODY_BYTES = 256 * 1024

/** 写 JSON 响应。 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

/** 读取 JSON 请求体；非法 JSON 或超限返回 undefined。 */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  // 无请求体（如 DELETE）视为空对象：交给各方法分支校验，而不是误报 invalid JSON body。
  if (text === '') return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** 读取查询参数；缺失返回 undefined。 */
export function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** 围栏 + 方法检查。 */
export function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (req.method !== method) {
    writeJson(res, 405, { error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

/** 带状态码的路由错误：供错误映射按 400/404/409 精确渲染。 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** 把错误渲染为对应状态响应：HttpError 用自身状态码，其余按参数错误 400。 */
export function fail(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    writeJson(res, error.status, { error: error.message })
    return
  }
  writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
}

/**
 * 解析人设作用域：兼容期按 accountId 反查账号当前人设，或直接用 personaId。
 * - account 与 persona 同时传入且不一致：返回 409，绝不静默选择其一。
 * - 显式 personaId 或 accountId 指向不存在的资源：返回 404。
 * - 什么都不传：返回 400。
 * 仅按 account 解析时，返回账号当前 personaId（可为空字符串，由调用方决定空人设语义）。
 */
export function resolvePersonaScope(store: MatrixStore, accountId?: string, personaId?: string): string {
  const hasAccount = accountId !== undefined && accountId !== ''
  const hasPersona = personaId !== undefined && personaId !== ''
  if (!hasAccount && !hasPersona) throw new HttpError(400, 'account 或 persona 查询参数必填')

  let accountPersona: string | undefined
  if (hasAccount) {
    const account = store.listAccounts().find(item => item.id === accountId)
    if (account === undefined) throw new HttpError(404, '账号不存在：' + accountId)
    accountPersona = account.personaId
  }
  if (hasPersona) {
    if (!store.listPersonas().some(item => item.id === personaId)) {
      throw new HttpError(404, '人设不存在：' + personaId)
    }
    if (hasAccount && accountPersona !== personaId) {
      throw new HttpError(409, 'account 与 persona 不一致：账号属于人设 ' + (accountPersona === '' ? '（未分配）' : accountPersona) + '，而非 ' + personaId)
    }
    return personaId as string
  }
  return accountPersona ?? ''
}
