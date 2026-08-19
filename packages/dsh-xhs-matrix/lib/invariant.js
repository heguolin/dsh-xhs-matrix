//#region src/invariant.ts
/** 最小 invariant：存储文件必须携带格式版本（防旧格式静默读坏）。 */
/** 检查存储文件版本契约；返回诊断或 undefined。 */
function checkMatrixStoreInvariant(version) {
	if (version !== 1) return `存储版本不匹配：期望 1，实际 ${version}`;
}
//#endregion
export { checkMatrixStoreInvariant };
