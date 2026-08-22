/** 已发布笔记 CSV/JSON 导入解析与批量应用。 */

import { MatrixStore, type PublishedNotePayload } from './store.ts'
import type { DataSource, NoteWeight } from './types.ts'

/** 导入记录：解析出的笔记内容字段（不含人设归属与来源账号信息）。 */
export type ImportRecord = Omit<PublishedNotePayload, 'personaId' | 'sourceAccountId' | 'sourceAccountName'>

// 导入简化：标题 + 正文必填，发布日期缺省用当天（人工导入不要求精确日期）。
const REQUIRED = ['title', 'copy'] as const

function validateRecord(value: unknown, index: number): ImportRecord {
  if (typeof value !== 'object' || value === null) throw new Error('第 ' + (index + 1) + ' 条记录必须是对象')
  const record = value as Record<string, unknown>
  for (const field of REQUIRED) {
    if (typeof record[field] !== 'string' || record[field].trim() === '') throw new Error('第 ' + (index + 1) + ' 条记录 ' + field + ' 必填')
  }
  const publishedAt = record.publishedAt === undefined
    ? new Date().toISOString().slice(0, 10)
    : record.publishedAt as string
  if (Number.isNaN(Date.parse(publishedAt))) throw new Error('第 ' + (index + 1) + ' 条记录 publishedAt 无效')
  const weight = record.weight === undefined ? 0 : Number(record.weight)
  if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new Error('第 ' + (index + 1) + ' 条记录 weight 必须是 0-5 的整数')
  return {
    title: record.title as string,
    copy: record.copy as string,
    topic: typeof record.topic === 'string' ? record.topic : undefined,
    contentType: typeof record.contentType === 'string' ? record.contentType : undefined,
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : undefined,
    publishedAt,
    source: 'import' as DataSource,
    weight: weight as NoteWeight,
  }
}

function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1 } else quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field.trim()); field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field.trim()); field = ''
      if (row.some(value => value !== '')) rows.push(row)
      row = []
    } else {
      field += character
    }
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  if (field !== '' || row.length > 0) { row.push(field.trim()); if (row.some(value => value !== '')) rows.push(row) }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

/** 解析一批已发布笔记；不写入存储。 */
export function parsePublishedNoteImport(input: string, format: 'csv' | 'json'): ImportRecord[] {
  let records: unknown[]
  if (format === 'json') {
    const parsed: unknown = JSON.parse(input)
    if (!Array.isArray(parsed)) throw new Error('JSON 导入内容必须是数组')
    records = parsed
  } else {
    records = parseCsv(input)
  }
  return records.map((record, index) => validateRecord(record, index))
}

/** 校验并原子应用一批笔记：显式接收目标 personaId（不依赖账号当前人设），并可保留来源账号。 */
export function applyPublishedNoteImport(store: MatrixStore, personaId: string, records: ImportRecord[], sourceAccountId?: string, sourceAccountName?: string): void {
  const prepared = records.map(record => ({
    ...record,
    personaId,
    sourceAccountId,
    sourceAccountName: sourceAccountName ?? (sourceAccountId !== undefined ? store.listAccounts().find(a => a.id === sourceAccountId)?.name : undefined),
  }))
  store.importPublishedNotes(personaId, prepared)
}