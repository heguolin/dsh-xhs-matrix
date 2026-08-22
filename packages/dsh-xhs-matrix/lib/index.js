import { a as splitLegacyForbidden, i as scanForbiddenWords, n as MatrixStoreError, r as createQualityService, t as MatrixStore } from "./store-D8JHoWds.js";
import { BlockAssembler, createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/collector/provider.ts
function normalizeApifyItem(item) {
	if (typeof item !== "object" || item === null) throw new Error("Apify item 必须是对象");
	const value = item;
	const num = (key) => typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : void 0;
	const firstString = (...keys) => {
		for (const key of keys) if (typeof value[key] === "string" && value[key].trim() !== "") return value[key].trim();
	};
	const body = firstString("body", "content", "desc", "text", "description");
	let title = firstString("title", "note_title", "title_text", "name");
	if (title === void 0 && body !== void 0) {
		const firstLine = body.split("\n")[0].trim();
		if (firstLine !== "") title = firstLine.slice(0, 60);
	}
	if (title === void 0 || title === "") throw new Error("Apify item 缺少 title");
	const url = firstString("url", "noteUrl", "note_url", "link");
	return {
		title,
		body,
		sourceUrl: url,
		source: "apify",
		publishedAt: firstString("publishedAt", "publish_time", "created_at", "time"),
		reads: num("reads") ?? num("viewCount") ?? num("view_count"),
		likes: num("likes") ?? num("likeCount") ?? num("like_count"),
		comments: num("comments") ?? num("commentCount") ?? num("comment_count")
	};
}
//#endregion
//#region src/collector/apify.ts
/** Apify Actor Run/Dataset 的 Host 适配器（v3 爆款采集）。 */
/** 通过 Apify API 搜索公开爆款样本；凭据只在 Host 端使用。 */
var ApifyViralProvider = class {
	config;
	fetcher;
	sleep;
	constructor(config, options = {}) {
		this.config = config;
		this.fetcher = options.fetcher ?? fetch;
		this.sleep = options.sleep ?? (async (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	}
	async search(request) {
		if (this.config.actorId.trim() === "" || this.config.apiToken.trim() === "") return {
			items: [],
			status: "failed",
			error: "Apify actorId 和 apiToken 必填"
		};
		const limit = Math.min(request.maxItems, this.config.maxItems);
		const headers = {
			Authorization: `Bearer ${this.config.apiToken}`,
			"content-type": "application/json"
		};
		try {
			const runResponse = await this.fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.actorId)}/runs?token=${encodeURIComponent(this.config.apiToken)}`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					query: request.query,
					searchKeyword: request.query,
					keyword: request.query,
					search: request.query,
					operation: "search_notes",
					max_items: limit,
					maxItems: limit,
					maxResults: limit
				}),
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!runResponse.ok) {
				let detail = "";
				try {
					detail = (await runResponse.json()).error?.message ?? "";
				} catch {}
				const suffix = detail !== "" ? `：${detail}` : "";
				return {
					items: [],
					status: "failed",
					error: `Apify Run HTTP ${runResponse.status}${suffix}`
				};
			}
			const run = await runResponse.json();
			const runId = run.data?.id;
			const datasetId = run.data?.defaultDatasetId;
			const kvStoreId = run.data?.defaultKeyValueStoreId;
			if (runId === void 0 || datasetId === void 0) return {
				items: [],
				status: "failed",
				error: "Apify Run 响应缺少 id 或 Dataset"
			};
			let status = run.data?.status;
			for (let poll = 0; poll < this.config.maxPolls && status !== "SUCCEEDED"; poll += 1) {
				if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") return {
					items: [],
					status: "failed",
					error: `Apify Run ${status}`
				};
				await this.sleep(250);
				const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, {
					headers,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs)
				});
				if (!stateResponse.ok) return {
					items: [],
					status: "failed",
					error: `Apify 状态 HTTP ${stateResponse.status}`
				};
				status = (await stateResponse.json()).data?.status;
			}
			if (status !== "SUCCEEDED") return {
				items: [],
				status: "failed",
				error: "Apify Run 等待超时"
			};
			if (kvStoreId !== void 0) try {
				const outputResponse = await this.fetcher(`https://api.apify.com/v2/key-value-stores/${encodeURIComponent(kvStoreId)}/records/OUTPUT?token=${encodeURIComponent(this.config.apiToken)}`, {
					headers,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs)
				});
				if (outputResponse.ok) {
					const output = await outputResponse.json();
					const warnings = Array.isArray(output.warnings) ? output.warnings.filter((w) => typeof w === "string") : [];
					if (warnings.length > 0) return {
						items: [],
						status: "failed",
						error: warnings.join("；")
					};
				}
			} catch {}
			const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&token=${encodeURIComponent(this.config.apiToken)}`, {
				headers,
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!datasetResponse.ok) return {
				items: [],
				status: "failed",
				error: `Apify Dataset HTTP ${datasetResponse.status}`
			};
			const items = await datasetResponse.json();
			if (!Array.isArray(items)) return {
				items: [],
				status: "failed",
				error: "Apify Dataset 不是数组"
			};
			const normalized = [];
			for (const raw of items.slice(0, limit)) try {
				normalized.push(normalizeApifyItem(raw));
			} catch {}
			if (normalized.length === 0) return {
				items: [],
				status: "failed",
				error: "Apify Dataset 条目均无法解析（缺少标题与正文）"
			};
			return {
				items: normalized,
				status: "success"
			};
		} catch (error) {
			return {
				items: [],
				status: "failed",
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	/** 按笔记链接抓详情（get_note_detail）；任何失败返回 undefined。 */
	async fetchNoteDetail(noteUrl) {
		if (this.config.actorId.trim() === "" || this.config.apiToken.trim() === "") return void 0;
		const headers = {
			Authorization: `Bearer ${this.config.apiToken}`,
			"content-type": "application/json"
		};
		try {
			const runResponse = await this.fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.actorId)}/runs?token=${encodeURIComponent(this.config.apiToken)}`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					operation: "get_note_detail",
					note_url: noteUrl
				}),
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!runResponse.ok) return void 0;
			const run = await runResponse.json();
			const runId = run.data?.id;
			const datasetId = run.data?.defaultDatasetId;
			if (runId === void 0 || datasetId === void 0) return void 0;
			let status = run.data?.status;
			for (let poll = 0; poll < this.config.maxPolls && status !== "SUCCEEDED"; poll += 1) {
				if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") return void 0;
				await this.sleep(250);
				const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, {
					headers,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs)
				});
				if (!stateResponse.ok) return void 0;
				status = (await stateResponse.json()).data?.status;
			}
			if (status !== "SUCCEEDED") return void 0;
			const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=1&token=${encodeURIComponent(this.config.apiToken)}`, {
				headers,
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!datasetResponse.ok) return void 0;
			const items = await datasetResponse.json();
			if (!Array.isArray(items) || items.length === 0) return void 0;
			const normalized = normalizeApifyItem(items[0]);
			return normalized.body !== void 0 && normalized.body !== "" ? normalized : void 0;
		} catch {
			return;
		}
	}
};
//#endregion
//#region src/metrics.ts
const SOURCES = [
	"manual",
	"import",
	"apify",
	"authorized"
];
function isIsoDate(value) {
	if (typeof value !== "string" || value.trim() === "") return false;
	return !Number.isNaN(Date.parse(value));
}
function isFiniteNonNegative(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
/** 校验指标快照；失败抛错。 */
function validateMetricSnapshot(input) {
	if (typeof input.accountId !== "string" || input.accountId.trim() === "") throw new Error("accountId 必填");
	if (typeof input.noteId !== "string" || input.noteId.trim() === "") throw new Error("noteId 必填");
	for (const [key, value] of [
		["reads", input.reads],
		["likes", input.likes],
		["favorites", input.favorites],
		["comments", input.comments]
	]) if (!isFiniteNonNegative(value)) throw new Error(`${key} 必须是非负有限数值`);
	if (input.shares !== void 0 && !isFiniteNonNegative(input.shares)) throw new Error("shares 必须是非负有限数值");
	if (!SOURCES.includes(input.source)) throw new Error("source 必须是 manual/import/apify/authorized");
	const collectedAt = input.collectedAt ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!isIsoDate(collectedAt)) throw new Error("collectedAt 必须是合法 ISO 时间");
	return {
		accountId: input.accountId,
		noteId: input.noteId,
		reads: input.reads,
		likes: input.likes,
		favorites: input.favorites,
		comments: input.comments,
		shares: input.shares,
		source: input.source,
		collectedAt,
		status: "success"
	};
}
/** 按账号定时采集已发布笔记公开指标；生命周期由插件 Fiber 管理。 */
var CollectionScheduler = class {
	timer;
	active = false;
	store;
	provider;
	now;
	intervalMs;
	constructor(deps) {
		this.store = deps.store;
		this.provider = deps.provider;
		this.now = deps.now ?? (() => /* @__PURE__ */ new Date());
		this.intervalMs = deps.intervalMs ?? 1440 * 60 * 1e3;
	}
	get isActive() {
		return this.active;
	}
	start() {
		if (this.active) return;
		this.active = true;
		this.timer = setInterval(() => {
			this.tick();
		}, this.intervalMs);
		this.timer.unref?.();
	}
	stop() {
		this.active = false;
		if (this.timer !== void 0) clearInterval(this.timer);
		this.timer = void 0;
	}
	/** 为指定账号执行一轮采集；记录 running/success/failed 状态，不触发生成或发布。 */
	async runAccount(accountId) {
		const account = this.store.listAccounts().find((item) => item.id === accountId);
		if (account === void 0) return;
		if (account.collection === void 0 || !account.collection.enabled) return;
		const persona = this.store.listPersonas().find((item) => item.id === account.personaId);
		if (persona === void 0) return;
		const accountNameSnapshot = account.name;
		this.store.updateCollectionStatus(accountId, {
			running: true,
			lastStatus: "idle"
		});
		const query = persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name;
		let result;
		try {
			result = await this.provider.search({
				accountId,
				query,
				maxItems: account.collection.maxItems
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.store.updateCollectionStatus(accountId, {
				running: false,
				lastStatus: "failed",
				lastError: message
			});
			return;
		}
		const notes = this.store.listPublishedNotes().filter((note) => note.sourceAccountId === accountId);
		if (result.status === "failed") {
			for (const note of notes) this.store.saveMetricSnapshot({
				accountId,
				noteId: note.id,
				accountNameSnapshot,
				reads: 0,
				likes: 0,
				favorites: 0,
				comments: 0,
				source: "apify",
				status: "failed",
				error: result.error
			});
			this.store.updateCollectionStatus(accountId, {
				running: false,
				lastStatus: "failed",
				lastError: result.error
			});
			return;
		}
		for (const note of notes) {
			const match = result.items.find((item) => item.sourceUrl !== void 0 && note.sourceUrl !== void 0 && item.sourceUrl === note.sourceUrl);
			this.store.saveMetricSnapshot({
				accountId,
				noteId: note.id,
				accountNameSnapshot,
				reads: match?.reads ?? 0,
				likes: match?.likes ?? 0,
				favorites: 0,
				comments: match?.comments ?? 0,
				source: "apify",
				status: "success"
			});
		}
		this.store.updateCollectionStatus(accountId, {
			running: false,
			lastStatus: "success",
			lastSuccessAt: this.now().toISOString()
		});
	}
	async tick() {
		for (const account of this.store.listAccounts()) if (account.collection?.enabled) await this.runAccount(account.id);
	}
};
//#endregion
//#region src/model-config.ts
function resolveStudioModel(getDefaultModel, listProviders) {
	const configured = getDefaultModel();
	if (configured !== void 0 && configured.provider !== "" && configured.model !== "") return configured;
	if (listProviders().length === 0) return void 0;
	throw new Error("未配置默认模型：请在 Harness 设置 agent-default-model 的 provider 与 model");
}
//#endregion
//#region src/loopback.ts
function isIPv4Loopback(v4) {
	const parts = v4.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackAddress(address) {
	if (address === void 0) return false;
	const normalized = address.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
	return isIPv4Loopback(normalized);
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	return isIPv4Loopback(hostname);
}
/** 请求级信任围栏：loopback socket + loopback Host + 非跨站。 */
function isLoopbackRequest(request) {
	if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL("http://" + host);
	} catch {
		return false;
	}
	if (!isLoopbackHostname(hostUrl.hostname)) return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/protocol.ts
const XHS_API = {
	settingsApify: "/api/dsh-xhs-matrix/settings/apify",
	accounts: "/api/dsh-xhs-matrix/accounts",
	accountImport: "/api/dsh-xhs-matrix/accounts/import",
	personas: "/api/dsh-xhs-matrix/personas",
	notes: "/api/dsh-xhs-matrix/notes",
	notesTransfer: "/api/dsh-xhs-matrix/notes/transfer",
	viral: "/api/dsh-xhs-matrix/viral",
	viralManual: "/api/dsh-xhs-matrix/viral/manual",
	viralTransfer: "/api/dsh-xhs-matrix/viral/transfer",
	pendingOwnership: "/api/dsh-xhs-matrix/pending-ownership",
	metrics: "/api/dsh-xhs-matrix/metrics",
	studio: "/api/dsh-xhs-matrix/studio",
	studioMessages: "/api/dsh-xhs-matrix/studio/messages",
	drafts: "/api/dsh-xhs-matrix/drafts"
};
//#endregion
//#region src/persona-assets.ts
/**
* 人设资产服务：路由与工具操作人设资产（知识库、爆款池、批次、权重、显式转移与待归属）的唯一入口。
* 所有公开方法以 personaId 为主键，集中执行人设存在性与内容归属校验。
*
* 语义：人设是可复用内容资产的所有者；账号是发布与采集的运营载体。
* 多个账号绑定同一人设时共享知识库、知识库权重、爆款池、爆款权重。
*/
/** 人设资产服务：单一写入/查询入口。 */
var PersonaAssetService = class {
	store;
	constructor(store) {
		this.store = store;
	}
	/** 读取人设；不存在则抛错。 */
	getPersona(personaId) {
		const persona = this.store.listPersonas().find((item) => item.id === personaId);
		if (persona === void 0) throw new MatrixStoreError("人设不存在：" + personaId);
		return persona;
	}
	/** 人设下已发布笔记知识库（共享集合）。 */
	listNotes(personaId) {
		return this.store.listPublishedNotes(personaId);
	}
	/**
	* 导入一批笔记到指定人设。
	* @param personaId - 目标人设（显式归属，不依赖账号当前人设）。
	* @param sourceAccountId - 可选来源账号（追踪与指标采集）。
	* @param sourceAccountName - 可选来源账号名快照。
	*/
	importNotes(personaId, payloads, sourceAccountId, sourceAccountName) {
		const prepared = payloads.map((payload) => ({
			...payload,
			personaId,
			sourceAccountId,
			sourceAccountName
		}));
		return this.store.importPublishedNotes(personaId, prepared);
	}
	/** 调整笔记人工权重（0-5）。 */
	setNoteWeight(personaId, noteId, weight) {
		return this.store.setNoteWeight(personaId, noteId, weight);
	}
	/** 显式把若干笔记转移到目标人设。 */
	transferNotes(personaId, noteIds, targetPersonaId) {
		return this.store.transferNotes(personaId, noteIds, targetPersonaId);
	}
	/** 查询人设爆款池条目。 */
	listVirals(personaId, status, batchId) {
		return this.store.listViralItems(personaId, status, batchId);
	}
	/** 查询人设爆款批次。 */
	listBatches(personaId, sourceAccountId) {
		return this.store.listViralBatches(personaId, sourceAccountId);
	}
	/** 手动新增爆款：默认 accepted + weight 5。 */
	addManualViral(personaId, payload) {
		return this.store.addManualViral(personaId, payload);
	}
	/** 审核爆款条目。 */
	reviewViral(personaId, itemId, status) {
		return this.store.reviewViralItem(personaId, itemId, status);
	}
	/** 调整爆款人工权重（0-5）。 */
	setViralWeight(personaId, itemId, weight) {
		return this.store.setViralWeight(personaId, itemId, weight);
	}
	/** 整批删除爆款条目；返回删除数量。 */
	deleteBatch(personaId, batchId) {
		return this.store.deleteViralBatch(personaId, batchId);
	}
	/** 显式把若干爆款条目转移到目标人设。 */
	transferVirals(personaId, itemIds, targetPersonaId) {
		return this.store.transferViralItems(personaId, itemIds, targetPersonaId);
	}
	/** 待归属记录列表。 */
	listPending() {
		return this.store.listPendingOwnership();
	}
	/** 把一条待归属记录原子地归属到目标人设。 */
	assignPending(id, targetPersonaId) {
		return this.store.assignPendingOwnership(id, targetPersonaId);
	}
	/** 人设使用情况（绑定账号、知识库与爆款数量）。 */
	personaInUse(personaId) {
		return this.store.personaInUse(personaId);
	}
};
//#endregion
//#region src/routes/shared.ts
/** JSON 请求体上限。 */
const MAX_JSON_BODY_BYTES = 256 * 1024;
/** 写 JSON 响应。 */
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
/** 读取 JSON 请求体；非法 JSON 或超限返回 undefined。 */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8").trim();
	if (text === "") return {};
	try {
		const parsed = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** 读取查询参数；缺失返回 undefined。 */
function queryParam(url, name) {
	const value = url.searchParams.get(name);
	return value === null ? void 0 : value;
}
/** 围栏 + 方法检查。 */
function guard(req, res, method) {
	if (!isLoopbackRequest(req)) {
		writeJson(res, 403, { error: "forbidden: loopback-only" });
		return false;
	}
	if (req.method !== method) {
		writeJson(res, 405, { error: `method not allowed: ${req.method}` });
		return false;
	}
	return true;
}
/** 带状态码的路由错误：供错误映射按 400/404/409 精确渲染。 */
var HttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
		this.name = "HttpError";
	}
};
/** 把错误渲染为对应状态响应：HttpError 用自身状态码，其余按参数错误 400。 */
function fail(res, error) {
	if (error instanceof HttpError) {
		writeJson(res, error.status, { error: error.message });
		return;
	}
	writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
}
/**
* 解析人设作用域：兼容期按 accountId 反查账号当前人设，或直接用 personaId。
* - account 与 persona 同时传入且不一致：返回 409，绝不静默选择其一。
* - 显式 personaId 或 accountId 指向不存在的资源：返回 404。
* - 什么都不传：返回 400。
* 仅按 account 解析时，返回账号当前 personaId（可为空字符串，由调用方决定空人设语义）。
*/
function resolvePersonaScope(store, accountId, personaId) {
	const hasAccount = accountId !== void 0 && accountId !== "";
	const hasPersona = personaId !== void 0 && personaId !== "";
	if (!hasAccount && !hasPersona) throw new HttpError(400, "account 或 persona 查询参数必填");
	let accountPersona;
	if (hasAccount) {
		const account = store.listAccounts().find((item) => item.id === accountId);
		if (account === void 0) throw new HttpError(404, "账号不存在：" + accountId);
		accountPersona = account.personaId;
	}
	if (hasPersona) {
		if (!store.listPersonas().some((item) => item.id === personaId)) throw new HttpError(404, "人设不存在：" + personaId);
		if (hasAccount && accountPersona !== personaId) throw new HttpError(409, "account 与 persona 不一致：账号属于人设 " + (accountPersona === "" ? "（未分配）" : accountPersona) + "，而非 " + personaId);
		return personaId;
	}
	return accountPersona ?? "";
}
//#endregion
//#region src/routes/accounts.ts
/** 构建账号路由。
* @param store - 矩阵存储。
* @returns 路由数组。
*/
function makeAccountsRoutes(store) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const service = new PersonaAssetService(store);
	return [route(XHS_API.accounts, async (req, res) => {
		const method = req.method ?? "GET";
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		if (method === "GET") {
			writeJson(res, 200, { accounts: store.listAccounts() });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const id = queryParam(new URL(req.url ?? "/", "http://localhost"), "account");
		try {
			if (method === "POST") writeJson(res, 201, { account: store.upsertAccount(body) });
			else if (method === "PATCH") {
				if (id === void 0) {
					writeJson(res, 400, { error: "account 查询参数必填" });
					return;
				}
				let account = store.upsertAccount(body, id);
				if (body.connection !== void 0) account = store.updateAccountConnection(id, body.connection);
				if (body.collection !== void 0) account = store.updateCollectionConfig(id, body.collection);
				writeJson(res, 200, { account });
			} else if (method === "DELETE") {
				if (id === void 0) {
					writeJson(res, 400, { error: "account 查询参数必填" });
					return;
				}
				store.deleteAccount(id);
				writeJson(res, 200, { ok: true });
			} else writeJson(res, 405, { error: `method not allowed: ${method}` });
		} catch (error) {
			fail(res, error);
		}
	}), route(XHS_API.accountImport, async (req, res) => {
		if (!guard(req, res, "POST")) return;
		const body = await readJsonBody(req);
		if (body === void 0 || typeof body.accountId !== "string" || body.format !== "csv" && body.format !== "json" || typeof body.content !== "string") {
			writeJson(res, 400, { error: "accountId、format 和 content 必填" });
			return;
		}
		try {
			const account = store.listAccounts().find((item) => item.id === body.accountId);
			if (account === void 0) {
				writeJson(res, 400, { error: "账号不存在：" + body.accountId });
				return;
			}
			const targetPersonaId = typeof body.personaId === "string" && body.personaId !== "" ? body.personaId : account.personaId;
			if (targetPersonaId === "") {
				writeJson(res, 400, { error: "该账号尚未分配人设，或未指定目标人设" });
				return;
			}
			if (!store.listPersonas().some((persona) => persona.id === targetPersonaId)) {
				writeJson(res, 404, { error: "人设不存在：" + targetPersonaId });
				return;
			}
			const { parsePublishedNoteImport } = await import("./importer-CbJ3zqor.js");
			const records = parsePublishedNoteImport(body.content, body.format);
			writeJson(res, 201, { imported: service.importNotes(targetPersonaId, records, account.id, account.name).length });
		} catch (error) {
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/routes/drafts.ts
/** 草稿创建必填字段（v3 草稿独立，不含 topicId）。 */
const REQUIRED_DRAFT_FIELDS = [
	"accountId",
	"date",
	"copy",
	"coverPrompt"
];
/**
* 构建 /drafts 草稿路由。
* @param store - 矩阵存储。
* @returns 路由数组。
*/
function makeDraftsRoutes(store) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	return [route(XHS_API.drafts, async (req, res) => {
		const method = req.method ?? "GET";
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		if (method === "GET") {
			writeJson(res, 200, { drafts: store.listDrafts() });
			return;
		}
		if (method === "PATCH") {
			const id = queryParam(new URL(req.url ?? "/", "http://localhost"), "draft");
			if (id === void 0) {
				writeJson(res, 400, { error: "draft 查询参数必填" });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const payload = {};
			if (body.copy !== void 0) {
				if (typeof body.copy !== "string") {
					writeJson(res, 400, { error: "copy 必须是字符串" });
					return;
				}
				payload.copy = body.copy;
			}
			if (body.coverPrompt !== void 0) {
				if (typeof body.coverPrompt !== "string") {
					writeJson(res, 400, { error: "coverPrompt 必须是字符串" });
					return;
				}
				payload.coverPrompt = body.coverPrompt;
			}
			if (body.tags !== void 0) {
				if (typeof body.tags !== "string") {
					writeJson(res, 400, { error: "tags 必须是字符串" });
					return;
				}
				payload.tags = body.tags;
			}
			try {
				writeJson(res, 200, { draft: store.updateDraft(id, payload) });
			} catch (error) {
				fail(res, error);
			}
			return;
		}
		if (method !== "POST") {
			writeJson(res, 405, { error: `method not allowed: ${method}` });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		for (const field of REQUIRED_DRAFT_FIELDS) {
			const value = body[field];
			if (typeof value !== "string" || value.trim() === "") {
				writeJson(res, 400, { error: `草稿字段 ${field} 必填` });
				return;
			}
		}
		const payload = {
			accountId: body.accountId,
			date: body.date,
			copy: body.copy,
			coverPrompt: body.coverPrompt
		};
		try {
			writeJson(res, 201, { draft: store.saveDraft(payload) });
		} catch (error) {
			fail(res, error);
		}
	}), route(XHS_API.drafts + "/status", async (req, res) => {
		if (!guard(req, res, "POST")) return;
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const draftId = typeof body.draftId === "string" ? body.draftId : "";
		const status = body.status;
		const metrics = body.metrics;
		if (draftId === "" || status !== "generated" && status !== "published" && status !== "dropped") {
			writeJson(res, 400, { error: "draftId 与合法 status 必填" });
			return;
		}
		if (body.metrics !== void 0) {
			const m = body.metrics;
			if (typeof m !== "object" || m === null || typeof m.reads !== "number" || typeof m.likes !== "number" || typeof m.comments !== "number" || typeof m.collected !== "string") {
				writeJson(res, 400, { error: "metrics 需含数值 reads/likes/comments 与字符串 collected" });
				return;
			}
		}
		try {
			const wasPublished = store.listDrafts().find((d) => d.id === draftId)?.status === "published";
			const draft = store.setDraftStatus(draftId, status, metrics);
			let note;
			if (status === "published" && !wasPublished) {
				const account = store.listAccounts().find((item) => item.id === draft.accountId);
				if (account === void 0 || account.personaId === "") throw new MatrixStoreError("该账号尚未分配人设，无法写入知识库");
				const lines = draft.copy.split("\n");
				const title = (lines[0] ?? "").trim().slice(0, 60) || "未命名笔记";
				const body = lines.slice(1).join("\n").trim() || draft.copy;
				note = store.savePublishedNote({
					personaId: account.personaId,
					sourceAccountId: draft.accountId,
					sourceAccountName: account.name,
					title,
					copy: body,
					topic: draft.tags !== void 0 && draft.tags !== "" ? draft.tags.replace(/#/g, " ").trim().slice(0, 100) : void 0,
					publishedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
					source: "manual",
					weight: 0
				});
			}
			writeJson(res, 200, {
				draft,
				note
			});
		} catch (error) {
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/routes/knowledge.ts
/** 构建知识库与指标路由。
* @param store - 矩阵存储。
* @param scheduler - 指标采集调度器（未配置时 collect 返回 400）。
* @returns 路由数组。
*/
function makeKnowledgeRoutes(store, scheduler) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const service = new PersonaAssetService(store);
	return [
		route(XHS_API.notes, async (req, res) => {
			const method = req.method ?? "GET";
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const url = new URL(req.url ?? "/", "http://localhost");
			const accountId = queryParam(url, "account");
			const personaId = queryParam(url, "persona");
			const noteId = queryParam(url, "note");
			if (method === "GET") {
				try {
					const resolved = resolvePersonaScope(store, accountId, personaId);
					writeJson(res, 200, {
						notes: service.listNotes(resolved),
						resolvedPersonaId: resolved
					});
				} catch (error) {
					fail(res, error);
				}
				return;
			}
			if (method !== "PATCH") {
				writeJson(res, 405, { error: `method not allowed: ${method}` });
				return;
			}
			if (noteId === void 0 || accountId === void 0 && personaId === void 0) {
				writeJson(res, 400, { error: "account/persona 与 note 查询参数必填" });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const weight = body.weight;
			if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 0 || weight > 5) {
				writeJson(res, 400, { error: "weight 必须是 0-5 的整数" });
				return;
			}
			try {
				const resolved = resolvePersonaScope(store, accountId, personaId);
				if (resolved === "") {
					writeJson(res, 400, { error: "该账号尚未分配人设" });
					return;
				}
				writeJson(res, 200, { note: service.setNoteWeight(resolved, noteId, weight) });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.notesTransfer, async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const personaId = typeof body.personaId === "string" && body.personaId !== "" ? body.personaId : "";
			const targetPersonaId = typeof body.targetPersonaId === "string" && body.targetPersonaId !== "" ? body.targetPersonaId : "";
			const noteIds = Array.isArray(body.noteIds) ? body.noteIds.filter((value) => typeof value === "string") : [];
			if (personaId === "" || targetPersonaId === "" || noteIds.length === 0) {
				writeJson(res, 400, { error: "personaId、targetPersonaId 与 noteIds 必填" });
				return;
			}
			try {
				resolvePersonaScope(store, void 0, personaId);
				if (!store.listPersonas().some((item) => item.id === targetPersonaId)) throw new HttpError(404, "人设不存在：" + targetPersonaId);
				writeJson(res, 200, { notes: service.transferNotes(personaId, noteIds, targetPersonaId) });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.metrics, async (req, res) => {
			const method = req.method ?? "GET";
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const url = new URL(req.url ?? "/", "http://localhost");
			const accountId = queryParam(url, "account");
			const noteId = queryParam(url, "note");
			if (method === "GET") {
				if (accountId === void 0) {
					writeJson(res, 400, { error: "account 查询参数必填" });
					return;
				}
				writeJson(res, 200, { metrics: store.listMetricSnapshots(accountId, noteId) });
				return;
			}
			if (method !== "POST") {
				writeJson(res, 405, { error: `method not allowed: ${method}` });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			try {
				const snapshot = validateMetricSnapshot({
					accountId: body.accountId,
					noteId: body.noteId,
					reads: body.reads,
					likes: body.likes,
					favorites: body.favorites,
					comments: body.comments,
					shares: body.shares,
					source: body.source,
					collectedAt: body.collectedAt
				});
				writeJson(res, 201, { metric: store.saveMetricSnapshot(snapshot) });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.metrics + "/collect", async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const accountId = typeof body.accountId === "string" && body.accountId !== "" ? body.accountId : "";
			if (accountId === "") {
				writeJson(res, 400, { error: "accountId 必填" });
				return;
			}
			if (scheduler === void 0) {
				writeJson(res, 400, { error: "未配置采集调度器" });
				return;
			}
			try {
				await scheduler.runAccount(accountId);
				writeJson(res, 200, { status: store.listAccounts().find((item) => item.id === accountId)?.collectionStatus });
			} catch (error) {
				fail(res, error);
			}
		})
	];
}
//#endregion
//#region src/routes/personas.ts
/** 构建人设路由。
* @param store - 矩阵存储。
* @returns 路由数组。
*/
function makePersonasRoutes(store) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const service = new PersonaAssetService(store);
	return [route(XHS_API.personas, async (req, res) => {
		const method = req.method ?? "GET";
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		if (method === "GET") {
			writeJson(res, 200, { personas: store.listPersonas() });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const id = queryParam(new URL(req.url ?? "/", "http://localhost"), "persona");
		try {
			if (method === "POST") writeJson(res, 201, { persona: store.upsertPersona(body) });
			else if (method === "PATCH") {
				if (id === void 0) {
					writeJson(res, 400, { error: "persona 查询参数必填" });
					return;
				}
				writeJson(res, 200, { persona: store.upsertPersona(body, id) });
			} else if (method === "DELETE") {
				if (id === void 0) {
					writeJson(res, 400, { error: "persona 查询参数必填" });
					return;
				}
				if (!store.listPersonas().some((item) => item.id === id)) throw new HttpError(404, "人设不存在：" + id);
				const usage = service.personaInUse(id);
				if (usage.accountCount > 0 || usage.noteCount > 0 || usage.viralCount > 0) {
					writeJson(res, 409, {
						error: "该人设仍有绑定账号或内容资产，请先转移或处理",
						usage
					});
					return;
				}
				store.deletePersona(id);
				writeJson(res, 200, { ok: true });
			} else writeJson(res, 405, { error: `method not allowed: ${method}` });
		} catch (error) {
			fail(res, error);
		}
	}), route(XHS_API.pendingOwnership, async (req, res) => {
		const method = req.method ?? "GET";
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		if (method === "GET") {
			writeJson(res, 200, { pending: service.listPending() });
			return;
		}
		if (method !== "POST") {
			writeJson(res, 405, { error: `method not allowed: ${method}` });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const id = typeof body.id === "string" && body.id !== "" ? body.id : "";
		const targetPersonaId = typeof body.targetPersonaId === "string" && body.targetPersonaId !== "" ? body.targetPersonaId : "";
		if (id === "" || targetPersonaId === "") {
			writeJson(res, 400, { error: "id 与 targetPersonaId 必填" });
			return;
		}
		try {
			if (!store.listPersonas().some((item) => item.id === targetPersonaId)) throw new HttpError(404, "人设不存在：" + targetPersonaId);
			writeJson(res, 200, { asset: service.assignPending(id, targetPersonaId) });
		} catch (error) {
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/routes/settings.ts
/** 构建运行时设置路由。
* @param store - 矩阵存储。
* @param reload - Apify 配置更新后重建数据源/调度器/路由的回调。
* @returns 路由数组。
*/
function makeSettingsRoutes(store, reload) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	return [route(XHS_API.settingsApify, async (req, res) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		if ((req.method ?? "GET") === "GET") {
			writeJson(res, 200, { settings: store.getSettings().apify });
			return;
		}
		if ((req.method ?? "GET") !== "PATCH") {
			writeJson(res, 405, { error: `method not allowed: ${req.method}` });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const payload = {};
		if (body.actorId !== void 0) {
			if (typeof body.actorId !== "string") {
				writeJson(res, 400, { error: "actorId 必须是字符串" });
				return;
			}
			payload.actorId = body.actorId;
		}
		if (body.apiToken !== void 0) {
			if (typeof body.apiToken !== "string") {
				writeJson(res, 400, { error: "apiToken 必须是字符串" });
				return;
			}
			payload.apiToken = body.apiToken;
		}
		if (body.maxItems !== void 0) {
			if (typeof body.maxItems !== "number" || !Number.isInteger(body.maxItems) || body.maxItems <= 0) {
				writeJson(res, 400, { error: "maxItems 必须是正整数" });
				return;
			}
			payload.maxItems = body.maxItems;
		}
		if (body.requestTimeoutMs !== void 0) {
			if (typeof body.requestTimeoutMs !== "number" || body.requestTimeoutMs <= 0) {
				writeJson(res, 400, { error: "requestTimeoutMs 必须是正数" });
				return;
			}
			payload.requestTimeoutMs = body.requestTimeoutMs;
		}
		if (body.maxPolls !== void 0) {
			if (typeof body.maxPolls !== "number" || !Number.isInteger(body.maxPolls) || body.maxPolls <= 0) {
				writeJson(res, 400, { error: "maxPolls 必须是正整数" });
				return;
			}
			payload.maxPolls = body.maxPolls;
		}
		try {
			const settings = store.updateApifySettings(payload);
			reload?.();
			writeJson(res, 200, { settings: settings.apify });
		} catch (error) {
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/studio.ts
/** 从模型输出中拆分正文与封面提示词；无标记时整段视为正文。 */
function parseCoverPrompt(text) {
	const index = text.indexOf("【封面提示词】");
	if (index < 0) return {
		copy: text.trim(),
		coverPrompt: ""
	};
	return {
		copy: text.slice(0, index).trim(),
		coverPrompt: text.slice(index + 7).trim()
	};
}
/** 第一阶段原始初稿的标记：标记前为可审计创作计划，标记后为需自然化的原始初稿。 */
const RAW_DRAFT_MARKER = "【草稿】";
/**
* 从第一阶段模型输出中拆分「可审计创作计划」与「原始初稿」。
* 无标记时将整段视为原始初稿（计划为空），用于非流式路径的防御性回退。
*/
function splitPlanDraft(text) {
	const index = text.indexOf(RAW_DRAFT_MARKER);
	if (index < 0) return {
		plan: "",
		rawDraft: text
	};
	return {
		plan: text.slice(0, index),
		rawDraft: text.slice(index + 4)
	};
}
/** 上下文估算的每字符 token 上界（用于可见的限制提示）。 */
const CHARS_PER_TOKEN = 3;
/** 只读取当前账号矩阵数据并组装为上下文；绝不复用主工作区内容。 */
function buildStudioContext(store, accountId, mode, maxInputChars) {
	const account = store.listAccounts().find((item) => item.id === accountId);
	if (account === void 0) throw new Error(`账号不存在：${accountId}`);
	const persona = store.listPersonas().find((item) => item.id === account.personaId);
	if (persona === void 0) throw new Error("该账号尚未分配人设");
	const notes = store.listPublishedNotes(account.personaId);
	const snapshots = store.listMetricSnapshots(accountId);
	const viralItems = store.listViralItems(account.personaId, "accepted");
	const writingStyles = persona.writingStyles ?? persona.hookStyles;
	const endingHookConstraints = persona.endingHookConstraints ?? persona.endingStyle;
	const endingHookExamples = persona.endingHookExamples ?? [];
	const forbiddenWords = persona.forbiddenWords ?? (persona.forbiddenExpressions !== void 0 ? persona.forbiddenExpressions.split(/[、,，\s]+/).filter((word) => word !== "") : void 0);
	const personaLines = [
		`【人设名称】${persona.name}`,
		persona.positioning !== void 0 ? `【账号定位】${persona.positioning}` : "",
		persona.audience !== void 0 ? `【目标受众】${persona.audience}` : "",
		persona.expertise !== void 0 ? `【擅长领域】${persona.expertise}` : "",
		persona.contentDirections !== void 0 ? `【内容方向】${persona.contentDirections}` : "",
		writingStyles !== void 0 && writingStyles.length > 0 ? `【写作风格】${writingStyles.join("、")}` : "",
		persona.bodyStructure !== void 0 ? `【正文结构】${persona.bodyStructure}` : "",
		endingHookConstraints !== void 0 ? `【结尾互动钩子约束】${endingHookConstraints}` : "",
		endingHookExamples.length > 0 ? `【结尾钩子最佳案例】${endingHookExamples.join("；")}` : "",
		forbiddenWords !== void 0 && forbiddenWords.length > 0 ? `【违禁词】${forbiddenWords.join("、")}` : "",
		persona.topicCriteria !== void 0 ? `【选题标准】${persona.topicCriteria}` : "",
		persona.defaultHashtags !== void 0 && persona.defaultHashtags.length > 0 ? `【默认话题】${persona.defaultHashtags.join(" ")}` : "",
		`【系统提示词】${persona.prompt}`
	].filter((line) => line !== "").join("\n");
	const noteLines = notes.map((note) => {
		const metric = snapshots.filter((snapshot) => snapshot.noteId === note.id).at(-1);
		const metricText = metric === void 0 ? "暂无指标" : `阅读 ${metric.reads} / 点赞 ${metric.likes} / 收藏 ${metric.favorites} / 评论 ${metric.comments}`;
		return `- 权重 ${note.weight} | ${note.title} | ${metricText}${note.sourceUrl !== void 0 ? ` | ${note.sourceUrl}` : ""}\n  ${note.copy.slice(0, 200)}`;
	});
	const viralLines = viralItems.slice(0, 20).map((item) => `- ${item.title}（${item.reasons.join("、")}）`);
	const positiveNotes = notes.filter((note) => note.weight >= 3);
	const negativeNotes = notes.filter((note) => note.weight === 0);
	const context = [
		`# 矩阵创作上下文（仅账号：${account.name}）`,
		"",
		"## 账号人设",
		personaLines,
		"",
		mode === "full" ? "## 已发布笔记知识库（完整）" : `## 已发布笔记知识库（${notes.length} 篇，优先高权重）`,
		noteLines.join("\n"),
		"",
		"## 已采纳爆款参考",
		viralLines.join("\n") || "（暂无已采纳爆款参考）",
		"",
		negativeNotes.length > 0 ? `## 负向经验（权重 0，应尽量避免同类型方向）\n${negativeNotes.map((note) => `- ${note.title}`).join("\n")}` : "",
		positiveNotes.length > 0 ? `## 高权重参考（权重 ≥3，优先借鉴其成功规律）\n${positiveNotes.map((note) => `- ${note.title}`).join("\n")}` : ""
	].filter((line) => line !== "").join("\n");
	if (maxInputChars !== void 0 && context.length > maxInputChars) return {
		context: "",
		truncated: true,
		warning: `上下文超出当前模型上限（约 ${Math.ceil(context.length / CHARS_PER_TOKEN)} token），请切换创作模式或减少知识库内容。`
	};
	return {
		context,
		truncated: false
	};
}
/** 同一请求 id 正在进行中（并发去重）。 */
var StudioBusyError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "StudioBusyError";
	}
};
/** 命中人设违禁词，禁止保存草稿。 */
var QualityBlockedError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "QualityBlockedError";
	}
};
/** 创作会话服务：两阶段生成、结构化流式事件与消息/草稿保存。 */
var StudioService = class {
	store;
	llm;
	quality;
	modelLabel;
	/** 进程内仅供进行中请求的去重 key；完成后从集合删除，禁止无界保存历史 requestId。 */
	inFlight = /* @__PURE__ */ new Set();
	constructor(store, llm, quality, modelLabel = "当前 Harness 模型") {
		this.store = store;
		this.llm = llm;
		this.quality = quality;
		this.modelLabel = modelLabel;
	}
	/** 指定请求 id 是否正在生成中（供路由在 SSE 建流前返回 409）。 */
	isInFlight(requestId) {
		return this.inFlight.has(requestId);
	}
	requireAccount(accountId) {
		const account = this.store.listAccounts().find((item) => item.id === accountId);
		if (account === void 0) throw new Error(`账号不存在：${accountId}`);
		return account;
	}
	/** 取账号当前（唯一）人设；未分配或已删除时阻止创作。 */
	requirePersona(personaId) {
		const persona = this.store.listPersonas().find((item) => item.id === personaId);
		if (persona === void 0) throw new Error("该账号尚未分配人设");
		return persona;
	}
	buildSystemPrompt(context) {
		return [
			context,
			"",
			"你是矩阵专属创作助手。只处理当前账号的小红书人设、已发布内容、爆款池参考、内容创作、文案创作与草稿编辑。",
			"不要读取或操作 DeepSeek Harness 主工作区的文件、会话或工具，也不要回答与矩阵创作无关的问题。",
			"参考爆款池中已采纳的爆款时只借鉴选题角度、结构和用户需求，不得复制原文、图片、独特经历，也不得仅替换词语改写。",
			"生成结果不会自动发布；草稿必须由用户明确保存后才会落库。",
			"【输出格式】先输出一份可审计的创作说明（目标受众、选题角度、正文结构、结尾钩子策略），然后另起一行输出【草稿】标记，再输出完整初稿。格式如下：",
			"【创作说明】<目标受众 / 选题角度 / 正文结构 / 结尾钩子策略>",
			"【草稿】",
			"<完整初稿正文>",
			"【封面提示词】<封面画面描述，100 字内，含主体/场景/风格/配色/文案字>"
		].join("\n");
	}
	buildMessages(history, input) {
		return [...history.map((message) => ({
			role: message.role,
			content: message.content
		})), {
			role: "user",
			content: input
		}];
	}
	/**
	* 阶段一：流式调用模型。只把【草稿】标记前的可审计创作计划作为 plan_delta 转发；
	* 标记后的原始初稿在服务端缓冲（不转发、不写会话），返回给阶段二自然化。
	*/
	async streamPhase1(request, onPlanDelta) {
		let rawDraft = "";
		let scratch = "";
		let markerFound = false;
		await this.llm.stream(request, (delta) => {
			if (markerFound) {
				rawDraft += delta;
				return;
			}
			scratch += delta;
			const markerIndex = scratch.indexOf(RAW_DRAFT_MARKER);
			if (markerIndex >= 0) {
				const plan = scratch.slice(0, markerIndex);
				if (plan !== "") onPlanDelta(plan);
				rawDraft += scratch.slice(markerIndex + 4);
				scratch = "";
				markerFound = true;
				return;
			}
			const holdLength = this.trailingMarkerPrefixLength(scratch);
			const emitLength = scratch.length - holdLength;
			if (emitLength > 0) {
				onPlanDelta(scratch.slice(0, emitLength));
				scratch = scratch.slice(emitLength);
			}
		});
		if (!markerFound && scratch !== "") onPlanDelta(scratch);
		return rawDraft;
	}
	/** 计算 text 尾部与标记前缀重叠的最大长度（不含完整标记本身）。 */
	trailingMarkerPrefixLength(text) {
		let best = 0;
		for (let k = 1; k < 4; k++) if (text.endsWith("【草稿】".slice(0, k))) best = k;
		return best;
	}
	buildEvidence(accountId, persona) {
		const notes = this.store.listPublishedNotes(persona.id);
		const viralItems = this.store.listViralItems(persona.id, "accepted");
		return {
			persona: persona.name,
			noteIds: notes.filter((note) => note.weight >= 3).map((note) => note.id),
			trendIds: viralItems.slice(0, 20).map((item) => item.id),
			reasons: [`基于账号人设、高权重历史内容与已采纳爆款参考生成；使用模型：${this.modelLabel}`]
		};
	}
	/** 追加用户消息，组装上下文（只读当前人设快照），两阶段生成，质量通过后保存助手消息。 */
	async send(accountId, input, mode, maxInputChars) {
		const account = this.requireAccount(accountId);
		const persona = this.requirePersona(account.personaId);
		const built = buildStudioContext(this.store, accountId, mode, maxInputChars);
		if (built.truncated) throw new Error(built.warning ?? "上下文超出限制");
		const history = this.store.listStudioMessages(accountId, persona.id);
		const messages = this.buildMessages(history, input);
		const system = this.buildSystemPrompt(built.context);
		const { rawDraft } = splitPlanDraft((await this.llm.complete({
			system,
			messages,
			maxTokens: 4e3
		})).text);
		const finalCopy = await this.quality.naturalizeStream(rawDraft, persona, () => {});
		const { report, allowed } = this.quality.check(finalCopy, persona);
		if (!allowed) throw new QualityBlockedError(`命中人设违禁词，禁止保存：${report.forbiddenWordHits.map((hit) => hit.word).join("、")}`);
		const { copy } = parseCoverPrompt(finalCopy);
		this.store.saveStudioMessage({
			accountId,
			role: "user",
			content: input,
			personaIdSnapshot: persona.id
		});
		return {
			message: this.store.saveStudioMessage({
				accountId,
				role: "assistant",
				content: copy,
				personaIdSnapshot: persona.id
			}),
			evidence: this.buildEvidence(accountId, persona)
		};
	}
	/**
	* 流式发送（两阶段）：捕获账号与人设快照 → 构建证据 → 流式计划并缓冲原始初稿 →
	* naturalizeStream 输出最终稿增量 → 确定性违禁词扫描 → 质量通过后一次性落库 user/assistant 与 requestId → done。
	* 历史只读取相同 accountId 且 personaIdSnapshot 等于当前人设的消息。
	*/
	async sendStream(accountId, input, mode, onEvent, options) {
		const requestId = options?.requestId;
		const maxInputChars = options?.maxInputChars;
		if (requestId !== void 0 && this.inFlight.has(requestId)) throw new StudioBusyError(`REQUEST_IN_PROGRESS: 同请求 id 正在生成中：${requestId}`);
		if (requestId !== void 0) {
			const persisted = this.store.listStudioMessagesByRequestId(accountId, requestId);
			if (persisted.length >= 2) {
				const done = this.buildDeduplicatedDone(accountId, persisted);
				onEvent(done);
				return { done };
			}
		}
		if (requestId !== void 0) this.inFlight.add(requestId);
		try {
			const account = this.requireAccount(accountId);
			const persona = this.requirePersona(account.personaId);
			const built = buildStudioContext(this.store, accountId, mode, maxInputChars);
			if (built.truncated) throw new Error(built.warning ?? "上下文超出限制");
			onEvent({
				type: "phase",
				phase: "planning"
			});
			const evidence = this.buildEvidence(accountId, persona);
			onEvent({
				type: "evidence",
				evidence
			});
			const history = this.store.listStudioMessages(accountId, persona.id);
			const messages = this.buildMessages(history, input);
			const system = this.buildSystemPrompt(built.context);
			onEvent({
				type: "phase",
				phase: "drafting"
			});
			const rawDraft = await this.streamPhase1({
				system,
				messages,
				maxTokens: 4e3
			}, (delta) => {
				onEvent({
					type: "plan_delta",
					delta
				});
			});
			onEvent({
				type: "phase",
				phase: "polishing"
			});
			const finalCopy = await this.quality.naturalizeStream(rawDraft, persona, (delta) => {
				onEvent({
					type: "content_delta",
					delta
				});
			});
			onEvent({
				type: "phase",
				phase: "checking"
			});
			const { report, allowed } = this.quality.check(finalCopy, persona);
			onEvent({
				type: "quality",
				report,
				allowed
			});
			if (!allowed) return { done: void 0 };
			const { copy, coverPrompt } = parseCoverPrompt(finalCopy);
			this.store.saveStudioMessage({
				accountId,
				role: "user",
				content: input,
				requestId,
				personaIdSnapshot: persona.id
			});
			const done = {
				type: "done",
				messageId: this.store.saveStudioMessage({
					accountId,
					role: "assistant",
					content: copy,
					requestId,
					personaIdSnapshot: persona.id
				}).id,
				coverPrompt,
				quality: report,
				evidence,
				personaId: persona.id
			};
			onEvent(done);
			return { done };
		} finally {
			if (requestId !== void 0) this.inFlight.delete(requestId);
		}
	}
	/** 完成态重放：不重新生成，返回 deduplicated 的 done（封面/质检信息不落库，从现有消息重建）。 */
	buildDeduplicatedDone(accountId, persisted) {
		const account = this.requireAccount(accountId);
		const persona = this.requirePersona(account.personaId);
		const assistant = persisted.find((message) => message.role === "assistant");
		const evidence = this.buildEvidence(accountId, persona);
		return {
			type: "done",
			messageId: assistant?.id ?? "",
			coverPrompt: "",
			quality: {
				reviewStatus: "unchecked",
				forbiddenWordHits: [],
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				personaSnapshot: persona.name
			},
			evidence,
			personaId: persona.id,
			deduplicated: true
		};
	}
	/** 保存一条草稿（含人设快照与轻量质检报告）；命中违禁词抛 QualityBlockedError，不落库。 */
	saveDraft(accountId, payload) {
		const account = this.requireAccount(accountId);
		const persona = this.requirePersona(account.personaId);
		const { report, allowed } = this.quality.check(payload.copy, persona);
		if (!allowed) throw new QualityBlockedError(`命中人设违禁词，禁止保存草稿：${report.forbiddenWordHits.map((hit) => hit.word).join("、")}`);
		const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const draft = this.store.saveDraft({
			accountId,
			date,
			copy: payload.copy,
			coverPrompt: payload.coverPrompt,
			personaIdSnapshot: persona.id,
			qualityReport: report
		});
		draft.evidence = payload.evidence;
		return draft;
	}
};
//#endregion
//#region src/routes/studio.ts
/** 写一条结构化 SSE 事件。 */
function writeSse(res, event) {
	res.write(`data: ${JSON.stringify(event)}\n\n`);
}
/**
* 构建 /studio 创作台路由。
* @param store - 矩阵存储。
* @param studio - 创作会话服务；未配置时发送/保存请求返回 400。
* @returns 路由数组。
*/
function makeStudioRoutes(store, studio) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	return [route(XHS_API.studioMessages, async (req, res) => {
		const method = req.method ?? "GET";
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		const accountId = queryParam(new URL(req.url ?? "/", "http://localhost"), "account");
		if (accountId === void 0) {
			writeJson(res, 400, { error: "account 查询参数必填" });
			return;
		}
		if (method === "GET") {
			const personaId = store.listAccounts().find((item) => item.id === accountId)?.personaId ?? "";
			writeJson(res, 200, { messages: store.listStudioMessages(accountId, personaId) });
			return;
		}
		if (method !== "POST") {
			writeJson(res, 405, { error: `method not allowed: ${method}` });
			return;
		}
		if (studio === void 0) {
			writeJson(res, 400, { error: "创作台未就绪" });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const input = typeof body.input === "string" && body.input.trim() !== "" ? body.input.trim() : "";
		const mode = body.mode === "full" ? "full" : "creative";
		const stream = body.stream === true;
		const requestId = typeof body.requestId === "string" && body.requestId !== "" ? body.requestId : void 0;
		if (input === "") {
			writeJson(res, 400, { error: "input 必填" });
			return;
		}
		if (stream) {
			if (requestId !== void 0 && studio.isInFlight(requestId)) {
				writeJson(res, 409, { error: "REQUEST_IN_PROGRESS: 相同请求正在进行中" });
				return;
			}
			res.writeHead(200, {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
				"x-accel-buffering": "no"
			});
			try {
				await studio.sendStream(accountId, input, mode, (event) => writeSse(res, event), { requestId });
			} catch (error) {
				writeSse(res, {
					type: "error",
					stage: "stream",
					retryable: true,
					message: error instanceof Error ? error.message : String(error)
				});
			} finally {
				res.end();
			}
			return;
		}
		try {
			const result = await studio.send(accountId, input, mode);
			writeJson(res, 201, {
				message: result.message,
				evidence: result.evidence,
				warning: result.warning
			});
		} catch (error) {
			if (error instanceof QualityBlockedError) {
				writeJson(res, 409, { error: "QUALITY_BLOCKED: " + error.message });
				return;
			}
			fail(res, error);
		}
	}), route(XHS_API.studio + "/draft", async (req, res) => {
		if (!guard(req, res, "POST")) return;
		if (studio === void 0) {
			writeJson(res, 400, { error: "创作台未就绪" });
			return;
		}
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 400, { error: "invalid JSON body" });
			return;
		}
		const accountId = typeof body.accountId === "string" ? body.accountId : "";
		const copy = typeof body.copy === "string" && body.copy.trim() !== "" ? body.copy : "";
		const coverPrompt = typeof body.coverPrompt === "string" ? body.coverPrompt : "";
		if (accountId === "" || copy === "") {
			writeJson(res, 400, { error: "accountId、copy 必填" });
			return;
		}
		try {
			writeJson(res, 201, { draft: studio.saveDraft(accountId, {
				copy,
				coverPrompt,
				evidence: body.evidence
			}) });
		} catch (error) {
			if (error instanceof QualityBlockedError) {
				writeJson(res, 409, { error: "QUALITY_BLOCKED: " + error.message });
				return;
			}
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/collector/rank.ts
function rankViralItems(persona, notes, items) {
	const writingStyles = persona.writingStyles ?? persona.hookStyles;
	const terms = [
		persona.name,
		persona.positioning,
		persona.expertise,
		persona.contentDirections,
		persona.topicCriteria,
		writingStyles?.join(" ") ?? ""
	].filter((item) => Boolean(item)).join(" ").toLowerCase();
	return items.map((item) => {
		const haystack = `${item.title} ${item.body ?? ""}`.toLowerCase();
		const reasons = [];
		let score = 0;
		if (terms !== "" && terms.split(/[,，、\s]+/).some((term) => term.length > 1 && haystack.includes(term))) {
			score += 35;
			reasons.push(`匹配${persona.name}的人设方向`);
		}
		if (notes.some((note) => note.weight >= 4 && (haystack.includes(note.title.toLowerCase()) || note.topic !== void 0 && haystack.includes(note.topic.toLowerCase())))) {
			score += 30;
			reasons.push("与账号高权重历史内容相近");
		}
		const engagement = (item.likes ?? 0) + (item.comments ?? 0);
		if (engagement > 0) {
			score += Math.min(25, Math.log10(engagement + 1) * 8);
			reasons.push("存在公开互动信号");
		}
		if (item.publishedAt !== void 0 && Date.now() - Date.parse(item.publishedAt) < 7 * 864e5) {
			score += 10;
			reasons.push("近期趋势");
		}
		return {
			...item,
			score: Math.round(score),
			reasons
		};
	}).sort((a, b) => b.score - a.score);
}
//#endregion
//#region src/routes/viral.ts
/** 合法审核状态。 */
const VIRAL_STATUSES$1 = [
	"pending",
	"accepted",
	"ignored"
];
/** 采集失败时的兜底错误文案。 */
const COLLECT_FAILED_MESSAGE = "爆款采集失败";
/**
* 构建 /viral 爆款池路由。
* @param store - 矩阵存储。
* @param provider - 爆款数据源；未配置时采集请求返回 400。
* @returns 路由数组。
*/
function makeViralRoutes(store, provider) {
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const service = new PersonaAssetService(store);
	return [
		route(XHS_API.viralManual, async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const personaId = typeof body.personaId === "string" && body.personaId !== "" ? body.personaId : "";
			const title = typeof body.title === "string" ? body.title.trim() : "";
			const bodyText = typeof body.body === "string" ? body.body.trim() : "";
			if (personaId === "" || title === "" || bodyText === "") {
				writeJson(res, 400, { error: "personaId、title 与 body 必填" });
				return;
			}
			try {
				resolvePersonaScope(store, void 0, personaId);
				const reasons = Array.isArray(body.reasons) ? body.reasons.filter((value) => typeof value === "string") : void 0;
				writeJson(res, 201, { item: service.addManualViral(personaId, {
					title,
					body: bodyText,
					sourceUrl: typeof body.sourceUrl === "string" && body.sourceUrl !== "" ? body.sourceUrl : void 0,
					publishedAt: typeof body.publishedAt === "string" && body.publishedAt !== "" ? body.publishedAt : void 0,
					reasons
				}) });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.viralTransfer, async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const personaId = typeof body.personaId === "string" && body.personaId !== "" ? body.personaId : "";
			const targetPersonaId = typeof body.targetPersonaId === "string" && body.targetPersonaId !== "" ? body.targetPersonaId : "";
			const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((value) => typeof value === "string") : [];
			if (personaId === "" || targetPersonaId === "" || itemIds.length === 0) {
				writeJson(res, 400, { error: "personaId、targetPersonaId 与 itemIds 必填" });
				return;
			}
			try {
				resolvePersonaScope(store, void 0, personaId);
				if (!store.listPersonas().some((item) => item.id === targetPersonaId)) throw new HttpError(404, "人设不存在：" + targetPersonaId);
				writeJson(res, 200, { items: service.transferVirals(personaId, itemIds, targetPersonaId) });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.viral, async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const method = req.method ?? "GET";
			const url = new URL(req.url ?? "/", "http://localhost");
			const accountId = queryParam(url, "account");
			const personaId = queryParam(url, "persona");
			if (method === "GET") {
				try {
					const resolved = resolvePersonaScope(store, accountId, personaId);
					let status;
					const statusRaw = queryParam(url, "status");
					if (statusRaw !== void 0) {
						if (!VIRAL_STATUSES$1.includes(statusRaw)) {
							writeJson(res, 400, { error: "status 必须是 pending/accepted/ignored" });
							return;
						}
						status = statusRaw;
					}
					if (resolved === "") {
						writeJson(res, 200, {
							batches: [],
							resolvedPersonaId: ""
						});
						return;
					}
					writeJson(res, 200, {
						batches: service.listBatches(resolved).map((batch) => ({
							...batch,
							items: service.listVirals(resolved, status, batch.id)
						})),
						resolvedPersonaId: resolved
					});
				} catch (error) {
					fail(res, error);
				}
				return;
			}
			if (method === "DELETE") {
				const batchId = queryParam(url, "batch");
				if (batchId === void 0 || accountId === void 0 && personaId === void 0) {
					writeJson(res, 400, { error: "batch 与 account/persona 查询参数必填" });
					return;
				}
				try {
					const resolved = resolvePersonaScope(store, accountId, personaId);
					if (resolved === "") {
						writeJson(res, 400, { error: "该账号尚未分配人设" });
						return;
					}
					if (!service.listBatches(resolved).some((batch) => batch.id === batchId)) {
						writeJson(res, 404, { error: "批次不存在或不属于该人设：" + batchId });
						return;
					}
					writeJson(res, 200, { deleted: service.deleteBatch(resolved, batchId) });
				} catch (error) {
					fail(res, error);
				}
				return;
			}
			if (method === "PATCH") {
				const itemId = queryParam(url, "item");
				if (itemId === void 0 || accountId === void 0 && personaId === void 0) {
					writeJson(res, 400, { error: "account/persona 与 item 查询参数必填" });
					return;
				}
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "invalid JSON body" });
					return;
				}
				const status = body.status;
				const weight = body.weight;
				const hasStatus = status === "accepted" || status === "ignored";
				if (!hasStatus && !(typeof weight === "number")) {
					writeJson(res, 400, { error: "status 必须是 accepted 或 ignored，或 weight 必须是 0-5 的整数" });
					return;
				}
				try {
					const resolved = resolvePersonaScope(store, accountId, personaId);
					if (resolved === "") {
						writeJson(res, 400, { error: "该账号尚未分配人设" });
						return;
					}
					if (hasStatus) {
						const item = service.reviewViral(resolved, itemId, status);
						if (status === "accepted" && provider?.fetchNoteDetail !== void 0 && item.body === "" && item.sourceUrl !== void 0) {
							const detail = await provider.fetchNoteDetail(item.sourceUrl).catch(() => void 0);
							if (detail !== void 0) {
								const persona = store.listPersonas().find((entry) => entry.id === resolved);
								if (persona !== void 0) {
									const best = rankViralItems(persona, store.listPublishedNotes(resolved), [detail])[0];
									store.updateViralItem(resolved, itemId, {
										title: detail.title,
										body: detail.body ?? "",
										score: best !== void 0 ? best.score : item.score,
										reasons: best !== void 0 ? best.reasons : item.reasons
									});
								} else store.updateViralItem(resolved, itemId, {
									title: detail.title,
									body: detail.body ?? ""
								});
							}
						}
						writeJson(res, 200, { item: service.listVirals(resolved).find((entry) => entry.id === itemId) ?? item });
						return;
					}
					const normalizedWeight = weight;
					if (!Number.isInteger(normalizedWeight) || normalizedWeight < 0 || normalizedWeight > 5) {
						writeJson(res, 400, { error: "weight 必须是 0-5 的整数" });
						return;
					}
					if (!service.listVirals(resolved).some((entry) => entry.id === itemId)) {
						writeJson(res, 404, { error: "爆款条目不存在或不属于该人设：" + itemId });
						return;
					}
					writeJson(res, 200, { item: service.setViralWeight(resolved, itemId, normalizedWeight) });
				} catch (error) {
					fail(res, error);
				}
				return;
			}
			if (method !== "POST") {
				writeJson(res, 405, { error: `method not allowed: ${method}` });
				return;
			}
			if (provider === void 0) {
				writeJson(res, 400, { error: "未配置爆款数据源" });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const targetAccountId = typeof body.accountId === "string" && body.accountId.trim() !== "" ? body.accountId : "";
			if (targetAccountId === "") {
				writeJson(res, 400, { error: "accountId 必填" });
				return;
			}
			const account = store.listAccounts().find((item) => item.id === targetAccountId);
			if (account === void 0) {
				writeJson(res, 400, { error: `账号不存在：${targetAccountId}` });
				return;
			}
			const persona = store.listPersonas().find((item) => item.id === account.personaId);
			if (persona === void 0) {
				writeJson(res, 400, { error: "该账号尚未分配人设" });
				return;
			}
			const query = typeof body.query === "string" && body.query.trim() !== "" ? body.query.trim() : persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name;
			const maxItems = typeof body.maxItems === "number" && body.maxItems > 0 ? body.maxItems : 10;
			try {
				const result = await provider.search({
					accountId: targetAccountId,
					query,
					maxItems
				});
				if (result.status === "failed") {
					writeJson(res, 502, { error: result.error ?? COLLECT_FAILED_MESSAGE });
					return;
				}
				let items = result.items;
				const fetchDetail = provider.fetchNoteDetail;
				if (fetchDetail !== void 0) items = await mapLimit(items, 3, async (item) => {
					if (item.sourceUrl === void 0 || (item.body ?? "") !== "") return item;
					return await fetchDetail(item.sourceUrl).catch(() => void 0) ?? item;
				});
				const ranked = rankViralItems(persona, store.listPublishedNotes(persona.id), items);
				const batchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
				const savedItems = ranked.map((item) => {
					const payload = {
						personaId: persona.id,
						sourceAccountId: targetAccountId,
						sourceAccountName: account.name,
						title: item.title,
						body: item.body ?? "",
						sourceUrl: item.sourceUrl,
						source: item.source === "manual" ? "manual" : "apify",
						publishedAt: item.publishedAt,
						score: item.score,
						reasons: item.reasons,
						status: "pending",
						batchId
					};
					return store.saveViralItem(payload);
				});
				writeJson(res, 201, {
					items: savedItems,
					batch: {
						id: batchId,
						accountId: targetAccountId,
						collectedAt: savedItems[0]?.collectedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
						itemCount: savedItems.length
					}
				});
			} catch (error) {
				fail(res, error);
			}
		})
	];
}
/** 并发受限的 map：同一时刻最多 limit 个异步任务，保持结果顺序。 */
async function mapLimit(items, limit, fn) {
	const results = new Array(items.length);
	let index = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (index < items.length) {
			const current = index++;
			results[current] = await fn(items[current]);
		}
	});
	await Promise.all(workers);
	return results;
}
//#endregion
//#region src/routes/index.ts
/**
* 构建 /api/dsh-xhs-matrix 路由。
* @param deps - 存储与可选依赖。
* @returns 路由数组。
*/
function makeRoutes(deps) {
	const { store, scheduler, reload, viralProvider, studio } = deps;
	return [
		...makeSettingsRoutes(store, reload),
		...makeAccountsRoutes(store),
		...makePersonasRoutes(store),
		...makeKnowledgeRoutes(store, scheduler),
		...makeViralRoutes(store, viralProvider),
		...makeDraftsRoutes(store),
		...makeStudioRoutes(store, studio)
	];
}
//#endregion
//#region src/composer.ts
/**
* 拼接创作简报 markdown。
* @param persona - 人设（唯一内容所有者；使用 v4 字段：writingStyles/endingHookConstraints/endingHookExamples/forbiddenWords）。
* @param viralItems - 该人设共享爆款池参考（pending/accepted），作为素材来源；按 weight DESC、score DESC 排序。
* @param accountName - 可选账号名（仅用于简报标题展示，不参与归属）。
* @returns 简报文本。
*/
function composeBrief(persona, viralItems, accountName) {
	const ranked = [...viralItems].sort((a, b) => b.weight - a.weight || b.score - a.score);
	const viralLines = ranked.length === 0 ? ["（该账号暂无爆款池参考）"] : ranked.map((item) => `- ${item.title}（权重 ${item.weight}；推荐分 ${item.score}；理由：${item.reasons.join("、")}）${item.sourceUrl !== void 0 ? `｜${item.sourceUrl}` : ""}`);
	const writingStyles = persona.writingStyles !== void 0 && persona.writingStyles.length > 0 ? persona.writingStyles.join("、") : "未设置";
	const endingHook = persona.endingHookConstraints ?? "未设置";
	const hookExamples = persona.endingHookExamples !== void 0 && persona.endingHookExamples.length > 0 ? persona.endingHookExamples.join("；") : "未设置";
	const forbiddenWords = persona.forbiddenWords !== void 0 && persona.forbiddenWords.length > 0 ? persona.forbiddenWords.join("、") : "无";
	return [
		`【账号】${accountName ?? "当前账号"}（${persona.name}）`,
		`【人设】${persona.prompt}`,
		`【写作风格】${writingStyles}`,
		`【结尾互动钩子】${endingHook}`,
		`【钩子最佳案例】${hookExamples}`,
		`【违禁词】${forbiddenWords}`,
		`【爆款池参考】`,
		...viralLines,
		`【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`
	].join("\n");
}
//#endregion
//#region src/events.ts
/** 发射反馈事件。 */
function emitFeedback(ctx, event) {
	ctx.emit("xhs/feedback", event);
}
//#endregion
//#region src/tools.ts
function text(value) {
	return [{
		type: "text",
		text: value
	}];
}
/** 渲染一条工具结果。 */
function render(result) {
	const lines = [result.ok ? "✅ " : "⚠️ " + result.message];
	if (result.ok && result.message !== "") lines[0] = result.message;
	return text(lines.join("\n"));
}
/** 今日日期（YYYY-MM-DD，本地时区）。 */
function today() {
	const now = /* @__PURE__ */ new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
/** 合法爆款审核状态。 */
const VIRAL_STATUSES = [
	"pending",
	"accepted",
	"ignored"
];
/**
* 构建 模型工具。
* @param deps - 存储与上下文。
* @returns 工具定义数组。
*/
function makeTools(deps) {
	const { store, ctx } = deps;
	const service = new PersonaAssetService(store);
	const accountsOf = () => {
		return store.listAccounts().filter((a) => a.enabled);
	};
	const personaOf = (personaId) => store.listPersonas().find((p) => p.id === personaId);
	/** 人设作用域解析（账号兼容 + 直接人设查询）：冲突时返回 error，由调用方渲染。 */
	const resolveToolScope = (args) => {
		const hasAccount = args.accountId !== void 0 && args.accountId !== "";
		const hasPersona = args.personaId !== void 0 && args.personaId !== "";
		if (!hasAccount && !hasPersona) return { error: "accountId 或 personaId 必填" };
		if (hasPersona && !store.listPersonas().some((p) => p.id === args.personaId)) return { error: "人设不存在：" + args.personaId };
		let accountPersona = "";
		if (hasAccount) {
			const account = store.listAccounts().find((a) => a.id === args.accountId);
			if (account === void 0) return { error: "账号不存在：" + args.accountId };
			accountPersona = account.personaId;
		}
		if (hasAccount && hasPersona && accountPersona !== args.personaId) return { error: "account 与 persona 不一致：账号属于 " + (accountPersona === "" ? "（未分配）" : accountPersona) + "，而非 " + args.personaId };
		return { personaId: hasPersona ? args.personaId : accountPersona };
	};
	return [
		defineTool({
			name: "xhs_today",
			description: "今日决策：为每个（或指定）未发账号生成创作简报（人设 + 爆款池参考）。简报返回后，直接按简报撰写小红书文案（标题 + 正文 + 话题标签）与封面提示词，再用 xhs_draft_save 保存。触发词：今天要发什么、选题、小红书矩阵。",
			parameters: { account: {
				type: "string",
				description: "账号 id（省略则处理全部启用账号）"
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						briefs: {
							type: "array",
							required: true,
							items: { type: "string" }
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				const accounts = args.account !== void 0 ? accountsOf().filter((a) => a.id === args.account) : accountsOf();
				if (accounts.length === 0) return {
					ok: false,
					message: "未配置启用账号：请先在「矩阵」面板创建账号并分配人设。",
					briefs: []
				};
				const todayDrafts = store.listDrafts().filter((d) => d.date === today());
				const briefs = [];
				const skipped = [];
				for (const account of accounts) {
					const persona = personaOf(account.personaId);
					if (persona === void 0) {
						skipped.push(`${account.name}（未分配人设）`);
						continue;
					}
					if (todayDrafts.some((d) => d.accountId === account.id)) {
						skipped.push(`${account.name}（今日已生成）`);
						continue;
					}
					const viralItems = store.listViralItems(account.personaId, "accepted");
					if (viralItems.length === 0) {
						skipped.push(`${account.name}（爆款池为空，请先在「矩阵」面板采集爆款）`);
						continue;
					}
					briefs.push(composeBrief(persona, viralItems, account.name));
				}
				if (briefs.length === 0) return {
					ok: false,
					message: `今日无可生成内容${skipped.length > 0 ? `：${skipped.join("，")}` : ""}。请采集爆款或检查账号人设。`,
					briefs: []
				};
				return {
					ok: true,
					message: skipped.length > 0 ? `已生成 ${briefs.length} 份创作简报（跳过：${skipped.join("；")}）` : `已生成 ${briefs.length} 份创作简报`,
					briefs
				};
			}
		}),
		defineTool({
			name: "xhs_draft_save",
			description: "保存草稿：按 xhs_today 简报撰写的文案与封面提示词落库。同账号 + 当日已存在草稿时拒绝（除非 force: true 覆盖）；落库前执行与创作台一致的人设违禁词质量门。",
			parameters: {
				accountId: {
					type: "string",
					required: true,
					description: "账号 id"
				},
				copy: {
					type: "string",
					required: true,
					description: "完整文案（标题 + 正文 + 话题标签）"
				},
				coverPrompt: {
					type: "string",
					required: true,
					description: "封面提示词"
				},
				force: {
					type: "boolean",
					description: "同账号当日已存在草稿时强制覆盖"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						draftId: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => render(value)
			},
			async execute(args, _exec) {
				for (const field of [
					"accountId",
					"copy",
					"coverPrompt"
				]) {
					const value = args[field];
					if (typeof value !== "string" || value.trim() === "") return {
						ok: false,
						message: `参数 ${field} 必填`,
						draftId: ""
					};
				}
				const account = store.listAccounts().find((a) => a.id === args.accountId);
				if (account === void 0) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					draftId: ""
				};
				const persona = personaOf(account.personaId);
				if (persona !== void 0) {
					const forbiddenWords = persona.forbiddenWords ?? splitLegacyForbidden(persona.forbiddenExpressions) ?? [];
					const hits = scanForbiddenWords(args.copy, forbiddenWords);
					if (hits.length > 0) return {
						ok: false,
						message: `命中人设违禁词，禁止保存草稿：${hits.map((h) => h.word).join("、")}（位置 ${hits.map((h) => h.position).join(",")}）`,
						draftId: ""
					};
				}
				const date = today();
				const existing = store.findDraft(args.accountId, date);
				if (existing !== void 0 && args.force !== true) return {
					ok: false,
					message: `该账号当日已存在草稿（${existing.id}），如确需覆盖请传 force: true。`,
					draftId: existing.id
				};
				if (existing !== void 0) store.deleteDraft(existing.id);
				const qualityReport = persona !== void 0 ? {
					reviewStatus: "passed",
					forbiddenWordHits: [],
					checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
					personaSnapshot: persona.name
				} : void 0;
				const draft = store.saveDraft({
					accountId: args.accountId,
					date,
					copy: args.copy,
					coverPrompt: args.coverPrompt,
					personaIdSnapshot: persona?.id,
					qualityReport
				});
				return {
					ok: true,
					message: `草稿已保存：${draft.id}（${date}）`,
					draftId: draft.id
				};
			}
		}),
		defineTool({
			name: "xhs_virals",
			description: "查询爆款池条目（标题/正文/来源链接/审核状态/推荐分/理由），可按审核状态过滤。支持直接按 personaId 查询，或按 accountId 兼容解析账号当前人设。爆款池是创作简报的素材来源。",
			parameters: {
				accountId: {
					type: "string",
					description: "账号 id（兼容：解析账号当前人设）"
				},
				personaId: {
					type: "string",
					description: "人设 id（直接按人设查询）"
				},
				status: {
					type: "string",
					description: "审核状态过滤：pending/accepted/ignored"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						items: {
							type: "array",
							required: true,
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									id: { type: "string" },
									title: { type: "string" },
									body: { type: "string" },
									sourceUrl: { type: "string" },
									status: { type: "string" },
									score: { type: "number" },
									reasons: {
										type: "array",
										items: { type: "string" }
									}
								}
							}
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				if (args.status !== void 0 && !VIRAL_STATUSES.includes(args.status)) return {
					ok: false,
					message: `status 必须是 pending/accepted/ignored：${args.status}`,
					items: []
				};
				const resolved = resolveToolScope({
					accountId: args.accountId,
					personaId: args.personaId
				});
				if ("error" in resolved) return {
					ok: false,
					message: resolved.error,
					items: []
				};
				const status = args.status;
				const items = service.listVirals(resolved.personaId, status).map((item) => ({
					id: item.id,
					title: item.title,
					body: item.body,
					sourceUrl: item.sourceUrl,
					status: item.status,
					score: item.score,
					reasons: item.reasons
				}));
				return {
					ok: true,
					message: (items.length === 0 ? ["该人设爆款池为空"] : items.map((item) => `${item.id}\t${item.status}\t分数 ${item.score}\t${item.title}${item.sourceUrl !== void 0 ? `\t${item.sourceUrl}` : ""}`)).join("\n"),
					items
				};
			}
		}),
		defineTool({
			name: "xhs_viral_add",
			description: "手动向指定人设新增爆款笔记（至少标题 + 正文；来源链接与发布时间可选）。手动爆款默认已采纳且权重为 5，立即作为创作参考。",
			parameters: {
				personaId: {
					type: "string",
					required: true,
					description: "人设 id"
				},
				title: {
					type: "string",
					required: true,
					description: "标题"
				},
				body: {
					type: "string",
					required: true,
					description: "正文"
				},
				sourceUrl: {
					type: "string",
					description: "来源链接"
				},
				publishedAt: {
					type: "string",
					description: "发布时间（YYYY-MM-DD）"
				},
				reasons: {
					type: "array",
					items: { type: "string" },
					description: "推荐理由"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						item: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string" },
								personaId: { type: "string" },
								title: { type: "string" },
								sourceUrl: { type: "string" },
								status: { type: "string" },
								weight: { type: "number" },
								source: { type: "string" }
							}
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				const personaId = typeof args.personaId === "string" ? args.personaId.trim() : "";
				const title = typeof args.title === "string" ? args.title.trim() : "";
				const body = typeof args.body === "string" ? args.body.trim() : "";
				if (personaId === "" || title === "" || body === "") return {
					ok: false,
					message: "personaId、title 与 body 必填",
					item: void 0
				};
				if (!store.listPersonas().some((p) => p.id === personaId)) return {
					ok: false,
					message: "人设不存在：" + personaId,
					item: void 0
				};
				const item = service.addManualViral(personaId, {
					title,
					body,
					sourceUrl: typeof args.sourceUrl === "string" && args.sourceUrl !== "" ? args.sourceUrl : void 0,
					publishedAt: typeof args.publishedAt === "string" && args.publishedAt !== "" ? args.publishedAt : void 0,
					reasons: Array.isArray(args.reasons) ? args.reasons.filter((v) => typeof v === "string") : void 0
				});
				return {
					ok: true,
					message: `手动爆款已保存：${item.id}（已采纳，权重 5）`,
					item: {
						id: item.id,
						personaId: item.personaId,
						title: item.title,
						sourceUrl: item.sourceUrl,
						status: item.status,
						weight: item.weight,
						source: item.source
					}
				};
			}
		}),
		defineTool({
			name: "xhs_pending_ownership",
			description: "查询待归属数据（迁移时无法解析人位的知识库/爆款条目），并按 targetPersonaId 显式归属。传 id + targetPersonaId 时把该记录移入目标人设，否则列出全部待归属记录。",
			parameters: {
				id: {
					type: "string",
					description: "待归属记录 id（归属时必填）"
				},
				targetPersonaId: {
					type: "string",
					description: "目标人设 id（归属时必填）"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						pending: {
							type: "array",
							required: true,
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									id: { type: "string" },
									kind: { type: "string" },
									reason: { type: "string" }
								}
							}
						},
						asset: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string" },
								personaId: { type: "string" }
							}
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				if (args.id !== void 0 && args.id !== "" && args.targetPersonaId !== void 0 && args.targetPersonaId !== "") {
					if (!store.listPersonas().some((p) => p.id === args.targetPersonaId)) return {
						ok: false,
						message: "人设不存在：" + args.targetPersonaId,
						pending: [],
						asset: void 0
					};
					try {
						const asset = service.assignPending(args.id, args.targetPersonaId);
						return {
							ok: true,
							message: `已归属 ${asset.id} 到人设 ${args.targetPersonaId}`,
							pending: [],
							asset: {
								id: asset.id,
								personaId: asset.personaId
							}
						};
					} catch (error) {
						return {
							ok: false,
							message: error instanceof Error ? error.message : String(error),
							pending: [],
							asset: void 0
						};
					}
				}
				const pending = service.listPending().map((entry) => ({
					id: entry.id,
					kind: entry.kind,
					reason: entry.reason
				}));
				return {
					ok: true,
					message: (pending.length === 0 ? ["暂无待归属记录"] : pending.map((p) => `${p.id}\t${p.kind}\t${p.reason}`)).join("\n"),
					pending,
					asset: void 0
				};
			}
		}),
		defineTool({
			name: "xhs_accounts",
			description: "查询账号与人设清单（只读；账号/人设的增删改请在「矩阵」面板进行）。",
			parameters: {},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						accounts: {
							type: "array",
							required: true,
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									id: { type: "string" },
									name: { type: "string" },
									personaId: { type: "string" },
									enabled: { type: "boolean" }
								}
							}
						},
						personas: {
							type: "array",
							required: true,
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									id: { type: "string" },
									name: { type: "string" }
								}
							}
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(_args, _exec) {
				const accounts = store.listAccounts().map((a) => ({
					id: a.id,
					name: a.name,
					personaId: a.personaId,
					enabled: a.enabled
				}));
				const personas = store.listPersonas().map((p) => ({
					id: p.id,
					name: p.name
				}));
				return {
					ok: true,
					message: accounts.length === 0 ? "未配置账号" : accounts.map((a) => `${a.id}\t${a.name}\t人设:${a.personaId}\t${a.enabled ? "启用" : "停用"}`).join("\n"),
					accounts,
					personas
				};
			}
		}),
		defineTool({
			name: "xhs_draft_status",
			description: "回填草稿发布状态与流量指标：标记 published（可带阅读量/点赞/评论）或 dropped。published + metrics 会触发 xhs/feedback 事件（进化闭环数据源）。",
			parameters: {
				draftId: {
					type: "string",
					required: true,
					description: "草稿 id"
				},
				status: {
					type: "string",
					required: true,
					enum: ["published", "dropped"],
					description: "发布 / 弃用"
				},
				metrics: {
					type: "object",
					additionalProperties: false,
					description: "流量指标（published 时建议提供）",
					properties: {
						reads: {
							type: "number",
							required: true
						},
						likes: {
							type: "number",
							required: true
						},
						comments: {
							type: "number",
							required: true
						},
						collected: {
							type: "string",
							required: true,
							description: "采集时间 ISO"
						}
					}
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						draftId: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => render(value)
			},
			async execute(args, _exec) {
				const draft = store.setDraftStatus(args.draftId, args.status, args.metrics);
				if (args.status === "published" && args.metrics !== void 0) emitFeedback(ctx, {
					draftId: draft.id,
					accountId: draft.accountId,
					metrics: args.metrics
				});
				return {
					ok: true,
					message: `草稿 ${draft.id} 已标记为 ${args.status === "published" ? "已发布" : "已弃用"}` + (args.metrics !== void 0 ? `（阅读 ${args.metrics.reads}）` : ""),
					draftId: draft.id
				};
			}
		}),
		defineTool({
			name: "xhs_notes",
			description: "查询已发布笔记知识库（含标题、权重、最近指标摘要）。支持直接按 personaId 查询，或按 accountId 兼容解析账号当前人设。",
			parameters: {
				accountId: {
					type: "string",
					description: "账号 id（兼容：解析账号当前人设）"
				},
				personaId: {
					type: "string",
					description: "人设 id（直接按人设查询）"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						notes: {
							type: "array",
							required: true,
							items: { type: "string" }
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				const resolved = resolveToolScope({
					accountId: args.accountId,
					personaId: args.personaId
				});
				if ("error" in resolved) return {
					ok: false,
					message: resolved.error,
					notes: []
				};
				const notes = service.listNotes(resolved.personaId);
				const accountId = args.accountId;
				const lines = notes.length === 0 ? ["该人设还没有已发布笔记"] : notes.map((note) => {
					const metric = accountId !== void 0 ? store.listMetricSnapshots(accountId, note.id).at(-1) : void 0;
					return `${note.id}\t权重 ${note.weight}\t${note.title}${metric !== void 0 ? `\t阅读 ${metric.reads}` : ""}`;
				});
				return {
					ok: true,
					message: lines.join("\n"),
					notes: lines
				};
			}
		}),
		defineTool({
			name: "xhs_collection_status",
			description: "查询指定账号的指标采集状态（running/success/failed、最近成功时间、错误）。",
			parameters: { accountId: {
				type: "string",
				required: true,
				description: "账号 id"
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						},
						status: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => render(value)
			},
			isConcurrencySafe: () => true,
			async execute(args, _exec) {
				const account = store.listAccounts().find((item) => item.id === args.accountId);
				if (account === void 0) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					status: "unknown"
				};
				const status = account.collectionStatus ?? {
					running: false,
					lastStatus: "idle"
				};
				const parts = [`状态：${status.running ? "采集中" : status.lastStatus}`];
				if (status.lastSuccessAt !== void 0) parts.push(`最近成功：${status.lastSuccessAt}`);
				if (status.lastError !== void 0) parts.push(`错误：${status.lastError}`);
				return {
					ok: true,
					message: parts.join("；"),
					status: status.lastStatus
				};
			}
		})
	];
}
//#endregion
//#region src/index.ts
/** 稳定插件名。 */
const name = "xhs-matrix";
/** 需要的服务。 */
const inject = [
	"webServer",
	"tools",
	"systemPrompt",
	"llm",
	"settings"
];
/** 设置命名空间。 */
const XHS_SETTINGS_NAMESPACE = settingsNamespace("dsh-xhs-matrix");
const Config = z.object({
	locale: z.string().default("zh-CN"),
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true)
});
/** 模型可见公告。 */
const XHS_GUIDANCE = "本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、已发布知识库、爆款池、草稿与专属创作台。能力：xhs_today 按账号人设与爆款池生成创作简报供你撰写文案；xhs_notes 查询账号已发布笔记知识库；xhs_virals 查询账号爆款池条目与审核状态；xhs_collection_status 查询指标采集状态；xhs_draft_save 持久化草稿（同账号当日去重）；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题 / 爆款」时即指本插件。";
/**
* 构建创作台模型客户端：模型解析失败（未配置 agent-default-model 且存在注册 provider）时，
* 仅让创作台在调用 complete 时给出明确错误，插件照常加载，其余功能（路由/工具/公告/
* 爆款池/知识库/草稿/账号）不受影响。
* @param resolveModel - 读取 agent-default-model 设置的处理器；未配置时返回 undefined。
* @param listProviders - 列出已注册 provider。
* @param stream - 底层 llm.stream 调用入口。
* @returns 模型客户端与模型标签。
*/
function buildStudioLlmClient(resolveModel, listProviders, stream) {
	let modelRoute;
	try {
		modelRoute = resolveStudioModel(resolveModel, listProviders);
	} catch {
		modelRoute = void 0;
	}
	if (modelRoute === void 0) {
		const notConfigured = async () => {
			throw new Error("未配置创作台模型：请在 Harness 设置 agent-default-model（provider 与 model）");
		};
		return {
			client: {
				complete: notConfigured,
				stream: async () => {
					await notConfigured();
					return "";
				}
			},
			modelLabel: "未配置"
		};
	}
	return {
		client: {
			async complete(request) {
				return { text: await runModelStream(stream, request, modelRoute) };
			},
			async stream(request, onDelta) {
				return runModelStream(stream, request, modelRoute, onDelta);
			}
		},
		modelLabel: `${modelRoute.provider}/${modelRoute.model}`
	};
}
/** 消息映射 + 流式调用 + 文本拼接；onDelta 可选（非流式调用传空）。 */
function runModelStream(stream, request, modelRoute, onDelta) {
	const messages = request.messages.map((message) => message.role === "assistant" ? createAssistantMessage({
		content: [{
			type: "text",
			text: message.content
		}],
		source: {
			provider: modelRoute.provider,
			model: modelRoute.model
		}
	}) : createUserMessage({
		content: [{
			type: "text",
			text: message.content
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-xhs-matrix"
		}
	}));
	const options = {
		provider: modelRoute.provider,
		model: modelRoute.model,
		messages,
		system: request.system,
		maxTokens: request.maxTokens
	};
	const assembler = new BlockAssembler();
	return (async () => {
		for await (const chunk of stream(options)) {
			if (chunk.type === "text-delta" && onDelta !== void 0) onDelta(chunk.text);
			assembler.push(chunk);
		}
		const finish = assembler.finish;
		if (finish.kind !== "stop") {
			const failure = "failure" in finish ? finish.failure : void 0;
			const detail = failure ? `${failure.message}${failure.code ? `（${failure.code}）` : ""}` : void 0;
			throw new Error(`创作台模型调用未正常结束：finish ${finish.kind}${detail ? "：" + detail : ""}`);
		}
		return assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("");
	})();
}
/**
* 挂载存储、路由、工具与公告。
* @param ctx - host 上下文（webServer/tools/systemPrompt/llm）。
* @param config - 插件配置。
*/
function apply(ctx, config) {
	let current = () => config ?? {};
	const resolve = () => ({
		locale: current().locale ?? "zh-CN",
		announceToAgent: current().announceToAgent ?? true,
		enabled: current().enabled ?? true
	});
	const store = new MatrixStore();
	store.load();
	let disposeRoutes;
	let disposeTools;
	let disposeSection;
	let disposeScheduler;
	const sync = () => {
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		if (disposeTools !== void 0) {
			disposeTools();
			disposeTools = void 0;
		}
		if (disposeScheduler !== void 0) {
			disposeScheduler();
			disposeScheduler = void 0;
		}
		const value = resolve();
		if (!value.enabled) return;
		if (value.announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:dsh-xhs-matrix",
			order: 150,
			text: XHS_GUIDANCE
		});
		const { client: llmClient, modelLabel } = buildStudioLlmClient(() => {
			try {
				const m = ctx.settings.get(settingsNamespace("agent-default-model"));
				return m !== void 0 && m.provider !== void 0 && m.model !== void 0 ? {
					provider: m.provider,
					model: m.model
				} : void 0;
			} catch {
				return;
			}
		}, () => ctx.llm.listProviders().map((p) => ({ id: p.id })), (options) => ctx.llm.stream(options));
		const quality = createQualityService(llmClient);
		const studio = new StudioService(store, llmClient, quality, modelLabel);
		const apifyStore = store.getSettings().apify;
		const viralProvider = apifyStore.actorId !== "" && apifyStore.apiToken !== "" ? new ApifyViralProvider({
			actorId: apifyStore.actorId,
			apiToken: apifyStore.apiToken,
			maxItems: apifyStore.maxItems,
			requestTimeoutMs: apifyStore.requestTimeoutMs,
			maxPolls: apifyStore.maxPolls
		}) : void 0;
		let scheduler;
		if (viralProvider !== void 0) {
			scheduler = new CollectionScheduler({
				store,
				provider: viralProvider
			});
			scheduler.start();
		}
		disposeScheduler = () => scheduler?.stop();
		disposeRoutes = ctx.effect(() => {
			const disposers = makeRoutes({
				store,
				viralProvider,
				scheduler,
				studio,
				reload: sync
			}).map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-xhs-matrix: routes");
		disposeTools = ctx.effect(() => {
			const disposers = makeTools({
				store,
				ctx
			}).map((tool) => ctx.tools.register(tool));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-xhs-matrix: tools");
	};
	installSettingsSection(ctx, XHS_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
			sync();
		},
		onChange: sync
	});
	sync();
}
//#endregion
export { Config, XHS_GUIDANCE, XHS_SETTINGS_NAMESPACE, apply, buildStudioLlmClient, inject, name };
