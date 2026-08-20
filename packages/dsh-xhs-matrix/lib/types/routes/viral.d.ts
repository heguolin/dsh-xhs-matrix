/** /viral 爆款池路由：列表、采集入库、审核。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { ViralProvider } from '../collector/provider.ts';
import type { MatrixStore } from '../store.ts';
/**
 * 构建 /viral 爆款池路由。
 * @param store - 矩阵存储。
 * @param provider - 爆款数据源；未配置时采集请求返回 400。
 * @returns 路由数组。
 */
export declare function makeViralRoutes(store: MatrixStore, provider?: ViralProvider): WebRoute[];
