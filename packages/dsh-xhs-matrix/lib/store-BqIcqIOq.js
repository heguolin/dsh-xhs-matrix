import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
//#region src/migration.ts
/** 运行时设置默认值（存于 migration 模块，避免 store↔migration 循环依赖）。 */
function defaultMatrixSettings() {
	return { apify: {
		actorId: "",
		apiToken: "",
		maxItems: 10,
		requestTimeoutMs: 3e4,
		maxPolls: 120
	} };
}
/** 生成迁移条目 id（时间戳 + 随机后缀）。 */
function nextId$1() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
/** 将 v1/v2 存储迁移到 v3：trendSamples 转为爆款池 pending 条目、topics/negatives 丢弃、draft 去 topicId。 */
function migrateStoreFile(file) {
	const defaults = defaultMatrixSettings();
	return {
		version: 3,
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
		drafts: (file.drafts ?? []).map(({ topicId: _topicId, ...draft }) => draft),
		publishedNotes: file.version === 2 ? file.publishedNotes ?? [] : [],
		metricSnapshots: file.version === 2 ? file.metricSnapshots ?? [] : [],
		viralItems: (file.version === 2 ? file.trendSamples ?? [] : []).map((sample) => ({
			id: nextId$1(),
			accountId: sample.accountId,
			title: sample.title,
			body: sample.summary ?? sample.desc ?? "",
			sourceUrl: sample.sourceUrl,
			source: sample.source === "manual" ? "manual" : "apify",
			status: "pending",
			score: 0,
			reasons: ["历史趋势样本迁移"],
			publishedAt: sample.publishedAt,
			collectedAt: sample.collectedAt
		})),
		studioMessages: file.version === 2 ? file.studioMessages ?? [] : [],
		settings: { apify: {
			...defaults.apify,
			...file.version === 2 ? file.settings?.apify ?? {} : {}
		} }
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
/** 从文案中提取话题标签（#开头，去重，空格分隔）；无标签返回 undefined。 */
function extractHashtags(text) {
	const tags = text.match(/#[^\s#，,。.!！?？]+/g);
	if (tags === null || tags.length === 0) return void 0;
	return [...new Set(tags)].join(" ");
}
function empty() {
	return {
		version: 3,
		accounts: [],
		personas: [],
		drafts: [],
		publishedNotes: [],
		metricSnapshots: [],
		viralItems: [],
		studioMessages: [],
		settings: defaultMatrixSettings()
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
		const rawVersion = file.version;
		if (rawVersion === 1 || rawVersion === 2) {
			this.data = migrateStoreFile(file);
			this.save();
			return this.data;
		}
		if (rawVersion !== 3) throw new MatrixStoreError(`存储文件 version 不匹配：期望 3，实际 ${rawVersion}`);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const accounts = Array.isArray(file.accounts) ? file.accounts : [];
		const publishedNotes = Array.isArray(file.publishedNotes) ? file.publishedNotes : [];
		const studioMessages = Array.isArray(file.studioMessages) ? file.studioMessages : [];
		const fileApify = (file.settings ?? {}).apify ?? {};
		const defaults = defaultMatrixSettings();
		this.data = {
			version: 3,
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
			drafts: Array.isArray(file.drafts) ? file.drafts : [],
			publishedNotes: publishedNotes.map((note) => ({
				...note,
				updatedAt: note.updatedAt ?? note.createdAt ?? now
			})),
			metricSnapshots: Array.isArray(file.metricSnapshots) ? file.metricSnapshots : [],
			viralItems: Array.isArray(file.viralItems) ? file.viralItems : [],
			studioMessages: studioMessages.map((message) => ({
				...message,
				read: message.read ?? false
			})),
			settings: { apify: {
				actorId: typeof fileApify.actorId === "string" ? fileApify.actorId : defaults.apify.actorId,
				apiToken: typeof fileApify.apiToken === "string" ? fileApify.apiToken : defaults.apify.apiToken,
				maxItems: typeof fileApify.maxItems === "number" ? fileApify.maxItems : defaults.apify.maxItems,
				requestTimeoutMs: typeof fileApify.requestTimeoutMs === "number" ? fileApify.requestTimeoutMs : defaults.apify.requestTimeoutMs,
				maxPolls: typeof fileApify.maxPolls === "number" ? fileApify.maxPolls : defaults.apify.maxPolls
			} }
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
	/** 按账号与审核状态列出爆款池条目；batchId 指定时只返回该批次。 */
	listViralItems(accountId, status, batchId) {
		let items = this.data.viralItems;
		if (accountId !== void 0) items = items.filter((i) => i.accountId === accountId);
		if (status !== void 0) items = items.filter((i) => i.status === status);
		if (batchId !== void 0) items = items.filter((i) => i.batchId === batchId);
		return items;
	}
	/**
	* 按采集批次分组列出爆款池（每次采集一个批次；历史无 batchId 的归入 legacy）。
	* 批次按最早采集时间倒序（新批次在前）。
	*/
	listViralBatches(accountId) {
		const byBatch = /* @__PURE__ */ new Map();
		for (const item of this.data.viralItems.filter((i) => i.accountId === accountId)) {
			const key = item.batchId ?? "legacy";
			const list = byBatch.get(key);
			if (list === void 0) byBatch.set(key, [item]);
			else list.push(item);
		}
		return [...byBatch.entries()].map(([batchId, items]) => ({
			id: batchId,
			accountId,
			collectedAt: items.map((i) => i.collectedAt).sort()[0] ?? (/* @__PURE__ */ new Date()).toISOString(),
			itemCount: items.length
		})).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
	}
	/** 删除整个采集批次（该批次全部条目），返回删除条数。 */
	deleteViralBatch(accountId, batchId) {
		this.requireAccount(accountId);
		const before = this.data.viralItems.length;
		this.data.viralItems = this.data.viralItems.filter((i) => !(i.accountId === accountId && (i.batchId ?? "legacy") === batchId));
		const removed = before - this.data.viralItems.length;
		if (removed > 0) this.save();
		return removed;
	}
	/** 新增爆款池条目（默认 pending）；账号必须存在。 */
	saveViralItem(payload) {
		this.requireAccount(payload.accountId);
		const item = {
			id: nextId(),
			...payload,
			status: payload.status ?? "pending",
			collectedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.viralItems.push(item);
		this.save();
		return item;
	}
	/** 审核爆款条目为 accepted / ignored；条目必须属于该账号。 */
	reviewViralItem(accountId, itemId, status) {
		this.requireAccount(accountId);
		const item = this.data.viralItems.find((i) => i.id === itemId && i.accountId === accountId);
		if (item === void 0) throw new MatrixStoreError(`爆款不存在或不属于该账号：${itemId}`);
		item.status = status;
		this.save();
		return item;
	}
	/** 更新爆款条目的详情字段（采纳后抓回完整正文/标题，或重算评分）。 */
	updateViralItem(accountId, itemId, patch) {
		this.requireAccount(accountId);
		const item = this.data.viralItems.find((i) => i.id === itemId && i.accountId === accountId);
		if (item === void 0) throw new MatrixStoreError(`爆款不存在或不属于该账号：${itemId}`);
		if (patch.title !== void 0) item.title = patch.title;
		if (patch.body !== void 0) item.body = patch.body;
		if (patch.score !== void 0) item.score = patch.score;
		if (patch.reasons !== void 0) item.reasons = patch.reasons;
		this.save();
		return item;
	}
	/** 读取运行时设置（apify 等）。 */
	getSettings() {
		return this.data.settings;
	}
	/** 更新 Apify 数据源配置并落盘；返回更新后的设置。 */
	updateApifySettings(payload) {
		this.data.settings = {
			...this.data.settings,
			apify: {
				...this.data.settings.apify,
				...payload
			}
		};
		this.save();
		return this.data.settings;
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
	listDrafts() {
		return this.data.drafts;
	}
	/** v3 草稿独立于选题，去重键为账号 + 日期（无 topicId 残留）。 */
	findDraft(accountId, date) {
		return this.data.drafts.find((d) => d.accountId === accountId && d.date === date);
	}
	saveDraft(payload) {
		const draft = {
			id: nextId(),
			...payload,
			tags: payload.tags ?? extractHashtags(payload.copy),
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
		else if (draft.tags === void 0 || draft.tags === "") draft.tags = extractHashtags(draft.copy);
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
