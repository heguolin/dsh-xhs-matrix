/** 最小 invariant：存储文件必须携带格式版本（防旧格式静默读坏）。 */
/** 检查存储文件版本契约；返回诊断或 undefined。 */
export declare function checkMatrixStoreInvariant(version: number): string | undefined;
