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
/**
* 将 v1/v2 存储迁移到 v4：无法解析人设的笔记/爆款进入待归属集合，
* topics/negatives 丢弃、draft 去 topicId，并补齐人设与来源账号快照。
*/
function migrateStoreFile(file) {
	const defaults = defaultMatrixSettings();
	const accounts = (file.accounts ?? []).map((account) => ({
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
	}));
	const accountById = new Map(accounts.map((account) => [account.id, account]));
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const pendingOwnership = [];
	const migratedNotes = [];
	const migratedViral = [];
	for (const note of file.version === 2 ? file.publishedNotes ?? [] : []) {
		const account = accountById.get(note.accountId);
		const source = note.source === "import" ? "import" : note.source === "manual" ? "manual" : "apify";
		if (account !== void 0 && typeof account.personaId === "string" && account.personaId !== "") migratedNotes.push({
			id: note.id,
			personaId: account.personaId,
			sourceAccountId: note.accountId,
			sourceAccountName: account.name,
			title: note.title,
			copy: note.copy,
			topic: note.topic,
			contentType: note.contentType,
			sourceUrl: note.sourceUrl,
			publishedAt: note.publishedAt,
			source,
			weight: note.weight,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt ?? note.createdAt
		});
		else pendingOwnership.push({
			id: "pending-note-" + note.id,
			kind: "published-note",
			payload: {
				id: note.id,
				sourceAccountId: note.accountId,
				sourceAccountName: account?.name,
				title: note.title,
				copy: note.copy,
				topic: note.topic,
				contentType: note.contentType,
				sourceUrl: note.sourceUrl,
				publishedAt: note.publishedAt,
				source,
				weight: note.weight,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt ?? note.createdAt
			},
			sourceAccountId: note.accountId,
			sourceAccountName: account?.name,
			reason: account === void 0 ? "账号不存在" : "账号未绑定人设",
			migratedAt: now
		});
	}
	for (const sample of file.version === 2 ? file.trendSamples ?? [] : []) {
		const account = accountById.get(sample.accountId);
		const source = sample.source === "manual" ? "manual" : sample.source === "import" ? "import" : "apify";
		const payload = {
			id: nextId$1(),
			sourceAccountId: sample.accountId,
			sourceAccountName: account?.name,
			title: sample.title,
			body: sample.summary ?? sample.desc ?? "",
			sourceUrl: sample.sourceUrl,
			source,
			status: "pending",
			weight: 1,
			score: 0,
			reasons: ["历史趋势样本迁移"],
			publishedAt: sample.publishedAt,
			collectedAt: sample.collectedAt
		};
		if (account !== void 0 && typeof account.personaId === "string" && account.personaId !== "") migratedViral.push({
			...payload,
			personaId: account.personaId,
			sourceAccountId: sample.accountId,
			sourceAccountName: account.name
		});
		else pendingOwnership.push({
			id: "pending-viral-" + payload.id,
			kind: "viral-item",
			payload,
			sourceAccountId: sample.accountId,
			sourceAccountName: account?.name,
			reason: account === void 0 ? "账号不存在" : "账号未绑定人设",
			migratedAt: now
		});
	}
	const drafts = (file.drafts ?? []).map((draft) => {
		const { topicId: _topicId, ...rest } = draft;
		const account = accountById.get(draft.accountId);
		return {
			...rest,
			personaIdSnapshot: account?.personaId !== void 0 && account.personaId !== "" ? account.personaId : void 0
		};
	});
	const metricSnapshots = (file.version === 2 ? file.metricSnapshots ?? [] : []).map((snapshot) => {
		const account = accountById.get(snapshot.accountId);
		return {
			...snapshot,
			accountNameSnapshot: account?.name
		};
	});
	const studioMessages = (file.version === 2 ? file.studioMessages ?? [] : []).map((message) => {
		const account = accountById.get(message.accountId);
		return {
			...message,
			personaIdSnapshot: account?.personaId !== void 0 && account.personaId !== "" ? account.personaId : void 0
		};
	});
	return {
		version: 4,
		accounts,
		personas: file.personas ?? [],
		drafts,
		publishedNotes: migratedNotes,
		metricSnapshots,
		viralItems: migratedViral,
		studioMessages,
		pendingOwnership,
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
		version: 4,
		accounts: [],
		personas: [],
		drafts: [],
		publishedNotes: [],
		metricSnapshots: [],
		viralItems: [],
		studioMessages: [],
		pendingOwnership: [],
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
		if (account === void 0) throw new MatrixStoreError("账号不存在：" + accountId);
		return account;
	}
	requirePersona(personaId) {
		const persona = this.data.personas.find((item) => item.id === personaId);
		if (persona === void 0) throw new MatrixStoreError("人设不存在：" + personaId);
		return persona;
	}
	requirePersonaNote(personaId, noteId) {
		this.requirePersona(personaId);
		const note = this.data.publishedNotes.find((item) => item.id === noteId && item.personaId === personaId);
		if (note === void 0) throw new MatrixStoreError("已发布笔记不存在或不属于该人设：" + noteId);
		return note;
	}
	requireNoteById(noteId) {
		const note = this.data.publishedNotes.find((item) => item.id === noteId);
		if (note === void 0) throw new MatrixStoreError("已发布笔记不存在：" + noteId);
		return note;
	}
	requirePersonaViral(personaId, itemId) {
		this.requirePersona(personaId);
		const item = this.data.viralItems.find((i) => i.id === itemId && i.personaId === personaId);
		if (item === void 0) throw new MatrixStoreError("爆款条目不存在或不属于该人设：" + itemId);
		return item;
	}
	/** 校验 note weight 是否合法 0-5 整数。 */
	static checkWeight(weight) {
		if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new MatrixStoreError("权重必须是 0-5 的整数");
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
			throw new MatrixStoreError("存储文件损坏，无法解析：" + this.filePath);
		}
		const file = parsed;
		if (typeof file !== "object" || file === null || typeof file.version !== "number") throw new MatrixStoreError("存储文件形状非法：" + this.filePath);
		const rawVersion = file.version;
		if (rawVersion === 1 || rawVersion === 2) {
			this.data = migrateStoreFile(file);
			this.save();
			return this.data;
		}
		if (rawVersion !== 4) throw new MatrixStoreError("存储文件 version 不匹配：期望 4，实际 " + rawVersion);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const accounts = Array.isArray(file.accounts) ? file.accounts : [];
		const publishedNotes = Array.isArray(file.publishedNotes) ? file.publishedNotes : [];
		const viralItems = Array.isArray(file.viralItems) ? file.viralItems : [];
		const studioMessages = Array.isArray(file.studioMessages) ? file.studioMessages : [];
		const fileApify = (file.settings ?? {}).apify ?? {};
		const defaults = defaultMatrixSettings();
		this.data = {
			version: 4,
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
			viralItems: viralItems.map((item) => ({
				...item,
				weight: item.weight ?? 1
			})),
			studioMessages: studioMessages.map((message) => ({
				...message,
				read: message.read ?? false
			})),
			pendingOwnership: Array.isArray(file.pendingOwnership) ? file.pendingOwnership : [],
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
	listViralItems(personaId, status, batchId) {
		let items = this.data.viralItems;
		if (personaId !== void 0) items = items.filter((i) => i.personaId === personaId);
		if (status !== void 0) items = items.filter((i) => i.status === status);
		if (batchId !== void 0) items = items.filter((i) => (i.batchId ?? "legacy") === batchId);
		return items;
	}
	listViralBatches(personaId, sourceAccountId) {
		this.requirePersona(personaId);
		const byBatch = /* @__PURE__ */ new Map();
		for (const item of this.data.viralItems.filter((i) => i.personaId === personaId)) {
			const key = item.batchId ?? "legacy";
			const list = byBatch.get(key);
			if (list === void 0) byBatch.set(key, [item]);
			else list.push(item);
		}
		return [...byBatch.entries()].map(([batchId, items]) => ({
			id: batchId,
			personaId,
			sourceAccountId,
			collectedAt: items.map((i) => i.collectedAt).sort()[0] ?? (/* @__PURE__ */ new Date()).toISOString(),
			itemCount: items.length
		})).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
	}
	deleteViralBatch(personaId, batchId) {
		this.requirePersona(personaId);
		const before = this.data.viralItems.length;
		this.data.viralItems = this.data.viralItems.filter((i) => !(i.personaId === personaId && (i.batchId ?? "legacy") === batchId));
		const removed = before - this.data.viralItems.length;
		if (removed > 0) this.save();
		return removed;
	}
	saveViralItem(payload) {
		this.requirePersona(payload.personaId);
		const item = {
			id: nextId(),
			...payload,
			status: payload.status ?? "pending",
			weight: 1,
			collectedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.viralItems.push(item);
		this.save();
		return item;
	}
	addManualViral(personaId, payload) {
		this.requirePersona(personaId);
		const item = {
			id: nextId(),
			personaId,
			title: payload.title,
			body: payload.body,
			sourceUrl: payload.sourceUrl,
			source: "manual",
			status: "accepted",
			weight: 5,
			score: 0,
			reasons: payload.reasons ?? ["手动新增"],
			publishedAt: payload.publishedAt,
			collectedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.data.viralItems.push(item);
		this.save();
		return item;
	}
	reviewViralItem(personaId, itemId, status) {
		const item = this.requirePersonaViral(personaId, itemId);
		item.status = status;
		this.save();
		return item;
	}
	updateViralItem(personaId, itemId, patch) {
		const item = this.requirePersonaViral(personaId, itemId);
		if (patch.title !== void 0) item.title = patch.title;
		if (patch.body !== void 0) item.body = patch.body;
		if (patch.score !== void 0) item.score = patch.score;
		if (patch.reasons !== void 0) item.reasons = patch.reasons;
		this.save();
		return item;
	}
	setViralWeight(personaId, itemId, weight) {
		MatrixStore.checkWeight(weight);
		const item = this.requirePersonaViral(personaId, itemId);
		item.weight = weight;
		this.save();
		return item;
	}
	transferViralItems(personaId, itemIds, targetPersonaId) {
		this.requirePersona(personaId);
		this.requirePersona(targetPersonaId);
		const moved = [];
		for (const item of this.data.viralItems) if (item.personaId === personaId && itemIds.includes(item.id)) {
			item.personaId = targetPersonaId;
			moved.push(item);
		}
		if (moved.length > 0) this.save();
		return moved;
	}
	stashPendingOwnership(input) {
		const base = {
			id: nextId(),
			sourceAccountId: input.sourceAccountId,
			sourceAccountName: input.sourceAccountName,
			reason: input.reason,
			migratedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		const entry = input.kind === "published-note" ? {
			...base,
			kind: "published-note",
			payload: input.payload
		} : {
			...base,
			kind: "viral-item",
			payload: input.payload
		};
		this.data.pendingOwnership.push(entry);
		this.save();
		return entry;
	}
	listPendingOwnership() {
		return this.data.pendingOwnership;
	}
	assignPendingOwnership(id, targetPersonaId) {
		const index = this.data.pendingOwnership.findIndex((entry) => entry.id === id);
		if (index < 0) throw new MatrixStoreError("待归属记录不存在：" + id);
		this.requirePersona(targetPersonaId);
		const entry = this.data.pendingOwnership[index];
		const now = (/* @__PURE__ */ new Date()).toISOString();
		if (entry.kind === "published-note") {
			const note = {
				...entry.payload,
				personaId: targetPersonaId,
				updatedAt: entry.payload.updatedAt ?? now
			};
			this.data.publishedNotes.push(note);
			this.data.pendingOwnership.splice(index, 1);
			this.save();
			return note;
		}
		const item = {
			...entry.payload,
			personaId: targetPersonaId
		};
		this.data.viralItems.push(item);
		this.data.pendingOwnership.splice(index, 1);
		this.save();
		return item;
	}
	getSettings() {
		return this.data.settings;
	}
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
			if (existing === void 0) throw new MatrixStoreError("账号不存在：" + id);
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
		this.data.studioMessages = this.data.studioMessages.filter((m) => m.accountId !== id);
		this.data.drafts = this.data.drafts.filter((d) => d.accountId !== id);
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
			if (existing === void 0) throw new MatrixStoreError("人设不存在：" + id);
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
			existing.writingStyles = payload.writingStyles;
			existing.endingHookConstraints = payload.endingHookConstraints;
			existing.endingHookExamples = payload.endingHookExamples;
			existing.forbiddenWords = payload.forbiddenWords;
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
			writingStyles: payload.writingStyles,
			endingHookConstraints: payload.endingHookConstraints,
			endingHookExamples: payload.endingHookExamples,
			forbiddenWords: payload.forbiddenWords,
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
	personaInUse(personaId) {
		return {
			accountCount: this.data.accounts.filter((a) => a.personaId === personaId).length,
			noteCount: this.data.publishedNotes.filter((n) => n.personaId === personaId).length,
			viralCount: this.data.viralItems.filter((i) => i.personaId === personaId).length
		};
	}
	listDrafts(accountId) {
		return accountId === void 0 ? this.data.drafts : this.data.drafts.filter((d) => d.accountId === accountId);
	}
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
		if (draft === void 0) throw new MatrixStoreError("草稿不存在：" + id);
		draft.status = status;
		if (metrics !== void 0) draft.metrics = metrics;
		this.save();
		return draft;
	}
	updateDraft(id, payload) {
		const draft = this.data.drafts.find((d) => d.id === id);
		if (draft === void 0) throw new MatrixStoreError("草稿不存在：" + id);
		if (payload.copy !== void 0) draft.copy = payload.copy;
		if (payload.coverPrompt !== void 0) draft.coverPrompt = payload.coverPrompt;
		if (payload.tags !== void 0) draft.tags = payload.tags;
		else if (draft.tags === void 0 || draft.tags === "") draft.tags = extractHashtags(draft.copy);
		draft.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.save();
		return draft;
	}
	listPublishedNotes(personaId) {
		return personaId === void 0 ? this.data.publishedNotes : this.data.publishedNotes.filter((note) => note.personaId === personaId);
	}
	savePublishedNote(payload) {
		this.requirePersona(payload.personaId);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const note = {
			id: nextId(),
			...payload,
			sourceAccountName: payload.sourceAccountName ?? (payload.sourceAccountId !== void 0 ? this.data.accounts.find((a) => a.id === payload.sourceAccountId)?.name : void 0),
			createdAt: now,
			updatedAt: payload.updatedAt ?? now
		};
		this.data.publishedNotes.push(note);
		this.save();
		return note;
	}
	importPublishedNotes(personaId, payloads) {
		this.requirePersona(personaId);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const existingUrls = new Set(this.data.publishedNotes.filter((note) => note.personaId === personaId).map((note) => note.sourceUrl).filter((url) => url !== void 0));
		const batchUrls = /* @__PURE__ */ new Set();
		const created = payloads.filter((payload) => {
			if (payload.sourceUrl === void 0) return true;
			if (existingUrls.has(payload.sourceUrl) || batchUrls.has(payload.sourceUrl)) return false;
			batchUrls.add(payload.sourceUrl);
			return true;
		}).map((payload) => ({
			id: nextId(),
			personaId,
			sourceAccountId: payload.sourceAccountId,
			sourceAccountName: payload.sourceAccountName ?? (payload.sourceAccountId !== void 0 ? this.data.accounts.find((a) => a.id === payload.sourceAccountId)?.name : void 0),
			title: payload.title,
			copy: payload.copy,
			topic: payload.topic,
			contentType: payload.contentType,
			sourceUrl: payload.sourceUrl,
			publishedAt: payload.publishedAt,
			source: payload.source,
			weight: payload.weight,
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
	setNoteWeight(personaId, noteId, weight) {
		MatrixStore.checkWeight(weight);
		const note = this.requirePersonaNote(personaId, noteId);
		note.weight = weight;
		note.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.save();
		return note;
	}
	transferNotes(personaId, noteIds, targetPersonaId) {
		this.requirePersona(personaId);
		this.requirePersona(targetPersonaId);
		const moved = [];
		for (const note of this.data.publishedNotes) if (note.personaId === personaId && noteIds.includes(note.id)) {
			note.personaId = targetPersonaId;
			note.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			moved.push(note);
		}
		if (moved.length > 0) this.save();
		return moved;
	}
	listMetricSnapshots(accountId, noteId) {
		return this.data.metricSnapshots.filter((snapshot) => (accountId === void 0 || snapshot.accountId === accountId) && (noteId === void 0 || snapshot.noteId === noteId));
	}
	listMetricSnapshotsByNote(noteId) {
		return this.data.metricSnapshots.filter((snapshot) => snapshot.noteId === noteId);
	}
	saveMetricSnapshot(payload) {
		this.requireNoteById(payload.noteId);
		const snapshot = {
			id: nextId(),
			accountId: payload.accountId,
			noteId: payload.noteId,
			accountNameSnapshot: payload.accountNameSnapshot ?? this.data.accounts.find((a) => a.id === payload.accountId)?.name,
			reads: payload.reads,
			likes: payload.likes,
			favorites: payload.favorites,
			comments: payload.comments,
			shares: payload.shares,
			source: payload.source,
			status: payload.status,
			error: payload.error,
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
			accountId: payload.accountId,
			role: payload.role,
			content: payload.content,
			evidenceIds: payload.evidenceIds,
			personaIdSnapshot: payload.personaIdSnapshot,
			requestId: payload.requestId,
			receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
			read: false
		};
		this.data.studioMessages.push(message);
		this.save();
		return message;
	}
	markStudioMessageRead(id) {
		const message = this.data.studioMessages.find((m) => m.id === id);
		if (message === void 0) throw new MatrixStoreError("创作室消息不存在：" + id);
		message.read = true;
		this.save();
	}
};
//#endregion
export { MatrixStoreError as n, MatrixStore as t };
