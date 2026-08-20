/** /notes 与 /metrics 路由：已发布笔记知识库（权重）与指标快照、按账号采集。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { CollectionScheduler } from '../metrics.ts';
import { MatrixStore } from '../store.ts';
/** 构建知识库与指标路由。
 * @param store - 矩阵存储。
 * @param scheduler - 指标采集调度器（未配置时 collect 返回 400）。
 * @returns 路由数组。
 */
export declare function makeKnowledgeRoutes(store: MatrixStore, scheduler?: CollectionScheduler): WebRoute[];
