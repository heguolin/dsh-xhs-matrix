/** Loopback 信任围栏：socket 地址、Host 头、浏览器同源标记（复制 dsh-ssh 同款实现）。 */
import type { IncomingMessage } from 'node:http';
/** 请求级信任围栏：loopback socket + loopback Host + 非跨站。 */
export declare function isLoopbackRequest(request: IncomingMessage): boolean;
