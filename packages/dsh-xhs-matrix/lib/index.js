import { t as MatrixStore } from "./store-BNH0EGiw.js";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/trends.ts
/** 只保留 Apify 返回中可用于分析的公开字段。 */
function normalizeApifyItem(item, actorId) {
	if (typeof item !== "object" || item === null) throw new Error("Apify item 必须是对象");
	const value = item;
	if (typeof value.title !== "string" || value.title.trim() === "") throw new Error("Apify item 缺少 title");
	const numberOf = (key) => typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : void 0;
	const strings = (key) => Array.isArray(value[key]) ? value[key].filter((entry) => typeof entry === "string") : void 0;
	return {
		title: value.title.trim(),
		summary: typeof value.summary === "string" ? value.summary : typeof value.desc === "string" ? value.desc : void 0,
		sourceUrl: typeof value.url === "string" ? value.url : typeof value.noteUrl === "string" ? value.noteUrl : void 0,
		source: "apify",
		actorId,
		publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : void 0,
		reads: numberOf("reads") ?? numberOf("viewCount"),
		likes: numberOf("likes") ?? numberOf("likeCount"),
		favorites: numberOf("favorites") ?? numberOf("收藏"),
		comments: numberOf("comments") ?? numberOf("commentCount"),
		keywords: strings("keywords"),
		contentType: typeof value.contentType === "string" ? value.contentType : void 0
	};
}
/** 按当前账号人设、历史样本和公开互动信号排序，并返回解释。 */
function rankTrends(account, persona, notes, trends) {
	const terms = [
		persona.name,
		persona.positioning,
		persona.expertise,
		persona.contentDirections,
		persona.topicCriteria,
		persona.hookStyles?.join(" ")
	].filter((item) => Boolean(item)).join(" ").toLowerCase();
	return trends.map((trend) => {
		const haystack = `${trend.title} ${trend.summary ?? ""} ${(trend.keywords ?? []).join(" ")}`.toLowerCase();
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
		const engagement = (trend.likes ?? 0) + (trend.favorites ?? 0) + (trend.comments ?? 0);
		if (engagement > 0) {
			score += Math.min(25, Math.log10(engagement + 1) * 8);
			reasons.push("存在公开互动信号");
		}
		if (trend.publishedAt !== void 0 && Date.now() - Date.parse(trend.publishedAt) < 7 * 864e5) {
			score += 10;
			reasons.push("近期趋势");
		}
		return {
			...trend,
			score: Math.round(score),
			reasons
		};
	}).sort((a, b) => b.score - a.score);
}
//#endregion
//#region src/apify.ts
/** Apify Actor Run/Dataset 的 Host 适配器。 */
/** 通过 Apify API 搜索公开趋势样本；凭据只在 Host 端使用。 */
var ApifyTrendProvider = class {
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
			samples: [],
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
					operation: "note search",
					maxItems: limit,
					maxResults: limit
				}),
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!runResponse.ok) return {
				samples: [],
				status: "failed",
				error: `Apify Run HTTP ${runResponse.status}`
			};
			const run = await runResponse.json();
			const runId = run.data?.id;
			const datasetId = run.data?.defaultDatasetId;
			if (runId === void 0 || datasetId === void 0) return {
				samples: [],
				status: "failed",
				error: "Apify Run 响应缺少 id 或 Dataset"
			};
			let status = run.data?.status;
			for (let poll = 0; poll < this.config.maxPolls && status !== "SUCCEEDED"; poll += 1) {
				if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") return {
					samples: [],
					status: "failed",
					error: `Apify Run ${status}`
				};
				await this.sleep(250);
				const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, {
					headers,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs)
				});
				if (!stateResponse.ok) return {
					samples: [],
					status: "failed",
					error: `Apify 状态 HTTP ${stateResponse.status}`
				};
				status = (await stateResponse.json()).data?.status;
			}
			if (status !== "SUCCEEDED") return {
				samples: [],
				status: "failed",
				error: "Apify Run 等待超时"
			};
			const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&token=${encodeURIComponent(this.config.apiToken)}`, {
				headers,
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});
			if (!datasetResponse.ok) return {
				samples: [],
				status: "failed",
				error: `Apify Dataset HTTP ${datasetResponse.status}`
			};
			const items = await datasetResponse.json();
			if (!Array.isArray(items)) return {
				samples: [],
				status: "failed",
				error: "Apify Dataset 不是数组"
			};
			return {
				samples: items.slice(0, limit).map((item) => normalizeApifyItem(item, this.config.actorId)),
				status: "success"
			};
		} catch (error) {
			return {
				samples: [],
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
			const match = result.samples.find((sample) => sample.sourceUrl !== void 0 && note.sourceUrl !== void 0 && sample.sourceUrl === note.sourceUrl);
			this.store.saveMetricSnapshot({
				accountId,
				noteId: note.id,
				reads: match?.reads ?? 0,
				likes: match?.likes ?? 0,
				favorites: match?.favorites ?? 0,
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
	trends: "/api/dsh-xhs-matrix/trends",
	metrics: "/api/dsh-xhs-matrix/metrics",
	studio: "/api/dsh-xhs-matrix/studio",
	studioMessages: "/api/dsh-xhs-matrix/studio/messages",
	topics: "/api/dsh-xhs-matrix/topics",
	drafts: "/api/dsh-xhs-matrix/drafts"
};
//#endregion
//#region src/routes.ts
/** JSON 请求体上限。 */
const MAX_JSON_BODY_BYTES = 256 * 1024;
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
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
/**
* 构建全部 /api/dsh-xhs-matrix 路由。
* @param deps - 存储。
* @returns 路由数组。
*/
function makeRoutes(deps) {
	const { store, trendProvider, scheduler, studio, reload } = deps;
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const fail = (res, error) => {
		writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
	};
	return [
		route(XHS_API.settingsApify, async (req, res) => {
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
		}),
		route(XHS_API.accounts, async (req, res) => {
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
		}),
		route(XHS_API.accountImport, async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0 || typeof body.accountId !== "string" || body.format !== "csv" && body.format !== "json" || typeof body.content !== "string") {
				writeJson(res, 400, { error: "accountId、format 和 content 必填" });
				return;
			}
			try {
				const { applyPublishedNoteImport, parsePublishedNoteImport } = await import("./importer-CuSzPn0g.js");
				const records = parsePublishedNoteImport(body.content, body.format);
				applyPublishedNoteImport(store, body.accountId, records);
				writeJson(res, 201, { imported: records.length });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.personas, async (req, res) => {
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
		}),
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
		route(XHS_API.topics, async (req, res) => {
			const method = req.method ?? "GET";
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			if (method === "GET") {
				writeJson(res, 200, { topics: store.listTopics() });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const id = queryParam(new URL(req.url ?? "/", "http://localhost"), "topic");
			try {
				if (method === "POST") if (typeof body.title === "string") writeJson(res, 201, { topics: store.addTopics([body.title]) });
				else if (Array.isArray(body.titles) && body.titles.every((t) => typeof t === "string")) writeJson(res, 201, { topics: store.addTopics(body.titles) });
				else writeJson(res, 400, { error: "body 需含 title 字符串或 titles 字符串数组" });
				else if (method === "PATCH") {
					if (id === void 0) {
						writeJson(res, 400, { error: "topic 查询参数必填" });
						return;
					}
					store.retireTopic(id);
					writeJson(res, 200, { ok: true });
				} else if (method === "DELETE") writeJson(res, 405, { error: "选题不支持删除，请用 PATCH 标记弃用" });
				else writeJson(res, 405, { error: `method not allowed: ${method}` });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.drafts, async (req, res) => {
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
			for (const field of [
				"accountId",
				"topicId",
				"date",
				"copy",
				"coverPrompt"
			]) {
				const value = body[field];
				if (typeof value !== "string" || value.trim() === "") {
					writeJson(res, 400, { error: `草稿字段 ${field} 必填` });
					return;
				}
			}
			const topicId = body.topicId;
			if (!store.listTopics().some((topic) => topic.id === topicId)) {
				writeJson(res, 400, { error: "选题不存在" });
				return;
			}
			try {
				const draft = store.saveDraft(body);
				store.markTopicUsed(draft.topicId, draft.id);
				writeJson(res, 201, { draft });
			} catch (error) {
				fail(res, error);
			}
		}),
		route(XHS_API.drafts + "/status", async (req, res) => {
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
		}),
		route(XHS_API.trends, async (req, res) => {
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
				writeJson(res, 200, { trends: store.listTrendSamples(accountId) });
				return;
			}
			if (method !== "POST") {
				writeJson(res, 405, { error: `method not allowed: ${method}` });
				return;
			}
			if (trendProvider === void 0) {
				writeJson(res, 400, { error: "未配置趋势数据源" });
				return;
			}
			const account = store.listAccounts().find((item) => item.id === accountId);
			if (account === void 0) {
				writeJson(res, 400, { error: `账号不存在：${accountId}` });
				return;
			}
			const persona = store.listPersonas().find((item) => item.id === account.personaId);
			if (persona === void 0) {
				writeJson(res, 400, { error: "该账号尚未分配人设" });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const query = typeof body.query === "string" && body.query.trim() !== "" ? body.query.trim() : persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name;
			const maxItems = typeof body.maxItems === "number" && body.maxItems > 0 ? body.maxItems : 10;
			try {
				const result = await trendProvider.search({
					accountId,
					query,
					maxItems
				});
				if (result.status === "failed") {
					writeJson(res, 502, { error: result.error ?? "趋势采集失败" });
					return;
				}
				const ranked = rankTrends(account, persona, store.listPublishedNotes(accountId), result.samples);
				for (const item of ranked) store.saveTrendSample({
					accountId,
					title: item.title,
					summary: item.summary,
					sourceUrl: item.sourceUrl,
					source: item.source,
					actorId: item.actorId,
					publishedAt: item.publishedAt,
					reads: item.reads,
					likes: item.likes,
					favorites: item.favorites,
					comments: item.comments,
					keywords: item.keywords,
					contentType: item.contentType,
					status: "success"
				});
				writeJson(res, 201, { trends: ranked });
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
		}),
		route(XHS_API.studioMessages, async (req, res) => {
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
		}),
		route(XHS_API.studio + "/draft", async (req, res) => {
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
			const topicId = typeof body.topicId === "string" ? body.topicId : "";
			const copy = typeof body.copy === "string" && body.copy.trim() !== "" ? body.copy : "";
			const coverPrompt = typeof body.coverPrompt === "string" ? body.coverPrompt : "";
			if (accountId === "" || topicId === "" || copy === "") {
				writeJson(res, 400, { error: "accountId、topicId、copy 必填" });
				return;
			}
			try {
				writeJson(res, 201, { draft: studio.saveDraft(accountId, {
					topicId,
					copy,
					coverPrompt,
					evidence: body.evidence
				}) });
			} catch (error) {
				fail(res, error);
			}
		})
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
	const trends = store.listTrendSamples(accountId);
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
	const trendLines = trends.slice(0, 20).map((trend) => `- ${trend.title}（${trend.summary ?? ""}）`);
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
		"## 外部趋势样本",
		trendLines.join("\n") || "（暂无外部趋势样本）",
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
			"你是矩阵专属创作助手。只处理当前账号的小红书人设、已发布内容、外部趋势、选题分析、文案创作与草稿编辑。",
			"不要读取或操作 DeepSeek Harness 主工作区的文件、会话或工具，也不要回答与矩阵创作无关的问题。",
			"参考外部趋势时只借鉴选题角度、结构和用户需求，不得复制原文、图片、独特经历，也不得仅替换词语改写。",
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
				trendIds: this.store.listTrendSamples(accountId).slice(0, 20).map((trend) => trend.id),
				reasons: [`基于账号人设、高权重历史内容与外部趋势生成；使用模型：${this.modelLabel}`]
			}
		};
	}
	/** 保存一条草稿（可带生成依据），不发布。 */
	saveDraft(accountId, payload) {
		this.store.listAccounts().find((item) => item.id === accountId) ?? (() => {
			throw new Error(`账号不存在：${accountId}`);
		})();
		if (this.store.listTopics().find((item) => item.id === payload.topicId) === void 0) throw new Error("选题不存在");
		const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const draft = this.store.saveDraft({
			accountId,
			topicId: payload.topicId,
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
* @param topic - 选中选题。
* @returns 简报文本。
*/
function composeBrief(account, persona, topic) {
	return [
		`【账号】${account.name}（${persona.name}）`,
		`【人设】${persona.prompt}`,
		`【风格】严格按「${persona.name}」人设的风格撰写（${persona.prompt}）；默认爆款技巧框架（人设未另行规定时）：${DEFAULT_TECHNIQUES}。`,
		`【选题】${topic.title}`,
		`【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`
	].join("\n");
}
//#endregion
//#region src/decision.ts
/** 该账号今日已用过的选题 id 集合。 */
function usedTodayIds(accountId, todayDrafts) {
	return new Set(todayDrafts.filter((d) => d.accountId === accountId).map((d) => d.topicId));
}
/**
* 按账号过滤选题：剔除已用 / 今日已为该账号生成。
* @param topics - 全部选题。
* @param accountId - 目标账号。
* @param todayDrafts - 今日草稿。
* @returns 候选选题。
*/
function filterTopics(topics, accountId, todayDrafts) {
	const usedToday = usedTodayIds(accountId, todayDrafts);
	return topics.filter((topic) => {
		if (topic.status !== "open") return false;
		if (usedToday.has(topic.id)) return false;
		return true;
	});
}
/**
* 从候选中选择一个选题。
* @param candidates - 候选选题。
* @param strategy - fifo（最旧未用优先，按 createdAt 排序）/ random。
* @param rand - 随机源，测试注入固定值。
* @returns 选中选题，候选为空时 undefined。
*/
function selectTopic(candidates, strategy, rand = Math.random) {
	if (candidates.length === 0) return void 0;
	if (strategy === "random") return candidates[Math.floor(rand() * candidates.length)];
	return [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
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
/**
* 构建 8 个模型工具。
* @param deps - 存储与上下文。
* @returns 工具定义数组。
*/
function makeTools(deps) {
	const { store, ctx, selectionStrategy } = deps;
	/** 今日日期（YYYY-MM-DD，本地时区）。 */
	const today = () => {
		const now = /* @__PURE__ */ new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	};
	const accountsOf = () => {
		return store.listAccounts().filter((a) => a.enabled);
	};
	const personaOf = (personaId) => store.listPersonas().find((p) => p.id === personaId);
	return [
		defineTool({
			name: "xhs_today",
			description: "今日决策：为每个（或指定）未发账号生成创作简报（人设 + 选题约束）。简报返回后，直接按简报撰写小红书文案（标题 + 正文 + 话题标签）与封面提示词，再用 xhs_draft_save 保存。触发词：今天要发什么、选题、小红书矩阵。",
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
					const topic = selectTopic(filterTopics(store.listTopics(), account.id, todayDrafts), selectionStrategy);
					if (topic === void 0) {
						skipped.push(`${account.name}（选题池为空或全部被已用/今日已发排除）`);
						continue;
					}
					briefs.push(composeBrief(account, persona, topic));
				}
				if (briefs.length === 0) return {
					ok: false,
					message: `今日无可生成内容${skipped.length > 0 ? `：${skipped.join("，")}` : ""}。请补充选题或检查账号选题标准。`,
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
			description: "保存草稿：按 xhs_today 简报撰写的文案与封面提示词落库，并把选题标记为已用。同账号 + 当日 + 同选题已存在时拒绝（除非 force: true 覆盖）。",
			parameters: {
				accountId: {
					type: "string",
					required: true,
					description: "账号 id"
				},
				topicId: {
					type: "string",
					required: true,
					description: "选题 id"
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
					description: "同账号当日同选题已存在时强制覆盖"
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
					"topicId",
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
				if (!store.listTopics().some((t) => t.id === args.topicId)) return {
					ok: false,
					message: `选题不存在：${args.topicId}`,
					draftId: ""
				};
				if (!store.listAccounts().some((a) => a.id === args.accountId)) return {
					ok: false,
					message: `账号不存在：${args.accountId}`,
					draftId: ""
				};
				const date = today();
				const existing = store.findDraft(args.accountId, date, args.topicId);
				if (existing !== void 0 && args.force !== true) return {
					ok: false,
					message: `该账号当日已存在同选题草稿（${existing.id}），如确需覆盖请传 force: true。`,
					draftId: existing.id
				};
				if (existing !== void 0) store.deleteDraft(existing.id);
				const draft = store.saveDraft({
					accountId: args.accountId,
					topicId: args.topicId,
					date,
					copy: args.copy,
					coverPrompt: args.coverPrompt
				});
				store.markTopicUsed(args.topicId, draft.id);
				return {
					ok: true,
					message: `草稿已保存：${draft.id}（${date}）`,
					draftId: draft.id
				};
			}
		}),
		defineTool({
			name: "xhs_topics",
			description: "查询选题池（按状态过滤：open/used/retired）。",
			parameters: { status: {
				type: "string",
				description: "选题状态过滤"
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
						topics: {
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
				const topics = store.listTopics().filter((t) => args.status === void 0 || t.status === args.status);
				const lines = topics.length === 0 ? ["选题池为空"] : topics.map((t) => `${t.id}\t${t.status}\t${t.title}`);
				return {
					ok: true,
					message: lines.join("\n"),
					topics: lines
				};
			}
		}),
		defineTool({
			name: "xhs_topic_add",
			description: "向选题池添加选题（单个 title 或批量 titles）。手动选题是感知层的模拟入口。",
			parameters: {
				title: {
					type: "string",
					description: "单个选题标题"
				},
				titles: {
					type: "array",
					items: { type: "string" },
					description: "批量选题标题"
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
						topics: {
							type: "array",
							required: true,
							items: { type: "string" }
						}
					}
				},
				render: (_args, value) => render(value)
			},
			async execute(args, _exec) {
				const titles = args.titles !== void 0 ? args.titles : args.title !== void 0 ? [args.title] : [];
				if (titles.length === 0) return {
					ok: false,
					message: "请提供 title 或 titles。",
					topics: []
				};
				const created = store.addTopics(titles);
				return {
					ok: true,
					message: `已添加 ${created.length} 个选题`,
					topics: created.map((t) => `${t.id}\t${t.title}`)
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
			name: "xhs_trends",
			description: "查询指定账号已保存的外部趋势样本（Apify 采集，公开数据）。",
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
						trends: {
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
					trends: []
				};
				const trends = store.listTrendSamples(args.accountId);
				const lines = trends.length === 0 ? ["暂无趋势样本，请在「矩阵」面板触发采集"] : trends.slice(0, 20).map((trend) => `${trend.id}\t${trend.title}${trend.likes !== void 0 ? `\t点赞 ${trend.likes}` : ""}`);
				return {
					ok: true,
					message: lines.join("\n"),
					trends: lines
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
	selectionStrategy: z.union(["fifo", "random"]).default("fifo"),
	locale: z.string().default("zh-CN"),
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true),
	apifyActorId: z.string().default(""),
	apifyApiToken: z.string().default(""),
	apifyMaxItems: z.number().default(10),
	apifyRequestTimeoutMs: z.number().default(3e4),
	apifyMaxPolls: z.number().default(120)
});
const DEFAULT_SELECTION = "fifo";
/** 模型可见公告。 */
const XHS_GUIDANCE = "本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、已发布知识库、选题、草稿与专属创作台。能力：xhs_today 按账号人设生成创作简报供你撰写文案；xhs_notes 查询账号已发布笔记知识库；xhs_trends 查询外部趋势样本；xhs_collection_status 查询指标采集状态；xhs_draft_save 持久化草稿（同账号当日同选题去重）；xhs_topic_add 管理选题池；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题」时即指本插件。";
/**
* 挂载存储、路由、工具与公告。
* @param ctx - host 上下文（webServer/tools/systemPrompt）。
* @param config - 插件配置。
*/
function apply(ctx, config) {
	let current = () => config ?? {};
	const resolve = () => ({
		selectionStrategy: current().selectionStrategy ?? DEFAULT_SELECTION,
		locale: current().locale ?? "zh-CN",
		announceToAgent: current().announceToAgent ?? true,
		enabled: current().enabled ?? true,
		apifyActorId: current().apifyActorId ?? "",
		apifyApiToken: current().apifyApiToken ?? "",
		apifyMaxItems: current().apifyMaxItems ?? 10,
		apifyRequestTimeoutMs: current().apifyRequestTimeoutMs ?? 3e4,
		apifyMaxPolls: current().apifyMaxPolls ?? 120
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
		const apifyStore = store.getSettings().apify;
		const actorId = apifyStore.actorId !== "" ? apifyStore.actorId : value.apifyActorId;
		const apiToken = apifyStore.apiToken !== "" ? apifyStore.apiToken : value.apifyApiToken;
		const trendProvider = actorId !== "" && apiToken !== "" ? new ApifyTrendProvider({
			actorId,
			apiToken,
			maxItems: apifyStore.maxItems ?? value.apifyMaxItems ?? 10,
			requestTimeoutMs: apifyStore.requestTimeoutMs ?? value.apifyRequestTimeoutMs ?? 3e4,
			maxPolls: apifyStore.maxPolls ?? value.apifyMaxPolls ?? 120
		}) : void 0;
		let scheduler;
		if (trendProvider !== void 0) {
			scheduler = new CollectionScheduler({
				store,
				provider: trendProvider
			});
			scheduler.start();
		}
		const studio = new StudioService(store, { async complete(request) {
			const messages = request.messages.map((entry) => {
				const content = [{
					type: "text",
					text: entry.content
				}];
				return entry.role === "user" ? createUserMessage({
					content,
					source: { kind: "user" }
				}) : createAssistantMessage({
					content,
					source: {
						provider: "deepseek",
						model: "deepseek-chat"
					}
				});
			});
			const text = [];
			let failed;
			for await (const chunk of ctx.llm.stream({
				provider: "deepseek",
				model: "deepseek-chat",
				system: request.system,
				messages,
				maxTokens: request.maxTokens ?? 4e3
			})) {
				if (chunk.type === "text-delta") text.push(chunk.text);
				if (chunk.type === "finish" && chunk.reason.kind === "error") failed = chunk.reason.failure.message;
			}
			if (failed !== void 0) throw new Error(failed);
			return { text: text.join("") };
		} });
		disposeScheduler = () => scheduler?.stop();
		disposeRoutes = ctx.effect(() => {
			const disposers = makeRoutes({
				store,
				trendProvider,
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
				ctx,
				selectionStrategy: resolve().selectionStrategy
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
export { Config, XHS_GUIDANCE, XHS_SETTINGS_NAMESPACE, apply, inject, name };
