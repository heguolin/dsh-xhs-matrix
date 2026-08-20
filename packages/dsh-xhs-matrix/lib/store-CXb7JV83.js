import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
//#region src/migration.ts
/** 将 version 1 存储迁移到 version 2；旧版独立约束不会迁移。 */
function migrateStoreFile(file) {
	return {
		version: 2,
		accounts: (file.accounts ?? []).map((account) => ({
			...account,
			connection: account.connection ?? { status: "unbound" },
			collection: account.collection ?? {
				enabled: false,
				intervalMinutes: 1440,
				maxItems: 100
			},
			collectionStatus: account.collectionStatus ?? {
				running: false,
				lastStatus: "idle"
			}
		})),
		personas: file.personas ?? [],
		topics: file.topics ?? [],
		drafts: file.drafts ?? [],
		publishedNotes: [],
		metricSnapshots: [],
		trendSamples: [],
		studioMessages: []
	};
}
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
		version: 2,
		accounts: [],
		personas: [],
		topics: [],
		drafts: [],
		publishedNotes: [],
		metricSnapshots: [],
		trendSamples: [],
		studioMessages: []
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
	filePath;
	data;
	requireAccount(accountId) {
		const account = this.data.accounts.find((item) => item.id === accountId);
		if (account === void 0) throw new MatrixStoreError(`账号不存在：${accountId}`);
		return account;
	}
	requirePublishedNote(accountId, noteId) {
		this.requireAccount(accountId);
		const note = this.data.publishedNotes.find((item) => item.id === noteId && item.accountId === accountId);
		if (note === void 0) throw new MatrixStoreError(`已发布笔记不存在或不属于该账号：${noteId}`);
		return note;
	}
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
		if (file.version === 1) {
			this.data = migrateStoreFile(file);
			this.save();
			return this.data;
		}
		if (file.version !== 2) throw new MatrixStoreError(`存储文件 version 不匹配：期望 2，实际 ${file.version}`);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const accounts = Array.isArray(file.accounts) ? file.accounts : [];
		const publishedNotes = Array.isArray(file.publishedNotes) ? file.publishedNotes : [];
		const studioMessages = Array.isArray(file.studioMessages) ? file.studioMessages : [];
		this.data = {
			version: 2,
			accounts: accounts.map((account) => ({
				...account,
				connection: account.connection ?? { status: "unbound" },
				collection: account.collection ?? {
					enabled: false,
					intervalMinutes: 1440,
					maxItems: 100
				},
				collectionStatus: account.collectionStatus ?? {
					running: false,
					lastStatus: "idle"
				}
			})),
			personas: Array.isArray(file.personas) ? file.personas : [],
			topics: Array.isArray(file.topics) ? file.topics : [],
			drafts: Array.isArray(file.drafts) ? file.drafts : [],
			publishedNotes: publishedNotes.map((note) => ({
				...note,
				updatedAt: note.updatedAt ?? note.createdAt ?? now
			})),
			metricSnapshots: Array.isArray(file.metricSnapshots) ? file.metricSnapshots : [],
			trendSamples: Array.isArray(file.trendSamples) ? file.trendSamples : [],
			studioMessages: studioMessages.map((message) => ({
				...message,
				read: message.read ?? false
			}))
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
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			connection: { status: "unbound" },
			collection: {
				enabled: false,
				intervalMinutes: 1440,
				maxItems: 100
			},
			collectionStatus: {
				running: false,
				lastStatus: "idle"
			}
		};
		this.data.accounts.push(account);
		this.save();
		return account;
	}
	deleteAccount(id) {
		this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
		this.save();
	}
	updateAccountConnection(id, connection) {
		const account = this.requireAccount(id);
		account.connection = connection;
		this.save();
		return account;
	}
	updateCollectionConfig(id, collection) {
		const account = this.requireAccount(id);
		if (!Number.isInteger(collection.intervalMinutes) || collection.intervalMinutes < 1) throw new MatrixStoreError("intervalMinutes 必须是正整数");
		if (!Number.isInteger(collection.maxItems) || collection.maxItems < 1) throw new MatrixStoreError("maxItems 必须是正整数");
		account.collection = collection;
		this.save();
		return account;
	}
	updateCollectionStatus(id, status) {
		const account = this.requireAccount(id);
		account.collectionStatus = status;
		this.save();
		return account;
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
			existing.positioning = payload.positioning;
			existing.audience = payload.audience;
			existing.expertise = payload.expertise;
			existing.contentDirections = payload.contentDirections;
			existing.hookStyles = payload.hookStyles;
			existing.bodyStructure = payload.bodyStructure;
			existing.endingStyle = payload.endingStyle;
			existing.forbiddenExpressions = payload.forbiddenExpressions;
			existing.topicCriteria = payload.topicCriteria;
			existing.defaultHashtags = payload.defaultHashtags;
			this.save();
			return existing;
		}
		const persona = {
			id: nextId(),
			name: payload.name,
			prompt: payload.prompt,
			toneTags: payload.toneTags,
			positioning: payload.positioning,
			audience: payload.audience,
			expertise: payload.expertise,
			contentDirections: payload.contentDirections,
			hookStyles: payload.hookStyles,
			bodyStructure: payload.bodyStructure,
			endingStyle: payload.endingStyle,
			forbiddenExpressions: payload.forbiddenExpressions,
			topicCriteria: payload.topicCriteria,
			defaultHashtags: payload.defaultHashtags,
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
	deleteDraft(id) {
		this.data.drafts = this.data.drafts.filter((d) => d.id !== id);
		this.save();
	}
	setDraftStatus(id, status, metrics) {
		const draft = this.data.drafts.find((d) => d.id === id);
		if (draft === void 0) throw new MatrixStoreError(`草稿不存在：${id}`);
		draft.status = status;
		if (metrics !== void 0) draft.metrics = metrics;
		this.save();
		return draft;
	}
	updateDraft(id, payload) {
		const draft = this.data.drafts.find((d) => d.id === id);
		if (draft === void 0) throw new MatrixStoreError(`草稿不存在：${id}`);
		if (payload.copy !== void 0) draft.copy = payload.copy;
		if (payload.coverPrompt !== void 0) draft.coverPrompt = payload.coverPrompt;
		if (payload.tags !== void 0) draft.tags = payload.tags;
		draft.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.save();
		return draft;
	}
	listPublishedNotes(accountId) {
		return accountId === void 0 ? this.data.publishedNotes : this.data.publishedNotes.filter((note) => note.accountId === accountId);
	}
	savePublishedNote(payload) {
		return this.importPublishedNotes(payload.accountId, [payload])[0];
	}
	importPublishedNotes(accountId, payloads) {
		this.requireAccount(accountId);
		if (payloads.some((payload) => payload.accountId !== accountId)) throw new MatrixStoreError("导入记录 accountId 与目标账号不一致");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const existingUrls = new Set(this.data.publishedNotes.filter((note) => note.accountId === accountId).map((note) => note.sourceUrl).filter((url) => url !== void 0));
		const batchUrls = /* @__PURE__ */ new Set();
		const created = payloads.filter((payload) => {
			if (payload.sourceUrl === void 0) return true;
			if (existingUrls.has(payload.sourceUrl) || batchUrls.has(payload.sourceUrl)) return false;
			batchUrls.add(payload.sourceUrl);
			return true;
		}).map((payload) => ({
			id: nextId(),
			...payload,
			createdAt: now,
			updatedAt: payload.updatedAt ?? now
		}));
		this.data.publishedNotes.push(...created);
		if (created.length > 0) this.save();
		return created;
	}
	deletePublishedNote(id) {
		this.data.publishedNotes = this.data.publishedNotes.filter((n) => n.id !== id);
		this.save();
	}
	setNoteWeight(accountId, noteId, weight) {
		if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new MatrixStoreError("权重必须是 0-5 的整数");
		this.requirePublishedNote(accountId, noteId);
		const note = this.data.publishedNotes.find((item) => item.id === noteId && item.accountId === accountId);
		if (note === void 0) throw new MatrixStoreError(`已发布笔记不存在或不属于该账号：${noteId}`);
		note.weight = weight;
		note.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.save();
		return note;
	}
	listMetricSnapshots(accountId, noteId) {
		return this.data.metricSnapshots.filter((snapshot) => (accountId === void 0 || snapshot.accountId === accountId) && (noteId === void 0 || snapshot.noteId === noteId));
	}
	saveMetricSnapshot(payload) {
		this.requirePublishedNote(payload.accountId, payload.noteId);
		const snapshot = {
			id: nextId(),
			...payload,
			collectedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.metricSnapshots.push(snapshot);
		this.save();
		return snapshot;
	}
	listTrendSamples(accountId) {
		return accountId === void 0 ? this.data.trendSamples : this.data.trendSamples.filter((sample) => sample.accountId === accountId);
	}
	saveTrendSample(payload) {
		this.requireAccount(payload.accountId);
		const sample = {
			id: nextId(),
			...payload,
			collectedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.trendSamples.push(sample);
		this.save();
		return sample;
	}
	listStudioMessages(accountId) {
		return accountId === void 0 ? this.data.studioMessages : this.data.studioMessages.filter((message) => message.accountId === accountId);
	}
	saveStudioMessage(payload) {
		this.requireAccount(payload.accountId);
		const message = {
			id: nextId(),
			...payload,
			receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
			read: false
		};
		this.data.studioMessages.push(message);
		this.save();
		return message;
	}
	markStudioMessageRead(id) {
		const message = this.data.studioMessages.find((m) => m.id === id);
		if (message === void 0) throw new MatrixStoreError(`创作室消息不存在：${id}`);
		message.read = true;
		this.save();
	}
};
//#endregion
export { MatrixStore as t };
