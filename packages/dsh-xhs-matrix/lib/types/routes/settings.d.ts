/** /settings/apify 路由：Apify 数据源运行时设置。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from '../store.ts';
/** 构建运行时设置路由。
 * @param store - 矩阵存储。
 * @param reload - Apify 配置更新后重建数据源/调度器/路由的回调。
 * @returns 路由数组。
 */
export declare function makeSettingsRoutes(store: MatrixStore, reload?: () => void): WebRoute[];
