import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
/** 存储文件默认位置。 */
function matrixStorePath() {
	return join(homedir(), ".dsh", "dsh-xhs-matrix.json");
}
/** 存储错误：介质损坏 / version 不匹配 / 校验失败。 */
var MatrixStoreError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "MatrixStoreError";
	}
};
function empty() {
	return {
		version: 1,
		accounts: [],
		personas: [],
		topics: [],
		negatives: [],
		drafts: []
	};
}
function nextId() {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
/**
* 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
* @param filePath - 存储文件路径（测试注入临时路径）。
*/
var MatrixStore = class MatrixStore {
	static validateAccountPayload(payload) {
		const p = payload;
		if (typeof p !== "object" || p === null) return "body 必须是 JSON 对象";
		if (typeof p.name !== "string" || p.name.trim() === "") return "账号名必填";
		if (typeof p.personaId !== "string") return "personaId 必须是字符串";
		if (typeof p.enabled !== "boolean") return "enabled 必须是布尔值";
	}
	static validatePersonaPayload(payload) {
		const p = payload;
		if (typeof p !== "object" || p === null) return "body 必须是 JSON 对象";
		if (typeof p.name !== "string" || p.name.trim() === "") return "人设名必填";
		if (typeof p.prompt !== "string" || p.prompt.trim() === "") return "人设提示词必填";
	}
	static validateNegativePayload(payload) {
		const p = payload;
		if (typeof p !== "object" || p === null) return "body 必须是 JSON 对象";
		if (typeof p.keyword !== "string" || p.keyword.trim() === "") return "黑名单关键词必填";
		if (typeof p.reason !== "string" || p.reason.trim() === "") return "黑名单原因必填";
		if (p.accountId !== void 0 && typeof p.accountId !== "string") return "accountId 必须是字符串";
	}
	filePath;
	data;
	constructor(filePath = matrixStorePath()) {
		this.filePath = resolve(filePath);
		this.data = empty();
		if (existsSync(this.filePath)) this.load();
	}
	/** 读取并校验存储文件；缺失则返回空结构。 */
	load() {
		if (!existsSync(this.filePath)) {
			this.data = empty();
			return this.data;
		}
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
		} catch {
			throw new MatrixStoreError(`存储文件损坏，无法解析：${this.filePath}`);
		}
		const file = parsed;
		if (typeof file !== "object" || file === null || typeof file.version !== "number") throw new MatrixStoreError(`存储文件形状非法：${this.filePath}`);
		if (file.version !== 1) throw new MatrixStoreError(`存储文件 version 不匹配：期望 1，实际 ${file.version}`);
		this.data = {
			version: 1,
			accounts: Array.isArray(file.accounts) ? file.accounts : [],
			personas: Array.isArray(file.personas) ? file.personas : [],
			topics: Array.isArray(file.topics) ? file.topics : [],
			negatives: Array.isArray(file.negatives) ? file.negatives : [],
			drafts: Array.isArray(file.drafts) ? file.drafts : []
		};
		return this.data;
	}
	/** 原子落盘（tmp + rename）。 */
	save() {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const tmp = this.filePath + ".tmp";
		writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
		renameSync(tmp, this.filePath);
	}
	listAccounts() {
		return this.data.accounts;
	}
	upsertAccount(payload, id) {
		const error = MatrixStore.validateAccountPayload(payload);
		if (error !== void 0) throw new MatrixStoreError(error);
		if (id !== void 0) {
			const existing = this.data.accounts.find((a) => a.id === id);
			if (existing === void 0) throw new MatrixStoreError(`账号不存在：${id}`);
			existing.name = payload.name;
			existing.personaId = payload.personaId;
			existing.enabled = payload.enabled;
			this.save();
			return existing;
		}
		const account = {
			id: nextId(),
			...payload,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.accounts.push(account);
		this.save();
		return account;
	}
	deleteAccount(id) {
		this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
		this.save();
	}
	listPersonas() {
		return this.data.personas;
	}
	upsertPersona(payload, id) {
		const error = MatrixStore.validatePersonaPayload(payload);
		if (error !== void 0) throw new MatrixStoreError(error);
		if (id !== void 0) {
			const existing = this.data.personas.find((p) => p.id === id);
			if (existing === void 0) throw new MatrixStoreError(`人设不存在：${id}`);
			existing.name = payload.name;
			existing.prompt = payload.prompt;
			existing.toneTags = payload.toneTags;
			this.save();
			return existing;
		}
		const persona = {
			id: nextId(),
			name: payload.name,
			prompt: payload.prompt,
			toneTags: payload.toneTags,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.personas.push(persona);
		this.save();
		return persona;
	}
	deletePersona(id) {
		this.data.personas = this.data.personas.filter((p) => p.id !== id);
		for (const account of this.data.accounts) if (account.personaId === id) account.personaId = "";
		this.save();
	}
	listTopics() {
		return this.data.topics;
	}
	addTopics(titles) {
		const created = [];
		for (const title of titles) {
			const trimmed = title.trim();
			if (trimmed === "") continue;
			const topic = {
				id: nextId(),
				title: trimmed,
				source: "manual",
				status: "open",
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			};
			this.data.topics.push(topic);
			created.push(topic);
		}
		this.save();
		return created;
	}
	retireTopic(id) {
		const topic = this.data.topics.find((t) => t.id === id);
		if (topic === void 0) throw new MatrixStoreError(`选题不存在：${id}`);
		topic.status = "retired";
		this.save();
	}
	markTopicUsed(id, draftId) {
		const topic = this.data.topics.find((t) => t.id === id);
		if (topic === void 0) throw new MatrixStoreError(`选题不存在：${id}`);
		topic.status = "used";
		topic.usedByDraftId = draftId;
		this.save();
	}
	listNegatives() {
		return this.data.negatives;
	}
	addNegative(payload) {
		const error = MatrixStore.validateNegativePayload(payload);
		if (error !== void 0) throw new MatrixStoreError(error);
		const negative = {
			id: nextId(),
			accountId: payload.accountId,
			keyword: payload.keyword,
			reason: payload.reason,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.negatives.push(negative);
		this.save();
		return negative;
	}
	deleteNegative(id) {
		this.data.negatives = this.data.negatives.filter((n) => n.id !== id);
		this.save();
	}
	listDrafts() {
		return this.data.drafts;
	}
	findDraft(accountId, date, topicId) {
		return this.data.drafts.find((d) => d.accountId === accountId && d.date === date && d.topicId === topicId);
	}
	saveDraft(payload) {
		const draft = {
			id: nextId(),
			...payload,
			status: "generated",
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.drafts.push(draft);
		this.save();
		return draft;
	}
	setDraftStatus(id, status, metrics) {
		const draft = this.data.drafts.find((d) => d.id === id);
		if (draft === void 0) throw new MatrixStoreError(`草稿不存在：${id}`);
		draft.status = status;
		if (metrics !== void 0) draft.metrics = metrics;
		this.save();
		return draft;
	}
};
//#endregion
export { MatrixStore as t };
