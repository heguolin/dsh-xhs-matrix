/** 已发布笔记 CSV/JSON 导入解析与批量应用。 */
import { MatrixStore, type PublishedNotePayload } from './store.ts';
/** 导入记录：解析出的笔记内容字段（不含人设归属与来源账号信息）。 */
export type ImportRecord = Omit<PublishedNotePayload, 'personaId' | 'sourceAccountId' | 'sourceAccountName'>;
/** 解析一批已发布笔记；不写入存储。 */
export declare function parsePublishedNoteImport(input: string, format: 'csv' | 'json'): ImportRecord[];
/** 校验并原子应用一批笔记：以账号当前人设作为知识库归属。 */
export declare function applyPublishedNoteImport(store: MatrixStore, accountId: string, records: ImportRecord[]): void;
