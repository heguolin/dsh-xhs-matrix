import { t as MatrixStore } from "./store-DAIp9FVr.js";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
	accounts: "/api/dsh-xhs-matrix/accounts",
	personas: "/api/dsh-xhs-matrix/personas",
	topics: "/api/dsh-xhs-matrix/topics",
	negatives: "/api/dsh-xhs-matrix/negatives",
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
	const { store } = deps;
	const route = (path, handler) => ({
		kind: "exact",
		path,
		handler
	});
	const fail = (res, error) => {
		writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
	};
	return [
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
					writeJson(res, 200, { account: store.upsertAccount(body, id) });
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
		route(XHS_API.negatives, async (req, res) => {
			const method = req.method ?? "GET";
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			if (method === "GET") {
				writeJson(res, 200, { negatives: store.listNegatives() });
				return;
			}
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const id = queryParam(new URL(req.url ?? "/", "http://localhost"), "negative");
			try {
				if (method === "POST") writeJson(res, 201, { negative: store.addNegative(body) });
				else if (method === "DELETE") {
					if (id === void 0) {
						writeJson(res, 400, { error: "negative 查询参数必填" });
						return;
					}
					store.deleteNegative(id);
					writeJson(res, 200, { ok: true });
				} else writeJson(res, 405, { error: `method not allowed: ${method}` });
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
		})
	];
}
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
* @param negatives - 全部黑名单（账号级 + 全局）。
* @returns 简报文本。
*/
function composeBrief(account, persona, topic, negatives) {
	const constraints = negatives.filter((n) => n.accountId === void 0 || n.accountId === account.id).map((n) => `【约束】不要写类似于「${n.keyword}」的内容，因为${n.reason}`);
	return [
		`【账号】${account.name}（${persona.name}）`,
		`【人设】${persona.prompt}`,
		`【风格】严格按「${persona.name}」人设的风格撰写（${persona.prompt}）；默认爆款技巧框架（人设未另行规定时）：${DEFAULT_TECHNIQUES}。`,
		`【选题】${topic.title}`,
		...constraints,
		`【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`
	].join("\n");
}
//#endregion
//#region src/decision.ts
/** 标题是否命中黑名单（子串匹配）。 */
function matchesNegative(title, negative) {
	return title.includes(negative.keyword);
}
/** 该账号今日已用过的选题 id 集合。 */
function usedTodayIds(accountId, todayDrafts) {
	return new Set(todayDrafts.filter((d) => d.accountId === accountId).map((d) => d.topicId));
}
/**
* 按账号过滤选题：剔除已用 / 命中黑名单（账号级 + 全局）/ 今日已为该账号生成。
* @param topics - 全部选题。
* @param negatives - 全部黑名单。
* @param accountId - 目标账号。
* @param todayDrafts - 今日草稿。
* @returns 候选选题。
*/
function filterTopics(topics, negatives, accountId, todayDrafts) {
	const usedToday = usedTodayIds(accountId, todayDrafts);
	return topics.filter((topic) => {
		if (topic.status !== "open") return false;
		if (usedToday.has(topic.id)) return false;
		return !negatives.some((n) => (n.accountId === void 0 || n.accountId === accountId) && matchesNegative(topic.title, n));
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
* 构建 7 个模型工具。
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
			description: "今日决策：为每个（或指定）未发账号生成创作简报（人设 + 选题 + 黑名单约束）。简报返回后，直接按简报撰写小红书文案（标题 + 正文 + 话题标签）与封面提示词，再用 xhs_draft_save 保存。触发词：今天要发什么、选题、小红书矩阵。",
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
				const negatives = store.listNegatives();
				const briefs = [];
				const skipped = [];
				for (const account of accounts) {
					const persona = personaOf(account.personaId);
					if (persona === void 0) {
						skipped.push(`${account.name}（未分配人设）`);
						continue;
					}
					const topic = selectTopic(filterTopics(store.listTopics(), negatives, account.id, todayDrafts), selectionStrategy);
					if (topic === void 0) {
						skipped.push(`${account.name}（选题池为空或全部被黑名单/已用/今日已发排除）`);
						continue;
					}
					briefs.push(composeBrief(account, persona, topic, negatives));
				}
				if (briefs.length === 0) return {
					ok: false,
					message: `今日无可生成内容${skipped.length > 0 ? `：${skipped.join("，")}` : ""}。请补充选题或检查黑名单。`,
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
			name: "xhs_negative_add",
			description: "添加黑名单条目（accountId 省略为全局；命中关键词的选题将不会出现在创作简报中）。",
			parameters: {
				keyword: {
					type: "string",
					required: true,
					description: "黑名单关键词"
				},
				reason: {
					type: "string",
					required: true,
					description: "原因，如「上次没流量」"
				},
				accountId: {
					type: "string",
					description: "账号 id（省略 = 全局）"
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
						negativeId: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => render(value)
			},
			async execute(args, _exec) {
				const negative = store.addNegative({
					keyword: args.keyword,
					reason: args.reason,
					accountId: args.accountId
				});
				return {
					ok: true,
					message: `已添加${args.accountId === void 0 ? "全局" : args.accountId}黑名单「${args.keyword}」（${args.reason}）`,
					negativeId: negative.id
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
	"systemPrompt"
];
/** 设置命名空间。 */
const XHS_SETTINGS_NAMESPACE = settingsNamespace("dsh-xhs-matrix");
const Config = z.object({
	selectionStrategy: z.union(["fifo", "random"]).default("fifo"),
	locale: z.string().default("zh-CN"),
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true)
});
const DEFAULT_SELECTION = "fifo";
/** 模型可见公告。 */
const XHS_GUIDANCE = "本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、选题、黑名单与草稿。能力：xhs_today 按账号人设生成创作简报（选题 + 黑名单约束）供你撰写文案；xhs_draft_save 持久化草稿（同账号当日同选题去重）；xhs_topic_add / xhs_negative_add 管理选题池与黑名单；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题」时即指本插件。";
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
		enabled: current().enabled ?? true
	});
	const store = new MatrixStore();
	store.load();
	let disposeRoutes;
	let disposeTools;
	let disposeSection;
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
		const value = resolve();
		if (!value.enabled) return;
		if (value.announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:dsh-xhs-matrix",
			order: 150,
			text: XHS_GUIDANCE
		});
		disposeRoutes = ctx.effect(() => {
			const disposers = makeRoutes({ store }).map((route) => ctx.webServer.register(route));
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
