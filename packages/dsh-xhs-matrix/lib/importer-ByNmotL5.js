//#region src/importer.ts
const REQUIRED = ["title", "copy"];
function validateRecord(value, index) {
	if (typeof value !== "object" || value === null) throw new Error("第 " + (index + 1) + " 条记录必须是对象");
	const record = value;
	for (const field of REQUIRED) if (typeof record[field] !== "string" || record[field].trim() === "") throw new Error("第 " + (index + 1) + " 条记录 " + field + " 必填");
	const publishedAt = record.publishedAt === void 0 ? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) : record.publishedAt;
	if (Number.isNaN(Date.parse(publishedAt))) throw new Error("第 " + (index + 1) + " 条记录 publishedAt 无效");
	const weight = record.weight === void 0 ? 0 : Number(record.weight);
	if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new Error("第 " + (index + 1) + " 条记录 weight 必须是 0-5 的整数");
	return {
		title: record.title,
		copy: record.copy,
		topic: typeof record.topic === "string" ? record.topic : void 0,
		contentType: typeof record.contentType === "string" ? record.contentType : void 0,
		sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : void 0,
		publishedAt,
		source: "import",
		weight
	};
}
function parseCsv(input) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		if (character === "\"") if (quoted && input[index + 1] === "\"") {
			field += "\"";
			index += 1;
		} else quoted = !quoted;
		else if (character === "," && !quoted) {
			row.push(field.trim());
			field = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && input[index + 1] === "\n") index += 1;
			row.push(field.trim());
			field = "";
			if (row.some((value) => value !== "")) rows.push(row);
			row = [];
		} else field += character;
	}
	if (quoted) throw new Error("CSV 引号未闭合");
	if (field !== "" || row.length > 0) {
		row.push(field.trim());
		if (row.some((value) => value !== "")) rows.push(row);
	}
	if (rows.length === 0) return [];
	const headers = rows[0];
	return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
/** 解析一批已发布笔记；不写入存储。 */
function parsePublishedNoteImport(input, format) {
	let records;
	if (format === "json") {
		const parsed = JSON.parse(input);
		if (!Array.isArray(parsed)) throw new Error("JSON 导入内容必须是数组");
		records = parsed;
	} else records = parseCsv(input);
	return records.map((record, index) => validateRecord(record, index));
}
/** 校验并原子应用一批笔记：显式接收目标 personaId（不依赖账号当前人设），并可保留来源账号。 */
function applyPublishedNoteImport(store, personaId, records, sourceAccountId, sourceAccountName) {
	const prepared = records.map((record) => ({
		...record,
		personaId,
		sourceAccountId,
		sourceAccountName: sourceAccountName ?? (sourceAccountId !== void 0 ? store.listAccounts().find((a) => a.id === sourceAccountId)?.name : void 0)
	}));
	store.importPublishedNotes(personaId, prepared);
}
//#endregion
export { applyPublishedNoteImport, parsePublishedNoteImport };
