/** 路由族共享工具：JSON 响应、请求体解析、查询参数、围栏与方法检查。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackRequest } from '../loopback.ts'

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

/** 把错误渲染为 400 响应。 */
export function fail(res: ServerResponse, error: unknown): void {
  writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
}
