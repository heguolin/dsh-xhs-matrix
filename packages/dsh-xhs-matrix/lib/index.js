import { t as MatrixStore } from "./store-DNTV5dLk.js";
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
			return {
				items: items.slice(0, limit).map((item) => normalizeApifyItem(item)),
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
		const notes = this.store.listPublishedNotes(accountId);
		if (result.status === "failed") {
			for (const note of notes) this.store.saveMetricSnapshot({
				accountId,
				noteId: note.id,
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
	viral: "/api/dsh-xhs-matrix/viral",
	metrics: "/api/dsh-xhs-matrix/metrics",
	studio: "/api/dsh-xhs-matrix/studio",
	studioMessages: "/api/dsh-xhs-matrix/studio/messages",
	drafts: "/api/dsh-xhs-matrix/drafts"
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
/** 把错误渲染为 400 响应。 */
function fail(res, error) {
	writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
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
			const { applyPublishedNoteImport, parsePublishedNoteImport } = await import("./importer-BNC8icWK.js");
			const records = parsePublishedNoteImport(body.content, body.format);
			applyPublishedNoteImport(store, body.accountId, records);
			writeJson(res, 201, { imported: records.length });
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
			writeJson(res, 200, { draft: store.setDraftStatus(draftId, status, metrics) });
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
	return [
		route(XHS_API.notes, async (req, res) => {
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
				writeJson(res, 200, { notes: store.listPublishedNotes(accountId) });
				return;
			}
			if (method !== "PATCH") {
				writeJson(res, 405, { error: `method not allowed: ${method}` });
				return;
			}
			if (accountId === void 0 || noteId === void 0) {
				writeJson(res, 400, { error: "account 与 note 查询参数必填" });
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
				writeJson(res, 200, { note: store.setNoteWeight(accountId, noteId, weight) });
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
				store.deletePersona(id);
				writeJson(res, 200, { ok: true });
			} else writeJson(res, 405, { error: `method not allowed: ${method}` });
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
//#region src/routes/studio.ts
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
			writeJson(res, 200, { messages: store.listStudioMessages(accountId) });
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
		if (input === "") {
			writeJson(res, 400, { error: "input 必填" });
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
			fail(res, error);
		}
	})];
}
//#endregion
//#region src/collector/rank.ts
function rankViralItems(account, persona, notes, items) {
	const terms = [
		persona.name,
		persona.positioning,
		persona.expertise,
		persona.contentDirections,
		persona.topicCriteria,
		persona.hookStyles?.join(" ")
	].filter((item) => Boolean(item)).join(" ").toLowerCase();
	return items.map((item) => {
		const haystack = `${item.title} ${item.body ?? ""}`.toLowerCase();
		const reasons = [];
		let score = 0;
		if (terms !== "" && terms.split(/[,，、\s]+/).some((term) => term.length > 1 && haystack.includes(term))) {
			score += 35;
			reasons.push(`匹配${account.name}的人设方向`);
		}
		if (notes.some((note) => note.accountId === account.id && note.weight >= 4 && (haystack.includes(note.title.toLowerCase()) || note.topic !== void 0 && haystack.includes(note.topic.toLowerCase())))) {
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
	return [route(XHS_API.viral, async (req, res) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return;
		}
		const method = req.method ?? "GET";
		const url = new URL(req.url ?? "/", "http://localhost");
		const accountId = queryParam(url, "account");
		if (method === "GET") {
			if (accountId === void 0) {
				writeJson(res, 400, { error: "account 查询参数必填" });
				return;
			}
			let status;
			const statusRaw = queryParam(url, "status");
			if (statusRaw !== void 0) {
				if (!VIRAL_STATUSES$1.includes(statusRaw)) {
					writeJson(res, 400, { error: "status 必须是 pending/accepted/ignored" });
					return;
				}
				status = statusRaw;
			}
			writeJson(res, 200, { items: store.listViralItems(accountId, status) });
			return;
		}
		if (method === "PATCH") {
			const itemId = queryParam(url, "item");
			if (accountId === void 0 || itemId === void 0) {
				writeJson(res, 400, { error: "account 与 item 查询参数必填" });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const status = body.status;
			if (status !== "accepted" && status !== "ignored") {
				writeJson(res, 400, { error: "status 必须是 accepted 或 ignored" });
				return;
			}
			try {
				writeJson(res, 200, { item: store.reviewViralItem(accountId, itemId, status) });
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
			writeJson(res, 201, { items: rankViralItems(account, persona, store.listPublishedNotes(targetAccountId), result.items).map((item) => {
				const payload = {
					accountId: targetAccountId,
					title: item.title,
					body: item.body ?? "",
					sourceUrl: item.sourceUrl,
					source: item.source === "manual" ? "manual" : "apify",
					publishedAt: item.publishedAt,
					score: item.score,
					reasons: item.reasons,
					status: "pending"
				};
				return store.saveViralItem(payload);
			}) });
		} catch (error) {
			fail(res, error);
		}
	})];
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
//#region src/studio.ts
/** 上下文估算的每字符 token 上界（用于可见的限制提示）。 */
const CHARS_PER_TOKEN = 3;
/** 只读取当前账号矩阵数据并组装为上下文；绝不复用主工作区内容。 */
function buildStudioContext(store, accountId, mode, maxInputChars) {
	const account = store.listAccounts().find((item) => item.id === accountId);
	if (account === void 0) throw new Error(`账号不存在：${accountId}`);
	const persona = store.listPersonas().find((item) => item.id === account.personaId);
	if (persona === void 0) throw new Error("该账号尚未分配人设");
	const notes = store.listPublishedNotes(accountId);
	const snapshots = store.listMetricSnapshots(accountId);
	const viralItems = store.listViralItems(accountId, "accepted");
	const personaLines = [
		`【人设名称】${persona.name}`,
		persona.positioning !== void 0 ? `【账号定位】${persona.positioning}` : "",
		persona.audience !== void 0 ? `【目标受众】${persona.audience}` : "",
		persona.expertise !== void 0 ? `【擅长领域】${persona.expertise}` : "",
		persona.contentDirections !== void 0 ? `【内容方向】${persona.contentDirections}` : "",
		persona.hookStyles !== void 0 && persona.hookStyles.length > 0 ? `【钩子风格】${persona.hookStyles.join("、")}` : "",
		persona.bodyStructure !== void 0 ? `【正文结构】${persona.bodyStructure}` : "",
		persona.endingStyle !== void 0 ? `【结尾互动】${persona.endingStyle}` : "",
		persona.forbiddenExpressions !== void 0 ? `【禁用表达】${persona.forbiddenExpressions}` : "",
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
/** 创作会话服务。 */
var StudioService = class {
	store;
	llm;
	modelLabel;
	constructor(store, llm, modelLabel = "当前 Harness 模型") {
		this.store = store;
		this.llm = llm;
		this.modelLabel = modelLabel;
	}
	/** 追加用户消息，组装上下文，调用模型，保存助手消息。 */
	async send(accountId, input, mode, maxInputChars) {
		this.store.listAccounts().find((item) => item.id === accountId) ?? (() => {
			throw new Error(`账号不存在：${accountId}`);
		})();
		const built = buildStudioContext(this.store, accountId, mode, maxInputChars);
		if (built.truncated) throw new Error(built.warning ?? "上下文超出限制");
		const messages = [...this.store.listStudioMessages(accountId).map((message) => ({
			role: message.role,
			content: message.content
		})), {
			role: "user",
			content: input
		}];
		const system = [
			built.context,
			"",
			"你是矩阵专属创作助手。只处理当前账号的小红书人设、已发布内容、爆款池参考、内容创作、文案创作与草稿编辑。",
			"不要读取或操作 DeepSeek Harness 主工作区的文件、会话或工具，也不要回答与矩阵创作无关的问题。",
			"参考爆款池中已采纳的爆款时只借鉴选题角度、结构和用户需求，不得复制原文、图片、独特经历，也不得仅替换词语改写。",
			"生成结果不会自动发布；草稿必须由用户明确保存后才会落库。"
		].join("\n");
		const response = await this.llm.complete({
			system,
			messages,
			maxTokens: 4e3
		});
		this.store.saveStudioMessage({
			accountId,
			role: "user",
			content: input
		});
		return {
			message: this.store.saveStudioMessage({
				accountId,
				role: "assistant",
				content: response.text
			}),
			evidence: {
				persona: `${this.store.listPersonas().find((p) => p.id === this.store.listAccounts().find((a) => a.id === accountId)?.personaId)?.name ?? ""}`,
				noteIds: this.store.listPublishedNotes(accountId).filter((note) => note.weight >= 3).map((note) => note.id),
				trendIds: this.store.listViralItems(accountId, "accepted").slice(0, 20).map((item) => item.id),
				reasons: [`基于账号人设、高权重历史内容与已采纳爆款参考生成；使用模型：${this.modelLabel}`]
			}
		};
	}
	/** 保存一条草稿（可带生成依据），不发布；日期取当日，草稿独立于选题。 */
	saveDraft(accountId, payload) {
		this.store.listAccounts().find((item) => item.id === accountId) ?? (() => {
			throw new Error(`账号不存在：${accountId}`);
		})();
		const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const draft = this.store.saveDraft({
			accountId,
			date,
			copy: payload.copy,
			coverPrompt: payload.coverPrompt
		});
		draft.evidence = payload.evidence;
		return draft;
	}
};
//#endregion
//#region src/composer.ts
/** 默认爆款技巧框架：人设未另行规定自身文案结构时适用。 */
const DEFAULT_TECHNIQUES = [
	"钩子式开头：第一句制造好奇/共鸣/冲突，吸引点击",
	"悬念伏笔：正文埋 1-2 个悬念点引导读完，标题与开头呼应",
	"清单/对比结构：提升可读性",
	"结尾引导互动：提问 + 相关话题标签"
].join("；");
/**
* 拼接创作简报 markdown。
* @param account - 目标账号。
* @param persona - 账号人设。
* @param viralItems - 该账号爆款池参考条目（pending/accepted），作为素材来源。
* @returns 简报文本。
*/
function composeBrief(account, persona, viralItems) {
	const viralLines = viralItems.length === 0 ? ["（该账号暂无爆款池参考）"] : viralItems.map((item) => `- ${item.title}（推荐分 ${item.score}；理由：${item.reasons.join("、")}）${item.sourceUrl !== void 0 ? `｜${item.sourceUrl}` : ""}`);
	return [
		`【账号】${account.name}（${persona.name}）`,
		`【人设】${persona.prompt}`,
		`【风格】严格按「${persona.name}」人设的风格撰写（${persona.prompt}）；默认爆款技巧框架（人设未另行规定时）：${DEFAULT_TECHNIQUES}。`,
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
* 构建 7 个模型工具。
* @param deps - 存储与上下文。
* @returns 工具定义数组。
*/
function makeTools(deps) {
	const { store, ctx } = deps;
	const accountsOf = () => {
		return store.listAccounts().filter((a) => a.enabled);
	};
	const personaOf = (personaId) => store.listPersonas().find((p) => p.id === personaId);
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
					const viralItems = store.listViralItems(account.id).filter((item) => item.status === "pending" || item.status === "accepted");
					if (viralItems.length === 0) {
						skipped.push(`${account.name}（爆款池为空，请先在「矩阵」面板采集爆款）`);
						continue;
					}
					briefs.push(composeBrief(account, persona, viralItems));
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
			description: "保存草稿：按 xhs_today 简报撰写的文案与封面提示词落库。同账号 + 当日已存在草稿时拒绝（除非 force: true 覆盖）。",
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
				if (!store.listAccounts().some((a) => a.id === args.accountId)) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					draftId: ""
				};
				const date = today();
				const existing = store.findDraft(args.accountId, date);
				if (existing !== void 0 && args.force !== true) return {
					ok: false,
					message: `该账号当日已存在草稿（${existing.id}），如确需覆盖请传 force: true。`,
					draftId: existing.id
				};
				if (existing !== void 0) store.deleteDraft(existing.id);
				const draft = store.saveDraft({
					accountId: args.accountId,
					date,
					copy: args.copy,
					coverPrompt: args.coverPrompt
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
			description: "查询指定账号的爆款池条目（标题/正文/来源链接/审核状态/推荐分/理由），可按审核状态过滤。爆款池是创作简报的素材来源。",
			parameters: {
				accountId: {
					type: "string",
					required: true,
					description: "账号 id"
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
				if (!store.listAccounts().some((account) => account.id === args.accountId)) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					items: []
				};
				if (args.status !== void 0 && !VIRAL_STATUSES.includes(args.status)) return {
					ok: false,
					message: `status 必须是 pending/accepted/ignored：${args.status}`,
					items: []
				};
				const status = args.status;
				const items = store.listViralItems(args.accountId, status).map((item) => ({
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
					message: (items.length === 0 ? ["该账号爆款池为空"] : items.map((item) => `${item.id}\t${item.status}\t分数 ${item.score}\t${item.title}${item.sourceUrl !== void 0 ? `\t${item.sourceUrl}` : ""}`)).join("\n"),
					items
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
			description: "查询指定账号的已发布笔记知识库（含标题、权重、最近指标摘要）。",
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
				if (!store.listAccounts().some((account) => account.id === args.accountId)) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					notes: []
				};
				const notes = store.listPublishedNotes(args.accountId);
				const lines = notes.length === 0 ? ["该账号还没有已发布笔记"] : notes.map((note) => {
					const metric = store.listMetricSnapshots(args.accountId, note.id).at(-1);
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
	"llm"
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
	if (modelRoute === void 0) return {
		client: { complete: async () => {
			throw new Error("未配置创作台模型：请在 Harness 设置 agent-default-model（provider 与 model）");
		} },
		modelLabel: "未配置"
	};
	return {
		client: { async complete(request) {
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
			for await (const chunk of stream(options)) assembler.push(chunk);
			if (assembler.finish.kind !== "stop") throw new Error(`创作台模型调用未正常结束：finish ${assembler.finish.kind}`);
			return { text: assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("") };
		} },
		modelLabel: `${modelRoute.provider}/${modelRoute.model}`
	};
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
		const studio = new StudioService(store, llmClient, modelLabel);
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
