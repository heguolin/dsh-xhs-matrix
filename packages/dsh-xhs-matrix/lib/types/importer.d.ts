/** 已发布笔记 CSV/JSON 导入解析与批量应用。 */
import { MatrixStore, type PublishedNotePayload } from './store.ts';
/** 解析一批已发布笔记；不写入存储。 */
export declare function parsePublishedNoteImport(input: string, format: 'csv' | 'json'): Omit<PublishedNotePayload, 'accountId'>[];
/** 校验并原子应用一批当前账号笔记。 */
export declare function applyPublishedNoteImport(store: MatrixStore, accountId: string, records: Omit<PublishedNotePayload, 'accountId'>[]): void;
