/** 最小 invariant：存储文件必须携带格式版本（防旧格式静默读坏）。 */

import { MATRIX_STORE_VERSION } from './store.ts'

/** 检查存储文件版本契约；返回诊断或 undefined。 */
export function checkMatrixStoreInvariant(version: number): string | undefined {
  if (version !== MATRIX_STORE_VERSION) {
    return `存储版本不匹配：期望 ${MATRIX_STORE_VERSION}，实际 ${version}`
  }
  return undefined
}
