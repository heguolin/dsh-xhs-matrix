window.__ModuleLoader__.load({
	id: "dsh-xhs-matrix",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		//#region src/client/api.ts
		/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */
		/** 携带路由 JSON 错误消息的客户端错误。 */
		var XhsApiError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "XhsApiError";
			}
		};
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new XhsApiError(`HTTP ${response.status}: invalid JSON response`);
			}
			if (!response.ok) throw new XhsApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
			return body;
		}
		function query(params) {
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) if (value !== void 0 && value !== "") search.set(key, String(value));
			const text = search.toString();
			return text === "" ? "" : "?" + text;
		}
		/** 解析一条 SSE data 载荷为结构化事件；未知类型返回 undefined（跳过）。 */
		function parseSseEvent(data) {
			let raw;
			try {
				raw = JSON.parse(data);
			} catch {
				return;
			}
			if (typeof raw !== "object" || raw === null) return void 0;
			switch (raw.type) {
				case "phase": {
					const phase = raw.phase;
					if (phase !== "planning" && phase !== "drafting" && phase !== "polishing" && phase !== "checking") return void 0;
					return {
						type: "phase",
						phase
					};
				}
				case "evidence": return raw;
				case "plan_delta": {
					const delta = raw.delta;
					if (typeof delta !== "string") return void 0;
					return {
						type: "plan_delta",
						delta
					};
				}
				case "content_delta": {
					const delta = raw.delta;
					if (typeof delta !== "string") return void 0;
					return {
						type: "content_delta",
						delta
					};
				}
				case "quality": return raw;
				case "done": return raw;
				case "error": {
					const stage = raw.stage;
					const retryable = raw.retryable;
					const message = raw.message;
					return {
						type: "error",
						stage: typeof stage === "string" ? stage : "stream",
						retryable: retryable === true,
						message: typeof message === "string" ? message : String(raw)
					};
				}
				default: return;
			}
		}
		/** 面板数据入口。 */
		var XhsApi = class {
			async listAccounts() {
				return (await readJson(await fetch(XHS_API.accounts))).accounts;
			}
			async createAccount(payload) {
				return (await readJson(await fetch(XHS_API.accounts, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}))).account;
			}
			async updateAccount(id, payload) {
				return (await readJson(await fetch(XHS_API.accounts + query({ account: id }), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}))).account;
			}
			async deleteAccount(id) {
				await readJson(await fetch(XHS_API.accounts + query({ account: id }), { method: "DELETE" }));
			}
			async importPublishedNotes(accountId, format, content) {
				return (await readJson(await fetch(XHS_API.accountImport, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accountId,
						format,
						content
					})
				}))).imported;
			}
			async listPersonas() {
				return (await readJson(await fetch(XHS_API.personas))).personas;
			}
			async createPersona(payload) {
				return (await readJson(await fetch(XHS_API.personas, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}))).persona;
			}
			async updatePersona(id, payload) {
				return (await readJson(await fetch(XHS_API.personas + query({ persona: id }), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}))).persona;
			}
			async deletePersona(id) {
				await readJson(await fetch(XHS_API.personas + query({ persona: id }), { method: "DELETE" }));
			}
			scopeParams(scope) {
				return typeof scope === "string" ? { persona: scope } : { account: scope.accountId };
			}
			/** 按人设与审核状态列出爆款池条目（所有批次拍平）。 */
			async listViralItems(scope, status) {
				return (await this.listViralBatches(scope, status)).flatMap((batch) => batch.items);
			}
			/** 按采集批次列出爆款池（每批含条目）；status 过滤条目。personaId 为主参数，兼容显式 { accountId }。 */
			async listViralBatches(scope, status) {
				return (await readJson(await fetch(XHS_API.viral + query({
					...this.scopeParams(scope),
					status
				})))).batches;
			}
			/** 删除整个采集批次（该批全部条目）。 */
			async deleteViralBatch(scope, batchId) {
				return (await readJson(await fetch(XHS_API.viral + query({
					...this.scopeParams(scope),
					batch: batchId
				}), { method: "DELETE" }))).deleted;
			}
			/** 采集爆款入库（query/maxItems 缺省时由后端按人设方向降级生成搜索词与条数）。 */
			async collectViral(accountId, query, maxItems) {
				return (await readJson(await fetch(XHS_API.viral, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accountId,
						query,
						maxItems
					})
				}))).items;
			}
			/** 审核爆款条目为 accepted / ignored。 */
			async reviewViralItem(scope, itemId, status) {
				return (await readJson(await fetch(XHS_API.viral + query({
					...this.scopeParams(scope),
					item: itemId
				}), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ status })
				}))).item;
			}
			/** 手动新增爆款（personaId 为主参数）。 */
			async addManualViral(personaId, payload) {
				return (await readJson(await fetch(XHS_API.viralManual, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						personaId,
						...payload
					})
				}))).item;
			}
			/** 显式转移爆款到目标人设。 */
			async transferVirals(personaId, targetPersonaId, itemIds) {
				return (await readJson(await fetch(XHS_API.viralTransfer, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						personaId,
						targetPersonaId,
						itemIds
					})
				}))).items;
			}
			async listNotes(scope) {
				return (await readJson(await fetch(XHS_API.notes + query(this.scopeParams(scope))))).notes;
			}
			async setNoteWeight(scope, noteId, weight) {
				await readJson(await fetch(XHS_API.notes + query({
					...this.scopeParams(scope),
					note: noteId
				}), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ weight })
				}));
			}
			/** 显式转移已发布笔记到目标人设。 */
			async transferNotes(personaId, targetPersonaId, noteIds) {
				return (await readJson(await fetch(XHS_API.notesTransfer, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						personaId,
						targetPersonaId,
						noteIds
					})
				}))).notes;
			}
			async listPending() {
				return (await readJson(await fetch(XHS_API.pendingOwnership))).pending;
			}
			async assignPending(id, targetPersonaId) {
				return (await readJson(await fetch(XHS_API.pendingOwnership, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						id,
						targetPersonaId
					})
				}))).asset;
			}
			async listMetrics(accountId, noteId) {
				return (await readJson(await fetch(XHS_API.metrics + query({
					account: accountId,
					note: noteId
				})))).metrics;
			}
			/** 手动录入一条指标快照（运维用，来源 manual）。 */
			async saveMetricSnapshot(accountId, noteId, reads) {
				await readJson(await fetch(XHS_API.metrics, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accountId,
						noteId,
						reads,
						likes: 0,
						favorites: 0,
						comments: 0,
						source: "manual",
						collectedAt: (/* @__PURE__ */ new Date()).toISOString()
					})
				}));
			}
			async getApifyConfig() {
				return (await readJson(await fetch(XHS_API.settingsApify))).settings;
			}
			async updateApifyConfig(payload) {
				return (await readJson(await fetch(XHS_API.settingsApify, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}))).settings;
			}
			async listStudioMessages(accountId) {
				return (await readJson(await fetch(XHS_API.studioMessages + query({ account: accountId })))).messages;
			}
			async studioSend(accountId, input, mode) {
				return await readJson(await fetch(XHS_API.studioMessages + query({ account: accountId }), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input,
						mode
					})
				}));
			}
			/**
			* 流式发送创作指令（结构化 SSE）：按完整空白行分隔解析类型化事件，
			* 跨 chunk 保留缓冲区；onEvent 按顺序收到 type/phase/evidence/plan_delta/
			* content_delta/quality/done/error。错误事件抛 XhsApiError；done 提供
			* messageId/coverPrompt/personaId。requestId 透传到请求体用于幂等去重。
			*/
			async studioSendStream(accountId, input, mode, onEvent, requestId) {
				const response = await fetch(XHS_API.studioMessages + query({ account: accountId }), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input,
						mode,
						stream: true,
						requestId
					})
				});
				if (!response.ok) {
					const body = await response.json().catch(() => void 0);
					throw new XhsApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
				}
				if (response.body === null) throw new XhsApiError("流式响应无 body");
				const reader = response.body.getReader();
				const decoder = new TextDecoder("utf-8");
				let buffer = "";
				let summary;
				let failed;
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					let boundary;
					while ((boundary = buffer.indexOf("\n\n")) >= 0) {
						const eventText = buffer.slice(0, boundary);
						buffer = buffer.slice(boundary + 2);
						for (const rawLine of eventText.split("\n")) {
							const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
							if (!line.startsWith("data: ")) continue;
							const event = parseSseEvent(line.slice(6));
							if (event === void 0) continue;
							onEvent(event);
							if (event.type === "error") failed = event.message;
							if (event.type === "done") summary = {
								messageId: event.messageId,
								coverPrompt: event.coverPrompt ?? "",
								evidence: event.evidence,
								personaId: event.personaId,
								quality: event.quality
							};
						}
					}
				}
				if (failed !== void 0) throw new XhsApiError(failed);
				if (summary === void 0) throw new XhsApiError("流式响应未正常结束");
				return summary;
			}
			/** 保存创作台草稿（v3 草稿独立，不含 topicId）。 */
			async studioSaveDraft(accountId, copy, coverPrompt, evidence) {
				return (await readJson(await fetch(XHS_API.studio + "/draft", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accountId,
						copy,
						coverPrompt,
						evidence
					})
				}))).draft;
			}
			async listDrafts() {
				return (await readJson(await fetch(XHS_API.drafts))).drafts;
			}
			async setDraftStatus(draftId, status, metrics) {
				await readJson(await fetch(XHS_API.drafts + "/status", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						draftId,
						status,
						metrics
					})
				}));
			}
			async updateDraft(draftId, payload) {
				await readJson(await fetch(XHS_API.drafts + query({ draft: draftId }), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}));
			}
		};
		//#endregion
		//#region src/client/controller.ts
		/** 面板开合状态 + 跨插件中栏互斥（与 dsh-task-board / dsh-ssh 共享激活协议）。 */
		/** 跨插件激活事件名。 */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		/** 本面板名。 */
		const PANEL_NAME = "xhsmatrix";
		/** 本面板激活属性。 */
		const ACTIVE_ATTR = "data-dsh-xhsmatrix-active";
		/** 需驱逐的兄弟面板激活属性。 */
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		/** 面板控制器。 */
		var PanelController = class {
			open = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return { panelOpen: this.open };
			}
			toggle() {
				if (this.open) this.close();
				else this.openPanel();
			}
			openPanel() {
				if (this.open) return;
				this.open = true;
				this.notify();
			}
			close() {
				if (!this.open) return;
				this.open = false;
				this.notify();
			}
			/** 订阅状态变化；返回退订函数。 */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			notify() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/** 界面文案：中文为主，英文键对齐（locale.register 需要 zh/en 两本词典）。 */
		const NS = "dsh-xhs-matrix";
		/** 中文字典。 */
		const zh = {
			"entry.label": "矩阵",
			"entry.tooltip": "小红书矩阵管理",
			"panel.title": "小红书矩阵",
			"tab.accounts": "账号",
			"tab.personas": "人设",
			"tab.drafts": "草稿"
		};
		/** 英文字典（键对齐）。 */
		const en = {
			"entry.label": "Matrix",
			"entry.tooltip": "Xiaohongshu matrix",
			"panel.title": "XHS Matrix",
			"tab.accounts": "Accounts",
			"tab.personas": "Personas",
			"tab.drafts": "Drafts"
		};
		//#endregion
		//#region \0xhs-css:/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix/.superpowers/worktrees/xhs-persona-v4/packages/dsh-xhs-matrix/src/client/panel/panel.module.css.mjs
		const css = "[data-dsh-xhsmatrix-view]{--xhs-red:#ff2442;--xhs-red-deep:#e01e39;--xhs-red-text:#d52b43;--xhs-red-soft:#fff0f2;--xhs-red-soft2:#fff5f6;--xhs-bg:#fff8f7;--xhs-bg-main:snow;--xhs-card:#fff;--xhs-text:#321f22;--xhs-text-sub:#ab9095;--xhs-text-weak:#b89ca1;--xhs-border:#f1e2e4;--xhs-border-soft:#f7edef;--xhs-face:#ffd4da;--xhs-thumb:#ffe0e4;--xhs-green:#269267;--xhs-green-soft:#e4f8ef;--xhs-warn:#b76c16;--xhs-warn-soft:#fff2df;--xhs-error:#c33c4b;--xhs-error-soft:#ffe9ec;--xhs-shadow:0 3px 10px #b63b4708;z-index:60;background:var(--xhs-bg);color:var(--xhs-text);font-family:Inter,Microsoft YaHei,PingFang SC,sans-serif;display:none;position:absolute;inset:0}html[data-dsh-xhsmatrix-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-xhsmatrix-view]{display:grid}[data-pane=conversation],[class*=centerCol]{position:relative}[data-dsh-xhsmatrix-entry]{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:6px 10px;font-size:13px;display:flex}[data-dsh-xhsmatrix-entry]:hover{color:#ff2442;background:#ff24420f}[data-dsh-xhsmatrix-entry][data-active]{color:#ff2442;background:#ff244214;font-weight:600}.XLBeMq_viewHost{background:var(--xhs-bg);color:var(--xhs-text);position:absolute;inset:0;overflow:hidden}.XLBeMq_viewGrid{grid-template-rows:minmax(0,1fr);grid-template-columns:188px 1fr;min-width:0;height:100%;display:grid}.XLBeMq_sidebar{background:var(--xhs-card);border-right:1px solid var(--xhs-border);flex-direction:column;grid-area:1/1;min-height:0;padding:16px 12px;display:flex;overflow-y:auto}.XLBeMq_brand{color:var(--xhs-text);align-items:center;gap:8px;margin:0 2px 18px;font-size:14px;font-weight:800;display:flex}.XLBeMq_brandLogo{background:var(--xhs-red);color:#fff;border-radius:9px;flex:none;place-items:center;width:28px;height:28px;font-size:12px;display:grid}.XLBeMq_group{color:var(--xhs-text-sub);letter-spacing:.5px;margin:14px 8px 6px;font-size:10px;font-weight:600}.XLBeMq_accountItem{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);cursor:pointer;text-align:left;border-radius:9px;align-items:center;gap:8px;width:100%;margin:0 0 6px;padding:7px 8px;font-size:12px;transition:border-color .15s,background .15s;display:flex}.XLBeMq_accountItem:hover{border-color:var(--xhs-red)}.XLBeMq_accountItem.XLBeMq_active{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.XLBeMq_face{background:var(--xhs-face);border-radius:50%;flex:none;width:24px;height:24px}.XLBeMq_accountName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.XLBeMq_statusDot{border-radius:50%;flex:none;width:8px;height:8px}.XLBeMq_statusDot.XLBeMq_ok{background:#31ae7e}.XLBeMq_statusDot.XLBeMq_warn{background:#f2a43e}.XLBeMq_statusDot.XLBeMq_error{background:#e25662}.XLBeMq_statusDot.XLBeMq_idle{background:#e4d9db}.XLBeMq_accountAdd{border:1px dashed var(--xhs-border);width:100%;color:var(--xhs-text-sub);cursor:pointer;background:0 0;border-radius:9px;align-items:center;gap:6px;padding:7px 10px;font-size:12px;display:flex}.XLBeMq_accountAdd:hover{border-color:var(--xhs-red);color:var(--xhs-red)}.XLBeMq_navItem{width:100%;color:var(--xhs-text-sub);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:9px;align-items:center;gap:8px;margin:2px 0;padding:8px 10px;font-size:13px;display:flex}.XLBeMq_navItem:hover{background:var(--xhs-red-soft);color:var(--xhs-red)}.XLBeMq_navItem.XLBeMq_active{background:var(--xhs-red-soft);color:var(--xhs-red);font-weight:700}.XLBeMq_navIcon{text-align:center;flex:none;width:16px;font-size:12px}.XLBeMq_workspace{background:var(--xhs-bg-main);flex-direction:column;grid-area:1/2;min-width:0;min-height:0;display:flex}.XLBeMq_topbar{border-bottom:1px solid var(--xhs-border);background:var(--xhs-card);justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;display:flex}.XLBeMq_topbar h3{color:var(--xhs-text);margin:0;font-size:17px;font-weight:700}.XLBeMq_topbarSub{color:var(--xhs-text-sub);margin-top:2px;font-size:11px}.XLBeMq_topbarRight{align-items:center;gap:10px;display:flex}.XLBeMq_modeSwitch{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:10px;gap:4px;width:max-content;padding:3px;display:flex}.XLBeMq_modeSwitch button{color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;border-radius:7px;padding:6px 12px;font-size:12px}.XLBeMq_modeSwitch button.XLBeMq_on{background:var(--xhs-red);color:#fff;font-weight:600}.XLBeMq_content{flex:1;min-height:0;padding:18px 22px;overflow-y:auto}.XLBeMq_overview{grid-template-columns:1.15fr .85fr;gap:14px;display:grid}.XLBeMq_panel{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;min-width:0;padding:14px}.XLBeMq_panelTitle{color:var(--xhs-text);justify-content:space-between;align-items:center;gap:8px;margin:0 0 12px;font-size:12px;font-weight:700;display:flex}.XLBeMq_metrics{grid-template-columns:repeat(3,1fr);gap:8px;display:grid}.XLBeMq_metric{background:var(--xhs-red-soft2);color:var(--xhs-text-sub);border-radius:10px;padding:10px;font-size:11px}.XLBeMq_metric b{color:var(--xhs-red);margin-top:3px;font-size:20px;font-weight:700;display:block}.XLBeMq_post{border-top:1px solid var(--xhs-border-soft);align-items:flex-start;gap:9px;padding:9px 0;font-size:12px;display:flex}.XLBeMq_post:first-of-type{border-top:0}.XLBeMq_thumb{background:var(--xhs-thumb);border-radius:7px;flex:none;width:34px;height:34px}.XLBeMq_postBody{flex:1;min-width:0}.XLBeMq_postTitle{color:var(--xhs-text);text-overflow:ellipsis;white-space:nowrap;font-weight:600;overflow:hidden}.XLBeMq_postMeta{color:var(--xhs-text-sub);margin-top:3px;font-size:11px}.XLBeMq_bar{background:#f4e3e6;border-radius:99px;height:5px;margin-top:6px;overflow:hidden}.XLBeMq_bar i{background:var(--xhs-red);border-radius:99px;height:100%;display:block}.XLBeMq_chat{flex-direction:column;height:100%;min-height:0;display:flex}.XLBeMq_chathead{color:var(--xhs-text);border-bottom:1px solid var(--xhs-border-soft);justify-content:space-between;align-items:center;padding-bottom:10px;font-size:12px;font-weight:700;display:flex}.XLBeMq_pill{background:var(--xhs-green-soft);color:var(--xhs-green);white-space:nowrap;border-radius:99px;padding:4px 8px;font-size:10px}.XLBeMq_pillWarn{background:var(--xhs-warn-soft);color:var(--xhs-warn)}.XLBeMq_bubble{background:var(--xhs-red-soft2);max-width:92%;color:var(--xhs-text);border-radius:10px;margin-top:9px;padding:9px 11px;font-size:12px;line-height:1.6}.XLBeMq_bubble.XLBeMq_me{background:var(--xhs-red);color:#fff;align-self:flex-end}.XLBeMq_chatInput{border:1px solid var(--xhs-border);color:var(--xhs-text-weak);background:var(--xhs-card);border-radius:9px;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding:10px;font-size:12px;display:flex}.XLBeMq_chatSend{background:var(--xhs-red);color:#fff;cursor:pointer;border:0;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600}.XLBeMq_below{grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;display:grid}.XLBeMq_chips{flex-wrap:wrap;gap:6px;display:flex}.XLBeMq_contextline{border-top:1px solid var(--xhs-border-soft);justify-content:space-between;align-items:center;gap:8px;padding:9px 0;font-size:12px;display:flex}.XLBeMq_contextline:first-of-type{border-top:0}.XLBeMq_studioLayout{grid-template-columns:1fr 268px;gap:0;height:100%;min-height:0;display:grid}.XLBeMq_studioMain{background:var(--xhs-bg-main);flex-direction:column;min-width:0;display:flex}.XLBeMq_studioTop{border-bottom:1px solid var(--xhs-border);background:var(--xhs-card);justify-content:space-between;align-items:center;gap:12px;height:56px;padding:0 20px;display:flex}.XLBeMq_studioTop strong{color:var(--xhs-text);font-size:14px}.XLBeMq_studioTopSub{color:var(--xhs-text-sub);margin-top:3px;font-size:11px}.XLBeMq_messages{flex:1;min-height:0;padding:16px 20px;overflow-y:auto}.XLBeMq_msg{gap:9px;max-width:92%;margin-bottom:14px;display:flex}.XLBeMq_msg.XLBeMq_me{flex-direction:row-reverse;margin-left:auto}.XLBeMq_msgAvatar{background:var(--xhs-red);color:#fff;border-radius:8px;flex:none;place-items:center;width:26px;height:26px;font-size:11px;display:grid}.XLBeMq_msg.XLBeMq_me .XLBeMq_msgAvatar{background:var(--xhs-face);color:#8a3945}.XLBeMq_msgBubble{background:var(--xhs-card);border:1px solid var(--xhs-border);color:var(--xhs-text);box-shadow:var(--xhs-shadow);white-space:pre-wrap;word-break:break-word;border-radius:11px;padding:10px 12px;font-size:13px;line-height:1.7}.XLBeMq_msg.XLBeMq_me .XLBeMq_msgBubble{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red)}.XLBeMq_studioResult{background:var(--xhs-red-soft2);border-radius:9px;margin-top:9px;padding:9px 11px;font-size:12px;line-height:1.6}.XLBeMq_studioResult b{color:var(--xhs-red-text);margin-bottom:5px;display:block}.XLBeMq_studioComposer{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:flex-end;gap:8px;margin:0 20px 16px;padding:8px 8px 8px 14px;display:flex}.XLBeMq_studioComposer textarea{resize:none;color:var(--xhs-text);background:0 0;border:none;outline:none;flex:1;min-height:44px;max-height:140px;font-family:inherit;font-size:13px;line-height:1.6}.XLBeMq_studioSend{background:var(--xhs-red);color:#fff;cursor:pointer;border:0;border-radius:8px;flex:none;padding:8px 14px;font-size:12px;font-weight:600}.XLBeMq_studioSend:disabled{opacity:.6;cursor:not-allowed}.XLBeMq_studioSendGhost{background:var(--xhs-card);color:var(--xhs-red-text);border:1px solid var(--xhs-border)}.XLBeMq_studioSendGhost:hover{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.XLBeMq_context{background:var(--xhs-card);border-left:1px solid var(--xhs-border);min-height:0;padding:16px 14px;overflow-y:auto}.XLBeMq_context h4{color:var(--xhs-text);margin:0 0 12px;font-size:12px;font-weight:700}.XLBeMq_contextCard{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:10px;margin-bottom:10px;padding:11px}.XLBeMq_contextCard h5{color:var(--xhs-text);margin:0 0 7px;font-size:11px;font-weight:700}.XLBeMq_contextLine{color:#8f777c;border-top:1px solid var(--xhs-border-soft);margin-top:7px;padding-top:7px;font-size:11px;line-height:1.55}.XLBeMq_contextLine:first-of-type{border-top:0;margin-top:0;padding-top:0}.XLBeMq_meter{background:#f3e4e6;border-radius:99px;height:6px;margin-top:6px;overflow:hidden}.XLBeMq_meter i{background:var(--xhs-red);border-radius:99px;width:86%;height:100%;display:block}.XLBeMq_tag{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:99px;margin:2px;padding:4px 8px;font-size:11px;display:inline-block}.XLBeMq_tag.XLBeMq_on{background:var(--xhs-red);color:#fff}.XLBeMq_filterRow{flex-wrap:wrap;gap:6px;margin-bottom:14px;display:flex}.XLBeMq_filter{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text-sub);cursor:pointer;border-radius:99px;padding:6px 12px;font-size:12px}.XLBeMq_filter.XLBeMq_on{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red)}.XLBeMq_libRow{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:flex-start;gap:10px;margin-bottom:9px;padding:12px 14px;display:flex}.XLBeMq_miniThumb{background:var(--xhs-thumb);border-radius:8px;flex:none;width:38px;height:38px}.XLBeMq_libBody{flex:1;min-width:0}.XLBeMq_libTitle{color:var(--xhs-text);font-size:13px;font-weight:600}.XLBeMq_libMeta{color:var(--xhs-text-sub);margin-top:4px;font-size:11px}.XLBeMq_weight{gap:4px;margin-top:8px;display:flex}.XLBeMq_weight button{background:var(--xhs-red-soft2);border:1px solid var(--xhs-border);width:22px;height:22px;color:var(--xhs-red-text);cursor:pointer;border-radius:5px;place-items:center;padding:0;font-size:11px;display:grid}.XLBeMq_weight button:hover{border-color:var(--xhs-red)}.XLBeMq_weight button.XLBeMq_on{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red);font-weight:700}.XLBeMq_topicItem{border-top:1px solid var(--xhs-border-soft);padding:11px 0;font-size:13px}.XLBeMq_topicItem:first-of-type{border-top:0}.XLBeMq_topicTitle{color:var(--xhs-text);margin-bottom:5px;font-weight:600;display:block}.XLBeMq_topicReason{color:var(--xhs-text-sub);font-size:11px;line-height:1.6}.XLBeMq_score{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:99px;margin-top:5px;padding:2px 8px;font-size:11px;display:inline-block}.XLBeMq_scoreLow{background:var(--xhs-warn-soft);color:var(--xhs-warn)}.XLBeMq_personaLayout{grid-template-columns:.95fr 1.05fr;gap:14px;display:grid}.XLBeMq_personaList{flex-direction:column;gap:8px;margin-bottom:14px;display:flex}.XLBeMq_personaItem{border:1px solid var(--xhs-border);background:var(--xhs-card);cursor:pointer;text-align:left;width:100%;color:var(--xhs-text);border-radius:11px;align-items:center;gap:10px;padding:11px 13px;display:flex}.XLBeMq_personaItem:hover{border-color:var(--xhs-red)}.XLBeMq_personaItem.XLBeMq_active{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.XLBeMq_personaAvatar{background:var(--xhs-face);border-radius:50%;flex:none;width:34px;height:34px}.XLBeMq_personaName{font-size:13px;font-weight:700}.XLBeMq_personaDesc{color:var(--xhs-text-sub);text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:11px;overflow:hidden}.XLBeMq_draftLayout{grid-template-columns:1fr .85fr;gap:14px;width:100%;display:grid}.XLBeMq_draftEditor,.XLBeMq_sourcePanel{min-width:0}.XLBeMq_source{border-top:1px solid var(--xhs-border-soft);padding:8px 0;font-size:12px;line-height:1.6}.XLBeMq_source:first-of-type{border-top:0}.XLBeMq_source b{color:var(--xhs-red-text);margin-bottom:3px;display:block}.XLBeMq_weightBadge{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:99px;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:400}.XLBeMq_editbar{flex-wrap:wrap;gap:6px;margin-top:12px;display:flex}.XLBeMq_overlay{z-index:200;background:#321f2259;place-items:center;display:grid;position:fixed;inset:0}.XLBeMq_dialog{background:var(--xhs-bg-main);border:1px solid var(--xhs-border);border-radius:14px;width:520px;max-width:calc(100vw - 40px);max-height:calc(100vh - 60px);padding:18px 20px;overflow-y:auto;box-shadow:0 12px 40px #321f222e}.XLBeMq_dialog h3{color:var(--xhs-text);margin:0 0 14px;font-size:16px;font-weight:700}.XLBeMq_dialogClose{float:right;color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;padding:2px 6px;font-size:18px;line-height:1}.XLBeMq_dialogClose:hover{color:var(--xhs-red)}.XLBeMq_dialogRow{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:11px;align-items:center;gap:10px;margin-bottom:8px;padding:10px 12px;font-size:13px;display:flex}.XLBeMq_dialogRow .XLBeMq_face{width:28px;height:28px}.XLBeMq_dialogRowActions{flex:none;gap:6px;margin-left:auto;display:flex}.XLBeMq_field{flex-direction:column;gap:6px;margin-bottom:12px;display:flex}.XLBeMq_field label{color:var(--xhs-text-sub);font-size:12px}.XLBeMq_input{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);border-radius:8px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.XLBeMq_input:focus{border-color:var(--xhs-red);outline:none;box-shadow:0 0 0 3px #ff244214}.XLBeMq_textarea{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);resize:vertical;border-radius:8px;min-height:80px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.XLBeMq_textarea:focus{border-color:var(--xhs-red);outline:none;box-shadow:0 0 0 3px #ff244214}.XLBeMq_button{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);cursor:pointer;border-radius:8px;padding:8px 16px;font-size:12px;transition:border-color .15s,color .15s,background .15s}.XLBeMq_button:hover{border-color:var(--xhs-red);color:var(--xhs-red)}.XLBeMq_primary{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:600;transition:background .15s}.XLBeMq_primary:hover{background:var(--xhs-red-deep)}.XLBeMq_primary:disabled{opacity:.6;cursor:not-allowed}.XLBeMq_ghostBtn{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-red-text);cursor:pointer;border-radius:8px;padding:7px 14px;font-size:12px}.XLBeMq_ghostBtn:hover{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.XLBeMq_dangerBtn{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-error);cursor:pointer;border-radius:8px;padding:7px 14px;font-size:12px}.XLBeMq_dangerBtn:hover{border-color:var(--xhs-error);background:var(--xhs-error-soft)}.XLBeMq_tabs{flex-wrap:wrap;gap:6px;margin-bottom:14px;display:flex}.XLBeMq_tab{color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;border-radius:999px;padding:7px 14px;font-size:12px}.XLBeMq_tab:hover{background:var(--xhs-red-soft);color:var(--xhs-red)}.XLBeMq_tabActive{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:600}.XLBeMq_card{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:center;gap:10px;margin-bottom:8px;padding:12px 14px;display:flex}.XLBeMq_badge{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.XLBeMq_badgeGreen{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.XLBeMq_badgeGray{color:var(--xhs-text-sub);background:#f5f1f1;border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.XLBeMq_badgeDanger{background:var(--xhs-error-soft);color:var(--xhs-error);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.XLBeMq_badgeWarn{background:var(--xhs-warn-soft);color:var(--xhs-warn);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.XLBeMq_success{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:8px;margin-bottom:10px;padding:10px 14px;font-size:12px}.XLBeMq_empty{background:var(--xhs-red-soft2);color:var(--xhs-text-sub);border-radius:9px;margin-bottom:10px;padding:12px 14px;font-size:12px}.XLBeMq_muted{color:var(--xhs-text-sub);font-size:12px}.XLBeMq_danger{background:var(--xhs-error-soft);color:var(--xhs-error);border-radius:8px;margin-bottom:10px;padding:9px 12px;font-size:12px}.XLBeMq_rowActions{flex:none;align-items:center;gap:8px;display:flex}.XLBeMq_spacer{flex:1}.XLBeMq_scopeBand{border-left:4px solid var(--xhs-red);background:var(--xhs-red-soft2);border-radius:0 12px 12px 0;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;margin-bottom:18px;padding:16px 18px;display:grid}.XLBeMq_scopeBand h2{color:var(--xhs-text);margin:0 0 3px;font-size:15px}.XLBeMq_scopeBand p{color:var(--xhs-text-sub);margin:0;font-size:12px}.XLBeMq_scopeStats{gap:18px;display:flex}.XLBeMq_scopeStats b{color:var(--xhs-red-text);font-size:17px;display:block}.XLBeMq_scopeStats span{color:var(--xhs-text-sub);font-size:10px}.XLBeMq_toolbar{flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0;display:flex}.XLBeMq_noteGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;display:grid}.XLBeMq_noteCard{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:12px;padding:16px}.XLBeMq_noteCard h3{color:var(--xhs-text);margin:10px 0 6px;font-size:14px}.XLBeMq_noteCard p{color:#6c5d60;margin:0 0 10px;font-size:12px}.XLBeMq_chip{color:#67595c;background:#f0ecea;border-radius:999px;align-items:center;gap:5px;padding:4px 8px;font-size:11px;display:inline-flex}.XLBeMq_chipRed{color:var(--xhs-red-text);background:#ffe7ec}.XLBeMq_chipGreen{color:var(--xhs-green);background:#e7f6ef}.XLBeMq_chipAmber{color:#9a5b08;background:#fff0d9}.XLBeMq_split{grid-template-columns:210px minmax(0,1fr);align-items:start;gap:14px;display:grid}.XLBeMq_batchList{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:12px;overflow:hidden}.XLBeMq_panelHead{border-bottom:1px solid var(--xhs-border);justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;display:flex}.XLBeMq_panelHead h3{color:var(--xhs-text);margin:0;font-size:13px}.XLBeMq_batch{background:var(--xhs-card);text-align:left;cursor:pointer;border:0;border-bottom:1px solid #f2e9e7;width:100%;padding:12px 14px}.XLBeMq_batch:last-child{border-bottom:0}.XLBeMq_batch.XLBeMq_active{box-shadow:inset 3px 0 var(--xhs-red);background:#fff8f8}.XLBeMq_batch strong{color:var(--xhs-text);margin-bottom:4px;font-size:12px;display:block}.XLBeMq_batch small{color:var(--xhs-text-sub)}.XLBeMq_batchCount{float:right;color:var(--xhs-red-text);font-weight:800}.XLBeMq_item{border-bottom:1px solid #f0e7e5;padding:15px 16px}.XLBeMq_item:last-child{border-bottom:0}.XLBeMq_itemTop{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.XLBeMq_item h4{color:var(--xhs-text);margin:0 0 5px;font-size:14px}.XLBeMq_meta{color:var(--xhs-text-sub);flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:11px;display:flex}.XLBeMq_excerpt{color:#5c4d50;margin:10px 0;font-size:12px}.XLBeMq_itemActions{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.XLBeMq_textAction{color:#78696c;cursor:pointer;background:0 0;border:0;padding:4px;font-size:11px}.XLBeMq_textAction:hover{color:var(--xhs-red-text)}.XLBeMq_warning{color:#8b570f;background:#fff6e8;border-left:3px solid #e7a746;border-radius:0 8px 8px 0;margin-top:10px;padding:7px 9px;font-size:11px}@media (width<=860px){.XLBeMq_noteGrid,.XLBeMq_split{grid-template-columns:1fr}}";
		const tagId = "dsh-xhs-matrix/panel.module.css?v=0925ff89";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-xhs-matrix";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"panelTitle": "XLBeMq_panelTitle",
			"studioSend": "XLBeMq_studioSend",
			"chathead": "XLBeMq_chathead",
			"empty": "XLBeMq_empty",
			"libRow": "XLBeMq_libRow",
			"personaName": "XLBeMq_personaName",
			"modeSwitch": "XLBeMq_modeSwitch",
			"tag": "XLBeMq_tag",
			"studioComposer": "XLBeMq_studioComposer",
			"score": "XLBeMq_score",
			"viewGrid": "XLBeMq_viewGrid",
			"group": "XLBeMq_group",
			"libMeta": "XLBeMq_libMeta",
			"sourcePanel": "XLBeMq_sourcePanel",
			"primary": "XLBeMq_primary",
			"face": "XLBeMq_face",
			"postBody": "XLBeMq_postBody",
			"filter": "XLBeMq_filter",
			"on": "XLBeMq_on",
			"thumb": "XLBeMq_thumb",
			"me": "XLBeMq_me",
			"sidebar": "XLBeMq_sidebar",
			"bar": "XLBeMq_bar",
			"miniThumb": "XLBeMq_miniThumb",
			"field": "XLBeMq_field",
			"spacer": "XLBeMq_spacer",
			"statusDot": "XLBeMq_statusDot",
			"warning": "XLBeMq_warning",
			"source": "XLBeMq_source",
			"chipRed": "XLBeMq_chipRed",
			"postMeta": "XLBeMq_postMeta",
			"dialogRow": "XLBeMq_dialogRow",
			"badge": "XLBeMq_badge",
			"context": "XLBeMq_context",
			"active": "XLBeMq_active",
			"badgeGreen": "XLBeMq_badgeGreen",
			"msgBubble": "XLBeMq_msgBubble",
			"messages": "XLBeMq_messages",
			"dialog": "XLBeMq_dialog",
			"idle": "XLBeMq_idle",
			"pill": "XLBeMq_pill",
			"brandLogo": "XLBeMq_brandLogo",
			"chatInput": "XLBeMq_chatInput",
			"contextLine": "XLBeMq_contextLine",
			"studioLayout": "XLBeMq_studioLayout",
			"textarea": "XLBeMq_textarea",
			"tabActive": "XLBeMq_tabActive",
			"scopeBand": "XLBeMq_scopeBand",
			"tabs": "XLBeMq_tabs",
			"noteCard": "XLBeMq_noteCard",
			"postTitle": "XLBeMq_postTitle",
			"topbar": "XLBeMq_topbar",
			"chatSend": "XLBeMq_chatSend",
			"studioMain": "XLBeMq_studioMain",
			"personaList": "XLBeMq_personaList",
			"weightBadge": "XLBeMq_weightBadge",
			"weight": "XLBeMq_weight",
			"dialogClose": "XLBeMq_dialogClose",
			"libBody": "XLBeMq_libBody",
			"meta": "XLBeMq_meta",
			"panel": "XLBeMq_panel",
			"studioTop": "XLBeMq_studioTop",
			"metric": "XLBeMq_metric",
			"batch": "XLBeMq_batch",
			"navItem": "XLBeMq_navItem",
			"draftLayout": "XLBeMq_draftLayout",
			"itemActions": "XLBeMq_itemActions",
			"batchCount": "XLBeMq_batchCount",
			"dangerBtn": "XLBeMq_dangerBtn",
			"overlay": "XLBeMq_overlay",
			"ghostBtn": "XLBeMq_ghostBtn",
			"personaLayout": "XLBeMq_personaLayout",
			"badgeWarn": "XLBeMq_badgeWarn",
			"textAction": "XLBeMq_textAction",
			"navIcon": "XLBeMq_navIcon",
			"msg": "XLBeMq_msg",
			"panelHead": "XLBeMq_panelHead",
			"meter": "XLBeMq_meter",
			"brand": "XLBeMq_brand",
			"contextline": "XLBeMq_contextline",
			"filterRow": "XLBeMq_filterRow",
			"topicTitle": "XLBeMq_topicTitle",
			"studioResult": "XLBeMq_studioResult",
			"batchList": "XLBeMq_batchList",
			"muted": "XLBeMq_muted",
			"card": "XLBeMq_card",
			"scopeStats": "XLBeMq_scopeStats",
			"badgeGray": "XLBeMq_badgeGray",
			"accountName": "XLBeMq_accountName",
			"button": "XLBeMq_button",
			"toolbar": "XLBeMq_toolbar",
			"chip": "XLBeMq_chip",
			"item": "XLBeMq_item",
			"chipAmber": "XLBeMq_chipAmber",
			"success": "XLBeMq_success",
			"editbar": "XLBeMq_editbar",
			"personaDesc": "XLBeMq_personaDesc",
			"viewHost": "XLBeMq_viewHost",
			"personaAvatar": "XLBeMq_personaAvatar",
			"ok": "XLBeMq_ok",
			"rowActions": "XLBeMq_rowActions",
			"accountAdd": "XLBeMq_accountAdd",
			"studioSendGhost": "XLBeMq_studioSendGhost",
			"below": "XLBeMq_below",
			"danger": "XLBeMq_danger",
			"split": "XLBeMq_split",
			"noteGrid": "XLBeMq_noteGrid",
			"topicReason": "XLBeMq_topicReason",
			"contextCard": "XLBeMq_contextCard",
			"accountItem": "XLBeMq_accountItem",
			"topbarRight": "XLBeMq_topbarRight",
			"chat": "XLBeMq_chat",
			"chipGreen": "XLBeMq_chipGreen",
			"draftEditor": "XLBeMq_draftEditor",
			"studioTopSub": "XLBeMq_studioTopSub",
			"warn": "XLBeMq_warn",
			"personaItem": "XLBeMq_personaItem",
			"itemTop": "XLBeMq_itemTop",
			"chips": "XLBeMq_chips",
			"metrics": "XLBeMq_metrics",
			"overview": "XLBeMq_overview",
			"topbarSub": "XLBeMq_topbarSub",
			"badgeDanger": "XLBeMq_badgeDanger",
			"content": "XLBeMq_content",
			"tab": "XLBeMq_tab",
			"post": "XLBeMq_post",
			"input": "XLBeMq_input",
			"dialogRowActions": "XLBeMq_dialogRowActions",
			"scoreLow": "XLBeMq_scoreLow",
			"bubble": "XLBeMq_bubble",
			"error": "XLBeMq_error",
			"workspace": "XLBeMq_workspace",
			"msgAvatar": "XLBeMq_msgAvatar",
			"libTitle": "XLBeMq_libTitle",
			"topicItem": "XLBeMq_topicItem",
			"pillWarn": "XLBeMq_pillWarn",
			"excerpt": "XLBeMq_excerpt"
		};
		//#endregion
		//#region src/client/panel/ImportDialog.tsx
		/**
		* 已在盘知识库导入（v4 人设资产视图）：导入目标为当前人设作用域。
		* - 「归属人设」只读展示当前选中人设名（作用域由父级 XhsPanel/KnowledgeTab 持有）。
		* - 标题（每行一个）+ 正文（与标题行号对应）构造 JSON 数组，经账号导入路由落到账号当前人设。
		* - 若用户临时切换过人设，账号导入仍走账号自身绑定人设（见 report「导入目标」歧义说明）。
		*/
		function ImportDialog({ api, accountId, personaId, onDone }) {
			const [personaName, setPersonaName] = (0, react.useState)("");
			const [titles, setTitles] = (0, react.useState)("");
			const [copies, setCopies] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				api.listPersonas().then((list) => setPersonaName(list.find((p) => p.id === personaId)?.name ?? personaId)).catch(() => setPersonaName(personaId));
			}, [api, personaId]);
			const run = async () => {
				const titleRows = titles.split("\n").map((line, index) => ({
					line: line.trim(),
					index
				})).filter((row) => row.line !== "");
				if (titleRows.length === 0) {
					setError("请输入至少一个标题");
					return;
				}
				const copyLines = copies.split("\n");
				const missing = titleRows.find((row) => (copyLines[row.index] ?? "").trim() === "");
				if (missing !== void 0) {
					setError(`第 ${missing.index + 1} 行缺少正文，标题与正文都必填且按行对应`);
					return;
				}
				const records = titleRows.map((row) => ({
					title: row.line,
					copy: copyLines[row.index] ?? ""
				}));
				try {
					const count = await api.importPublishedNotes(accountId, "json", JSON.stringify(records));
					setNotice(`已导入 ${count} 条已发布笔记。`);
					setTitles("");
					setCopies("");
					setError("");
					onDone();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.success,
					children: notice
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "归属人设" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: personaName,
						readOnly: true
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "标题（每行一个，必填）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: panel_module_css_default.input,
						rows: 5,
						value: titles,
						onChange: (e) => setTitles(e.target.value),
						placeholder: "标题 1\n标题 2\n标题 3"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "正文（按行对应，必填）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: panel_module_css_default.input,
						rows: 6,
						value: copies,
						onChange: (e) => setCopies(e.target.value),
						placeholder: "与左侧标题逐行对应的正文内容\n（标题与正文都必填，按行对应）"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.rowActions,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.primary,
						onClick: () => void run(),
						children: "导入"
					})
				})
			] });
		}
		//#endregion
		//#region src/client/panel/StatusBadge.tsx
		/** 账号/采集/数据来源状态徽标。 */
		function StatusBadge({ status, source }) {
			const labels = {
				unbound: "未绑定",
				bound: "已绑定",
				authorized: "已授权",
				"awaiting-import": "待导入",
				failed: "失败",
				expired: "已失效",
				idle: "空闲",
				success: "成功",
				running: "采集中",
				manual: "手动",
				import: "导入",
				apify: "Apify"
			};
			const text = labels[status] ?? labels[source ?? ""] ?? status;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${status === "failed" ? panel_module_css_default.badgeDanger : status === "running" ? panel_module_css_default.badgeWarn : panel_module_css_default.badgeGreen} ${panel_module_css_default.badge}`,
				children: text
			});
		}
		//#endregion
		//#region src/client/panel/AccountsDialog.tsx
		/**
		* 账号管理弹窗：列表 + 创建/编辑表单 + 绑定主页 + 笔记导入入口。
		*
		* v4：账号列表单一来源为父级 XhsPanel，本弹窗只接收 accounts 快照；创建成功后
		* 通过 onSaved(createdId) 通知父级「刷新→选中→关闭」，不再维护无法通知侧栏的账号副本。
		*/
		function AccountsDialog({ api, accounts, onClose, onSaved, onChanged }) {
			const [personas, setPersonas] = (0, react.useState)([]);
			const [name, setName] = (0, react.useState)("");
			const [personaId, setPersonaId] = (0, react.useState)("");
			const [profileUrl, setProfileUrl] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [editName, setEditName] = (0, react.useState)("");
			const [editPersonaId, setEditPersonaId] = (0, react.useState)("");
			const [editProfileUrl, setEditProfileUrl] = (0, react.useState)("");
			const [importingId, setImportingId] = (0, react.useState)(null);
			const refreshPersonas = (0, react.useCallback)(async () => {
				try {
					setPersonas(await api.listPersonas());
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refreshPersonas();
			}, [refreshPersonas]);
			const create = async () => {
				if (name.trim() === "") {
					setError("请输入账号名");
					return;
				}
				setError("");
				try {
					const { id } = await api.createAccount({
						name: name.trim(),
						personaId,
						enabled: true
					});
					if (profileUrl.trim() !== "") await api.updateAccount(id, {
						name: name.trim(),
						personaId,
						enabled: true,
						connection: {
							profileUrl: profileUrl.trim(),
							status: "awaiting-import",
							source: "manual"
						}
					});
					await onSaved(id);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const toggle = async (account) => {
				try {
					await api.updateAccount(account.id, {
						name: account.name,
						personaId: account.personaId,
						enabled: !account.enabled
					});
					await onChanged();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const remove = async (id) => {
				if (!window.confirm("确定删除该账号？其笔记、指标、草稿与创作记录会一并删除。")) return;
				try {
					await api.deleteAccount(id);
					await onChanged();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const startEdit = (account) => {
				setEditingId(account.id);
				setEditName(account.name);
				setEditPersonaId(account.personaId);
				setEditProfileUrl(account.connection?.profileUrl ?? "");
			};
			const saveEdit = async (account) => {
				try {
					await api.updateAccount(account.id, {
						name: editName,
						personaId: editPersonaId,
						enabled: account.enabled,
						connection: editProfileUrl.trim() === "" ? void 0 : {
							profileUrl: editProfileUrl.trim(),
							status: account.connection?.status === "bound" || account.connection?.status === "authorized" ? account.connection.status : "awaiting-import",
							source: account.connection?.source ?? "manual"
						}
					});
					setEditingId(null);
					setNotice("账号信息已保存。");
					await onChanged();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const cancelEdit = () => setEditingId(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.overlay,
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.dialog,
					onClick: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.dialogClose,
							onClick: onClose,
							"aria-label": "关闭",
							children: "×"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "账号管理" }),
						error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.danger,
							children: error
						}),
						notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.success,
							children: notice
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "新账号名" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "效率研究所"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "人设" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.input,
									value: personaId,
									onChange: (e) => setPersonaId(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "（未分配）"
									}), personas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: p.id,
										children: p.name
									}, p.id))]
								}),
								personas.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.muted,
									children: "还没有人设，请先到「人设配置」创建。"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "小红书主页 URL（可选，绑定后标记「待导入」）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: profileUrl,
								onChange: (e) => setProfileUrl(e.target.value),
								placeholder: "https://www.xiaohongshu.com/user/profile/..."
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.primary,
							onClick: () => void create(),
							children: "添加账号"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: { marginTop: 16 } }),
						accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.dialogRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.face }), editingId === account.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { width: 120 },
									value: editName,
									onChange: (e) => setEditName(e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.input,
									style: { width: 110 },
									value: editPersonaId,
									onChange: (e) => setEditPersonaId(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "（未分配）"
									}), personas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: p.id,
										children: p.name
									}, p.id))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { width: 170 },
									value: editProfileUrl,
									onChange: (e) => setEditProfileUrl(e.target.value),
									placeholder: "主页 URL"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.dialogRowActions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.button,
										onClick: () => void saveEdit(account),
										children: "保存"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.button,
										onClick: cancelEdit,
										children: "取消"
									})]
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { minWidth: 0 },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											fontWeight: 600,
											fontSize: 13
										},
										children: account.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.muted,
										style: { fontSize: 11 },
										children: [
											account.personaId === "" ? "未分配人设" : personas.find((p) => p.id === account.personaId)?.name ?? "未知人设",
											" · ",
											account.enabled ? "启用" : "停用"
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${panel_module_css_default.statusDot} ${panel_module_css_default[accountDot(account)]}` }),
								account.connection !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBadge, { status: account.connection.status }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.dialogRowActions,
									children: [
										account.connection?.profileUrl !== void 0 && account.connection.profileUrl !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											title: account.connection.profileUrl,
											onClick: () => {
												const url = account.connection?.profileUrl;
												if (url !== void 0) navigator.clipboard.writeText(url).catch(() => void 0);
											},
											children: "主页"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => setImportingId(importingId === account.id ? null : account.id),
											children: "导入笔记"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => startEdit(account),
											children: "编辑"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => void toggle(account),
											children: account.enabled ? "停用" : "启用"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.dangerBtn,
											onClick: () => void remove(account.id),
											children: "删除"
										})
									]
								})
							] })]
						}, account.id)),
						accounts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: "暂无账号。"
						}),
						importingId !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								marginTop: 14,
								padding: 14,
								border: "1px solid var(--xhs-border)",
								borderRadius: 12,
								background: "var(--xhs-card)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImportDialog, {
								api,
								accountId: importingId,
								personaId: accounts.find((account) => account.id === importingId)?.personaId ?? "",
								onDone: () => {
									onChanged();
									setImportingId(null);
								}
							})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/panel/DraftEditor.tsx
		/**
		* 草稿编辑器（设计稿 content/detail-surfaces.html）：
		* 左栏正文直接编辑 + 编辑动作（重写标题/优化开头），右栏本次生成依据；
		* 保存后仍保持「草稿」状态，不自动发布。
		*/
		function DraftEditor({ api, accountId, draft, onSaved }) {
			const [copy, setCopy] = (0, react.useState)(draft.copy);
			const [coverPrompt, setCoverPrompt] = (0, react.useState)(draft.coverPrompt);
			const [tags, setTags] = (0, react.useState)(draft.tags ?? "");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [noteTitles, setNoteTitles] = (0, react.useState)({});
			const [viralTitles, setViralTitles] = (0, react.useState)({});
			(0, react.useEffect)(() => {
				const evidence = draft.evidence;
				if (evidence === void 0) return;
				(async () => {
					try {
						if (evidence.noteIds.length > 0) {
							const notes = await api.listNotes(accountId);
							setNoteTitles(Object.fromEntries(notes.filter((n) => evidence.noteIds.includes(n.id)).map((n) => [n.id, n.title])));
						}
						if (evidence.trendIds.length > 0) {
							const virals = await api.listViralItems(accountId);
							setViralTitles(Object.fromEntries(virals.filter((v) => evidence.trendIds.includes(v.id)).map((v) => [v.id, v.title])));
						}
					} catch {}
				})();
			}, [
				api,
				accountId,
				draft.evidence
			]);
			const save = async () => {
				try {
					await api.updateDraft(draft.id, {
						copy,
						coverPrompt,
						tags
					});
					setNotice("草稿已保存（仍为草稿状态，不会自动发布）。");
					onSaved();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const runStudio = async (instruction, apply) => {
				setBusy(true);
				try {
					const text = (await api.studioSend(accountId, instruction, "creative")).message.content.trim();
					if (text !== "") apply(text);
					else setNotice("未获得有效输出，请手动修改。");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(false);
				}
			};
			const rewriteTitle = () => runStudio(`请只重写下面文案的第一行标题，使其更吸引人，不要改动正文，直接输出新标题：\n${copy}`, (text) => {
				const rest = copy.split("\n").slice(1).join("\n");
				setCopy(`${text}\n${rest}`);
			});
			const optimizeOpening = () => runStudio(`请只重写下面文案的第二行（正文开头），使其更有钩子，不要改动其他部分，直接输出新开头：\n${copy}`, (text) => {
				const lines = copy.split("\n");
				const rest = lines.slice(2).join("\n");
				setCopy(`${lines[0] ?? ""}\n${text}${rest !== "" ? `\n${rest}` : ""}`);
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.draftLayout,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: `${panel_module_css_default.panel} ${panel_module_css_default.draftEditor}`,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.panelTitle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "可直接编辑" })
						}),
						error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.danger,
							children: error
						}),
						notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.success,
							children: notice
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "标题（第一行）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: copy.split("\n")[0] ?? "",
								onChange: (e) => setCopy(`${e.target.value}\n${copy.split("\n").slice(1).join("\n")}`)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "正文" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.textarea,
								rows: 12,
								value: copy,
								onChange: (e) => setCopy(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "话题标签" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: tags,
								onChange: (e) => setTags(e.target.value),
								placeholder: "#效率工具 #职场成长"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "封面提示词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.textarea,
								rows: 3,
								value: coverPrompt,
								onChange: (e) => setCoverPrompt(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.editbar,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => void rewriteTitle(),
									disabled: busy,
									children: "重写标题"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => void optimizeOpening(),
									disabled: busy,
									children: "优化开头"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									onClick: () => void save(),
									children: "保存草稿"
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
					className: `${panel_module_css_default.panel} ${panel_module_css_default.sourcePanel}`,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.panelTitle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "本次生成依据" })
					}), draft.evidence === void 0 || draft.evidence.reasons.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.muted,
						children: "该草稿无生成依据记录（可能为手动创建）。"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						draft.evidence.persona !== void 0 && draft.evidence.persona !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["人设规则 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.weightBadge,
								children: "已使用"
							})] }), draft.evidence.persona]
						}),
						draft.evidence.noteIds.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["本地笔记 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.weightBadge,
								children: "高权重参考"
							})] }), draft.evidence.noteIds.map((id) => `· ${noteTitles[id] ?? id}`).join("\n")]
						}),
						draft.evidence.trendIds.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["已采纳爆款参考 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.weightBadge,
								children: "外部数据"
							})] }), draft.evidence.trendIds.map((id) => `· ${viralTitles[id] ?? id}`).join("\n")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "匹配理由" }), draft.evidence.reasons.join("；")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "编辑提醒" }), "已生成原创草稿，不复制外部原文；保存后仍为草稿状态。"]
						})
					] })]
				})]
			});
		}
		//#endregion
		//#region src/client/panel/DraftsTab.tsx
		/**
		* 草稿箱：列表 + 展开编辑（DraftEditor 双栏）+ 标记 published/dropped + 录入指标。
		* 草稿保持「草稿」状态，发布由人工在端内完成。
		*/
		function DraftsTab({ api, accountId, onOpenStudio }) {
			const [drafts, setDrafts] = (0, react.useState)([]);
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			const [expandedId, setExpandedId] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [draftList, accountList] = await Promise.all([api.listDrafts(), api.listAccounts()]);
					setDrafts(draftList);
					setAccounts(accountList);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? id;
			const visibleDrafts = accountId === "" ? drafts : drafts.filter((d) => d.accountId === accountId);
			const toggleExpand = (id) => {
				setExpandedId((prev) => prev === id ? null : id);
			};
			const copyDraft = async (draft) => {
				try {
					await navigator.clipboard.writeText(`【标题】${draft.copy}\n【封面提示词】${draft.coverPrompt}`);
				} catch {
					setError("复制失败：请手动复制");
				}
			};
			const publish = async (draft) => {
				try {
					await api.setDraftStatus(draft.id, "published");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const drop = async (draft) => {
				try {
					await api.setDraftStatus(draft.id, "dropped");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				accountId === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: "请先在左侧选择账号，草稿箱按账号隔离。"
				}),
				accountId !== "" && visibleDrafts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.muted,
					children: "该账号暂无草稿。在「创作台」中生成，或让助手为你撰写后保存。"
				}),
				visibleDrafts.map((draft) => {
					const expanded = expandedId === draft.id;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.libRow,
						style: { flexDirection: "column" },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									width: "100%",
									display: "flex",
									alignItems: "center",
									gap: 10
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontWeight: 600,
											fontSize: 13
										},
										children: draft.date
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.muted,
										children: ["账号 ", accountName(draft.accountId)]
									}),
									draft.status === "generated" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGray,
										children: "已生成"
									}) : draft.status === "published" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGreen,
										children: "已发布"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGray,
										children: "已弃用"
									}),
									draft.metrics !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge,
										children: ["阅读 ", draft.metrics.reads]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
									draft.status === "generated" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.primary,
										onClick: () => void publish(draft),
										children: "发布"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.dangerBtn,
										onClick: () => void drop(draft),
										children: "弃用"
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.ghostBtn,
										onClick: () => toggleExpand(draft.id),
										children: expanded ? "收起" : "展开"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.ghostBtn,
								style: {
									width: "100%",
									textAlign: "left",
									whiteSpace: "pre-wrap",
									cursor: "pointer",
									color: "var(--xhs-text-sub)"
								},
								onClick: () => toggleExpand(draft.id),
								title: "点击查看完整文案",
								children: expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontWeight: 600,
											color: "var(--xhs-text)"
										},
										children: draft.copy.split("\n")[0]
									}),
									"\n",
									draft.copy
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [draft.copy.slice(0, 100), draft.copy.length > 100 ? "…" : ""] })
							}),
							expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { width: "100%" },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.rowActions,
										style: {
											marginBottom: 10,
											flexWrap: "wrap"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.ghostBtn,
												onClick: () => void copyDraft(draft),
												children: "复制文案"
											}),
											draft.status === "generated" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.primary,
												onClick: () => void publish(draft),
												children: "标记已发布"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.dangerBtn,
												onClick: () => void drop(draft),
												children: "标记弃用"
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.ghostBtn,
												onClick: () => onOpenStudio(draft.accountId),
												children: "在创作台继续"
											})
										]
									}),
									draft.metrics !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "流量指标" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.muted,
											children: [
												"阅读 ",
												draft.metrics.reads,
												" · 点赞 ",
												draft.metrics.likes,
												" · 评论 ",
												draft.metrics.comments,
												"（采集于 ",
												draft.metrics.collected.slice(0, 10),
												"）"
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DraftEditor, {
										api,
										accountId: draft.accountId,
										draft,
										onSaved: () => void refresh()
									})
								]
							})
						]
					}, draft.id);
				})
			] });
		}
		//#endregion
		//#region src/client/panel/PersonaScopeSelector.tsx
		/** 人设作用域选择器：展示当前作用域人设名称，下拉可临时切换。 */
		function PersonaScopeSelector({ api, value, onChange }) {
			const [personas, setPersonas] = (0, react.useState)([]);
			(0, react.useEffect)(() => {
				api.listPersonas().then((list) => setPersonas(list.map((p) => ({
					id: p.id,
					name: p.name
				})))).catch(() => setPersonas([]));
			}, [api]);
			const currentName = value === "" ? "未分配" : personas.find((p) => p.id === value)?.name ?? "未知人设";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.filterRow,
				style: { marginBottom: 10 },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.muted,
						style: { alignSelf: "center" },
						children: "当前资产人设："
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						className: panel_module_css_default.input,
						style: { width: 220 },
						"aria-label": "切换人设",
						value,
						onChange: (e) => onChange(e.target.value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: "（未分配）"
						}), personas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: p.id,
							children: p.name
						}, p.id))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.muted,
						style: { alignSelf: "center" },
						children: currentName === "未分配" ? "该账号未绑定人设" : "作用域：" + currentName
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/KnowledgeTab.tsx
		const WEIGHTS$1 = [
			0,
			1,
			2,
			3,
			4,
			5
		];
		/** 返回文本中命中的违禁词列表（仅用于参考素材警告，不阻止收录）。 */
		function forbiddenHit$1(text, words) {
			return words.filter((word) => word !== "" && text.includes(word));
		}
		/** 已发布知识库（v4 人设资产视图，设计稿 persona-owned-content-ui-reference）： */
		function KnowledgeTab({ api, accountId, personaId, onPersonaChange }) {
			const [notes, setNotes] = (0, react.useState)([]);
			const [allPersonas, setAllPersonas] = (0, react.useState)([]);
			const [sharedAccounts, setSharedAccounts] = (0, react.useState)(0);
			const [pending, setPending] = (0, react.useState)([]);
			const [search, setSearch] = (0, react.useState)("");
			const [sourceFilter, setSourceFilter] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [importing, setImporting] = (0, react.useState)(false);
			const [transferNote, setTransferNote] = (0, react.useState)(null);
			const [transferTarget, setTransferTarget] = (0, react.useState)("");
			const [pendingOpen, setPendingOpen] = (0, react.useState)(false);
			const [assignTarget, setAssignTarget] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const persona = allPersonas.find((p) => p.id === personaId);
			const refresh = (0, react.useCallback)(async () => {
				if (personaId === "") {
					setNotes([]);
					return;
				}
				try {
					setNotes(await api.listNotes(personaId));
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api, personaId]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				api.listPersonas().then((list) => setAllPersonas(list.map((p) => ({
					id: p.id,
					name: p.name,
					forbiddenWords: p.forbiddenWords ?? []
				})))).catch(() => setAllPersonas([]));
			}, [api]);
			(0, react.useEffect)(() => {
				api.listAccounts().then((list) => setSharedAccounts(list.filter((a) => a.personaId === personaId).length)).catch(() => setSharedAccounts(0));
			}, [api, personaId]);
			(0, react.useEffect)(() => {
				api.listPending().then((list) => setPending(list)).catch(() => setPending([]));
			}, [api]);
			const setWeight = async (noteId, weight) => {
				try {
					await api.setNoteWeight(personaId, noteId, weight);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const transfer = async () => {
				if (transferNote === null) return;
				if (transferTarget === "" || transferTarget === personaId) return;
				setBusy(true);
				try {
					await api.transferNotes(personaId, transferTarget, [transferNote.id]);
					setTransferNote(null);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(false);
				}
			};
			const assign = async (pendingId, kind) => {
				if (assignTarget === "") return;
				try {
					await api.assignPending(pendingId, assignTarget);
					setPending((prev) => prev.filter((entry) => entry.id !== pendingId));
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const sourceAccounts = (0, react.useMemo)(() => {
				const set = /* @__PURE__ */ new Set();
				for (const note of notes) if (note.sourceAccountName !== void 0) set.add(note.sourceAccountName);
				return Array.from(set);
			}, [notes]);
			const highCount = notes.filter((note) => note.weight >= 4).length;
			const filtered = notes.filter((note) => {
				if (search !== "" && !(note.title.includes(search) || note.copy.includes(search))) return false;
				if (sourceFilter !== "" && note.sourceAccountName !== sourceFilter) return false;
				return true;
			}).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
			const personaName = persona?.name ?? (personaId === "" ? "未分配" : personaId);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				accountId === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: "请先在左侧选择账号。"
				}),
				accountId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PersonaScopeSelector, {
						api,
						value: personaId,
						onChange: onPersonaChange
					}),
					personaId === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.empty,
						children: "该账号未绑定人设，请在右上角切换到某个人设，或先到「人设配置」为账号绑定人设。"
					}),
					personaId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.scopeBand,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", { children: [personaName, " · 已发布知识库"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "同一人设下的账号共同复用；发布账号作为来源快照保留。" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.scopeStats,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: notes.length }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "已发布" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: highCount }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "高权重" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: sharedAccounts }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "共享账号" })] })
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.toolbar,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { width: 180 },
									placeholder: "搜索标题或正文",
									value: search,
									onChange: (e) => setSearch(e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.input,
									"aria-label": "来源账号",
									value: sourceFilter,
									onChange: (e) => setSourceFilter(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "全部来源账号"
									}), sourceAccounts.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: name,
										children: name
									}, name))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.spacer }),
								pending.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: panel_module_css_default.button,
									onClick: () => {
										setPendingOpen(true);
										setAssignTarget("");
									},
									children: ["待归属 ", pending.length]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									onClick: () => setImporting(true),
									children: "导入已发布笔记"
								})
							]
						}),
						notes.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: "该人设还没有已发布笔记。点击「导入已发布笔记」导入后台数据到该人设。"
						}),
						notes.length > 0 && filtered.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.muted,
							children: "当前筛选下没有笔记。"
						}),
						filtered.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.noteGrid,
							children: filtered.map((note) => {
								const hits = forbiddenHit$1(note.title + note.copy, persona?.forbiddenWords ?? []);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.noteCard,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.meta,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.chipGreen,
												children: "已发布"
											}), note.sourceAccountName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: panel_module_css_default.chip,
												children: ["来源：", note.sourceAccountName]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: note.title }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: note.copy.length > 90 ? `${note.copy.slice(0, 90)}…` : note.copy }),
										hits.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.warning,
											children: [
												"参考素材命中人设违禁词「",
												hits[0],
												"」：只警告，不阻止收录；生成内容会强制拦截。"
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.itemActions,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.muted,
													children: "参考权重"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.weight,
													children: WEIGHTS$1.map((weight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														className: note.weight === weight ? panel_module_css_default.on : void 0,
														title: `权重 ${weight}`,
														onClick: () => void setWeight(note.id, weight),
														children: weight
													}, weight))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: panel_module_css_default.textAction,
													onClick: () => {
														setTransferNote(note);
														setTransferTarget("");
													},
													children: "转移人设"
												})
											]
										})
									]
								}, note.id);
							})
						}),
						importing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								marginTop: 14,
								padding: 14,
								border: "1px solid var(--xhs-border)",
								borderRadius: 12,
								background: "var(--xhs-card)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImportDialog, {
								api,
								accountId,
								personaId,
								onDone: () => {
									refresh();
									setImporting(false);
								}
							})
						}),
						transferNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.overlay,
							onClick: () => setTransferNote(null),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.dialog,
								onClick: (e) => e.stopPropagation(),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.dialogClose,
										onClick: () => setTransferNote(null),
										"aria-label": "关闭",
										children: "×"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "转移笔记到其他人设" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "目标人设" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: panel_module_css_default.input,
											"aria-label": "转移目标人设",
											value: transferTarget,
											onChange: (e) => setTransferTarget(e.target.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: "选择目标人设"
											}), allPersonas.filter((p) => p.id !== personaId).map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: p.id,
												children: p.name
											}, p.id))]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.rowActions,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.primary,
											disabled: busy || transferTarget === "" || transferTarget === personaId,
											onClick: () => void transfer(),
											children: "确认转移"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => setTransferNote(null),
											children: "取消"
										})]
									})
								]
							})
						}),
						pendingOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.overlay,
							onClick: () => setPendingOpen(false),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.dialog,
								onClick: (e) => e.stopPropagation(),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.dialogClose,
										onClick: () => setPendingOpen(false),
										"aria-label": "关闭",
										children: "×"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "待归属数据" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.muted,
										style: { marginBottom: 10 },
										children: "以下内容在迁移时无法解析人设，请显式归属到目标人设。"
									}),
									pending.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.muted,
										children: "没有待归属数据。"
									}),
									pending.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										style: {
											borderTop: "1px solid var(--xhs-border)",
											paddingTop: 10
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: entry.payload.title ?? entry.kind }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: panel_module_css_default.input,
												"aria-label": "归属目标人设",
												value: assignTarget,
												onChange: (e) => setAssignTarget(e.target.value),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: "选择目标人设"
												}), allPersonas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: p.id,
													children: p.name
												}, p.id))]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.primary,
												style: { marginTop: 8 },
												onClick: () => void assign(entry.id, entry.kind),
												children: "归属到该人设"
											})
										]
									}, entry.id)),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowActions,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => setPendingOpen(false),
											children: "关闭"
										})
									})
								]
							})
						})
					] })
				] })
			] });
		}
		//#endregion
		//#region src/client/panel/OverviewTab.tsx
		/**
		* 运营总览（设计稿 content/hybrid-layout.html + 设计文档 §8.2）：
		* 矩阵级多账号总览 —— 显示所有账号的状态、指标、知识库表现与草稿摘要；
		* 爆款池按账号隔离，每个账号卡片显示自己的爆款条数，
		* 具体条目进入该账号的「爆款池」工作区查看。
		*/
		function OverviewTab({ api, accounts, onOpenAccount, onOpenStudio, onAccountUpdated }) {
			const [summaries, setSummaries] = (0, react.useState)([]);
			const [personas, setPersonas] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			const [bindingFor, setBindingFor] = (0, react.useState)(null);
			const [bindPick, setBindPick] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				if (accounts.length === 0) {
					setSummaries([]);
					return;
				}
				try {
					const [personaList, draftList] = await Promise.all([api.listPersonas(), api.listDrafts()]);
					setPersonas(personaList);
					const rows = await Promise.all(accounts.map(async (account) => {
						const [noteList, metricList, viralList] = await Promise.all([
							api.listNotes(account.id),
							api.listMetrics(account.id),
							api.listViralItems(account.id)
						]);
						const latestByNote = /* @__PURE__ */ new Map();
						for (const m of metricList) {
							const prev = latestByNote.get(m.noteId);
							if (prev === void 0 || m.collectedAt > prev.collectedAt) latestByNote.set(m.noteId, m);
						}
						const reads = [...latestByNote.values()].reduce((sum, m) => sum + m.reads, 0);
						return {
							account,
							personaName: personaList.find((p) => p.id === account.personaId)?.name ?? "未分配",
							noteCount: noteList.length,
							highWeightCount: noteList.filter((n) => n.weight >= 3).length,
							reads,
							draftCount: draftList.filter((d) => d.accountId === account.id && d.status === "generated").length,
							viralCount: viralList.length
						};
					}));
					setSummaries(rows);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api, accounts]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			/** 在总览卡片上直接绑定/更换账号人设。 */
			const bindPersona = async (account) => {
				if (bindPick === "") {
					setError("请选择一个人设");
					return;
				}
				try {
					await api.updateAccount(account.id, {
						name: account.name,
						personaId: bindPick,
						enabled: account.enabled
					});
					setBindingFor(null);
					setBindPick("");
					setError("");
					await refresh();
					onAccountUpdated();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const totalNotes = summaries.reduce((sum, row) => sum + row.noteCount, 0);
			summaries.reduce((sum, row) => sum + row.draftCount, 0);
			const totalReads = summaries.reduce((sum, row) => sum + row.reads, 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				accounts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: "还没有账号。点击右上角「＋ 添加账号」创建第一个矩阵账号，开始建立独立工作区。"
				}),
				accounts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.metrics,
					style: { marginBottom: 14 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.metric,
							children: ["矩阵账号", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: accounts.length })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.metric,
							children: ["累计已发布", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: totalNotes })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.metric,
							children: ["累计浏览", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: totalReads.toLocaleString() })]
						})
					]
				}), summaries.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.libRow,
					style: { flexDirection: "column" },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								width: "100%",
								display: "flex",
								alignItems: "center",
								gap: 10
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.face }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { minWidth: 0 },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											fontWeight: 700,
											fontSize: 14
										},
										children: row.account.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginTop: 2
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.muted,
											style: { fontSize: 11 },
											children: ["人设：", row.personaName]
										}), bindingFor === row.account.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: panel_module_css_default.input,
												style: {
													width: 150,
													padding: "3px 8px",
													fontSize: 11
												},
												value: bindPick,
												onChange: (e) => setBindPick(e.target.value),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: "（选择人设）"
												}), personas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: p.id,
													children: p.name
												}, p.id))]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.ghostBtn,
												style: {
													padding: "3px 10px",
													fontSize: 11
												},
												onClick: () => void bindPersona(row.account),
												children: "确认"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.ghostBtn,
												style: {
													padding: "3px 10px",
													fontSize: 11
												},
												onClick: () => {
													setBindingFor(null);
													setBindPick("");
												},
												children: "取消"
											})
										] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											style: {
												padding: "3px 10px",
												fontSize: 11
											},
											onClick: () => {
												setBindingFor(row.account.id);
												setBindPick(row.account.personaId);
											},
											children: row.personaName === "未分配" ? "绑定人设" : "更换人设"
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${panel_module_css_default.statusDot} ${panel_module_css_default[accountDot(row.account)]}` }),
								row.account.connection !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBadge, { status: row.account.connection.status }),
								row.account.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badgeGreen,
									children: "启用"
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badgeGray,
									children: "停用"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowActions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => onOpenAccount(row.account.id, "knowledge"),
											children: "知识库"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => onOpenAccount(row.account.id, "viral"),
											children: "爆款池"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.ghostBtn,
											onClick: () => onOpenAccount(row.account.id, "drafts"),
											children: "草稿"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.primary,
											onClick: () => onOpenStudio(row.account.id),
											children: "进入创作台"
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.metrics,
							style: { marginTop: 10 },
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.metric,
									children: ["已发布", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: row.noteCount })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.metric,
									children: ["最近浏览", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: row.reads.toLocaleString() })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.metric,
									children: ["高权重样本", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: row.highWeightCount })]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.muted,
							style: {
								marginTop: 6,
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"爆款池：",
								row.viralCount,
								" 条"
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.ghostBtn,
								style: {
									padding: "2px 8px",
									fontSize: 11
								},
								onClick: () => onOpenAccount(row.account.id, "viral"),
								children: row.viralCount > 0 ? "查看该账号爆款池" : "去采集爆款"
							})]
						}),
						row.account.connection?.lastError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.muted,
							style: { marginTop: 4 },
							children: ["连接：", row.account.connection.lastError]
						}),
						row.account.collectionStatus?.lastError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.muted,
							style: { marginTop: 4 },
							children: ["采集：", row.account.collectionStatus.lastError]
						})
					]
				}, row.account.id))] })
			] });
		}
		//#endregion
		//#region src/client/panel/PersonasTab.tsx
		const HOOK_OPTIONS = [
			"反常识",
			"痛点切入",
			"真实对比",
			"教程结构",
			"经验清单",
			"互动提问"
		];
		/** 人设列表项：仅名称与摘要。 */
		function personaSummary(p) {
			return p.positioning || p.expertise || p.contentDirections || p.prompt || "";
		}
		/**
		* 人设配置（设计稿 content/detail-surfaces.html）：
		* 左侧选择人设，右侧结构化两栏编辑——定位/受众/禁用表达 + 写作风格/钩子/结构/标准。
		*/
		function PersonasTab({ api }) {
			const [personas, setPersonas] = (0, react.useState)([]);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [name, setName] = (0, react.useState)("");
			const [prompt, setPrompt] = (0, react.useState)("");
			const [toneTags, setToneTags] = (0, react.useState)("");
			const [positioning, setPositioning] = (0, react.useState)("");
			const [audience, setAudience] = (0, react.useState)("");
			const [expertise, setExpertise] = (0, react.useState)("");
			const [contentDirections, setContentDirections] = (0, react.useState)("");
			const [hookStyles, setHookStyles] = (0, react.useState)([]);
			const [bodyStructure, setBodyStructure] = (0, react.useState)("");
			const [endingStyle, setEndingStyle] = (0, react.useState)("");
			const [forbiddenExpressions, setForbiddenExpressions] = (0, react.useState)("");
			const [topicCriteria, setTopicCriteria] = (0, react.useState)("");
			const [defaultHashtags, setDefaultHashtags] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				try {
					setPersonas(await api.listPersonas());
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const load = (persona) => {
				setSelectedId(persona.id);
				setCreating(false);
				setName(persona.name);
				setPrompt(persona.prompt);
				setToneTags((persona.toneTags ?? []).join(", "));
				setPositioning(persona.positioning ?? "");
				setAudience(persona.audience ?? "");
				setExpertise(persona.expertise ?? "");
				setContentDirections(persona.contentDirections ?? "");
				setHookStyles(persona.hookStyles ?? []);
				setBodyStructure(persona.bodyStructure ?? "");
				setEndingStyle(persona.endingStyle ?? "");
				setForbiddenExpressions(persona.forbiddenExpressions ?? "");
				setTopicCriteria(persona.topicCriteria ?? "");
				setDefaultHashtags((persona.defaultHashtags ?? []).join(", "));
			};
			const startCreate = () => {
				setSelectedId(null);
				setCreating(true);
				setName("");
				setPrompt("");
				setToneTags("");
				setPositioning("");
				setAudience("");
				setExpertise("");
				setContentDirections("");
				setHookStyles([]);
				setBodyStructure("");
				setEndingStyle("");
				setForbiddenExpressions("");
				setTopicCriteria("");
				setDefaultHashtags("");
			};
			const splitList = (text) => {
				const items = text.split(/[,，]/).map((t) => t.trim()).filter((t) => t !== "");
				return items.length > 0 ? items : void 0;
			};
			const save = async () => {
				if (name.trim() === "") {
					setError("请输入人设名");
					return;
				}
				const payload = {
					name: name.trim(),
					prompt,
					toneTags: splitList(toneTags),
					positioning: positioning.trim() === "" ? void 0 : positioning.trim(),
					audience: audience.trim() === "" ? void 0 : audience.trim(),
					expertise: expertise.trim() === "" ? void 0 : expertise.trim(),
					contentDirections: contentDirections.trim() === "" ? void 0 : contentDirections.trim(),
					hookStyles: hookStyles.length > 0 ? hookStyles : void 0,
					bodyStructure: bodyStructure.trim() === "" ? void 0 : bodyStructure.trim(),
					endingStyle: endingStyle.trim() === "" ? void 0 : endingStyle.trim(),
					forbiddenExpressions: forbiddenExpressions.trim() === "" ? void 0 : forbiddenExpressions.trim(),
					topicCriteria: topicCriteria.trim() === "" ? void 0 : topicCriteria.trim(),
					defaultHashtags: splitList(defaultHashtags)
				};
				try {
					if (creating) {
						const { id } = await api.createPersona(payload);
						setSelectedId(id);
						setCreating(false);
						setNotice(`人设「${payload.name}」已创建。`);
					} else if (selectedId !== null) {
						await api.updatePersona(selectedId, payload);
						setNotice(`人设「${payload.name}」已保存。`);
					}
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const remove = async () => {
				if (selectedId === null) return;
				if (!window.confirm("确定删除该人设？已分配该人设的账号将变为未分配。")) return;
				try {
					await api.deletePersona(selectedId);
					setSelectedId(null);
					setNotice("人设已删除。");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const toggleHook = (style) => {
				setHookStyles((prev) => prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.success,
					children: notice
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.personaList,
					children: [personas.map((persona) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: selectedId === persona.id && !creating ? `${panel_module_css_default.personaItem} ${panel_module_css_default.active}` : panel_module_css_default.personaItem,
						onClick: () => load(persona),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.personaAvatar }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.personaName,
									children: persona.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.personaDesc,
									children: personaSummary(persona) || "未填写定位"
								})]
							}),
							(persona.toneTags ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge,
								children: (persona.toneTags ?? []).join("、")
							})
						]
					}, persona.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.accountAdd,
						onClick: startCreate,
						children: "＋ 新建人设"
					})]
				}),
				(selectedId !== null || creating) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.personaLayout,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.panel,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.panelTitle,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "账号定位与提示词" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "人设名" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: name,
									onChange: (e) => setName(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "系统提示词 / 账号定位" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.textarea,
									rows: 3,
									value: prompt,
									onChange: (e) => setPrompt(e.target.value),
									placeholder: "你是一个真实、克制、擅长实测的效率工具创作者……"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "一句话定位" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: positioning,
									onChange: (e) => setPositioning(e.target.value),
									placeholder: "实用派测评 · 真实、不夸张"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "目标受众" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: audience,
									onChange: (e) => setAudience(e.target.value),
									placeholder: "25-35 岁职场人，想提升效率但反感夸大宣传"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "领域 / 专业度" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: expertise,
									onChange: (e) => setExpertise(e.target.value),
									placeholder: "AI 工具、职场效率"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "禁用表达（逗号分隔）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: forbiddenExpressions,
									onChange: (e) => setForbiddenExpressions(e.target.value),
									placeholder: "绝对化承诺, 纯鸡汤"
								})]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.panel,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.panelTitle,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "写作风格" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "钩子风格 · 可多选" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.chips,
									children: HOOK_OPTIONS.map((style) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: hookStyles.includes(style) ? `${panel_module_css_default.tag} ${panel_module_css_default.on}` : panel_module_css_default.tag,
										onClick: () => toggleHook(style),
										children: style
									}, style))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "正文结构" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: bodyStructure,
									onChange: (e) => setBodyStructure(e.target.value),
									placeholder: "场景 → 问题 → 实测过程 → 结论 → 互动提问"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "结尾风格" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: endingStyle,
									onChange: (e) => setEndingStyle(e.target.value),
									placeholder: "总结价值 + 互动提问"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "内容方向" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.textarea,
									rows: 2,
									value: contentDirections,
									onChange: (e) => setContentDirections(e.target.value),
									placeholder: "真实体验、工具对比、可复现方法"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "选题标准" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.textarea,
									rows: 2,
									value: topicCriteria,
									onChange: (e) => setTopicCriteria(e.target.value),
									placeholder: "必须有具体价值；优先真实体验、工具对比"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "默认话题（逗号分隔）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: defaultHashtags,
									onChange: (e) => setDefaultHashtags(e.target.value),
									placeholder: "#效率工具, #职场成长"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "口癖标签（逗号分隔）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: toneTags,
									onChange: (e) => setToneTags(e.target.value),
									placeholder: "口语化, 结尾提问"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									onClick: () => void save(),
									children: "保存设置"
								}), !creating && selectedId !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.dangerBtn,
									onClick: () => void remove(),
									children: "删除人设"
								})]
							})
						]
					})]
				})
			] });
		}
		//#endregion
		//#region src/client/panel/StudioTab.tsx
		/**
		* 专属创作台（设计稿 content/creative-studio.html）：
		* 对话区最大化 + 右侧本次创作上下文（人设/知识库/已采纳爆款参考/指标快照），
		* 上下文始终可见，生成结果通过人工操作保存为草稿。
		*/
		function StudioTab({ api, accountId, personaId, onOpenDraft }) {
			const [messages, setMessages] = (0, react.useState)([]);
			const [input, setInput] = (0, react.useState)("");
			const [mode, setMode] = (0, react.useState)("creative");
			const [error, setError] = (0, react.useState)("");
			const [sending, setSending] = (0, react.useState)(false);
			const [evidence, setEvidence] = (0, react.useState)(void 0);
			const [streamText, setStreamText] = (0, react.useState)("");
			const [coverPrompt, setCoverPrompt] = (0, react.useState)("");
			const [context, setContext] = (0, react.useState)({
				personaName: "",
				hookStyles: [],
				noteCount: 0,
				highCount: 0,
				viralCount: 0
			});
			const refresh = (0, react.useCallback)(async () => {
				if (accountId === "") {
					setMessages([]);
					setContext({
						personaName: "",
						hookStyles: [],
						noteCount: 0,
						highCount: 0,
						viralCount: 0
					});
					return;
				}
				try {
					const [msgList, personaList, noteList, viralList] = await Promise.all([
						api.listStudioMessages(accountId),
						api.listPersonas(),
						personaId === "" ? Promise.resolve([]) : api.listNotes(personaId),
						personaId === "" ? Promise.resolve([]) : api.listViralItems(personaId, "accepted")
					]);
					setMessages(msgList);
					const persona = personaList.find((p) => p.id === personaId);
					setContext({
						personaName: persona?.name ?? "未分配",
						hookStyles: persona?.hookStyles ?? [],
						noteCount: noteList.length,
						highCount: noteList.filter((n) => n.weight >= 3).length,
						viralCount: viralList.length
					});
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [
				api,
				accountId,
				personaId
			]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const send = async () => {
				if (input.trim() === "" || sending) return;
				const prompt = input.trim();
				setInput("");
				setSending(true);
				setStreamText("");
				setEvidence(void 0);
				setCoverPrompt("");
				setError("");
				try {
					const summary = await api.studioSendStream(accountId, prompt, mode, (event) => {
						if (event.type === "content_delta") setStreamText((prev) => prev + event.delta);
					});
					setEvidence(summary.evidence);
					setCoverPrompt(summary.coverPrompt ?? "");
					setStreamText("");
					await refresh();
				} catch (e) {
					setStreamText("");
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setSending(false);
				}
			};
			const saveLastAsDraft = async () => {
				const last = [...messages].reverse().find((m) => m.role === "assistant");
				if (last === void 0) {
					setError("还没有生成结果可保存");
					return;
				}
				try {
					await api.studioSaveDraft(accountId, last.content, coverPrompt, evidence);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			if (accountId === "") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: "请先在左侧「我的账号」选择账号，再进入创作台。"
			});
			const hasConversation = messages.length > 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.studioLayout,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.studioMain,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: panel_module_css_default.studioTop,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "专属创作台" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.studioTopSub,
								children: "人设、知识库、已采纳爆款参考已隔离加载"
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.pill,
								children: "● 仅矩阵内容"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.messages,
							children: [
								error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.danger,
									children: error
								}),
								!hasConversation && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.msg,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgAvatar,
										children: "薯"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.msgBubble,
										children: ["你好，我是本账号的专属创作助手。我只处理当前账号的人设、已发布内容、已采纳爆款参考和草稿。", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.studioResult,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "已加载创作上下文" }),
												"人设规则 · ",
												context.noteCount,
												" 篇本地知识库 · ",
												context.highCount,
												" 篇高权重样本 · ",
												context.viralCount,
												" 个已采纳爆款参考"
											]
										})]
									})]
								}),
								messages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: message.role === "user" ? `${panel_module_css_default.msg} ${panel_module_css_default.me}` : panel_module_css_default.msg,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgAvatar,
										children: message.role === "user" ? "我" : "薯"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgBubble,
										children: message.content
									})]
								}, message.id)),
								sending && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.msg,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgAvatar,
										children: "薯"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.msgBubble,
										children: [streamText === "" ? "生成中…" : streamText, streamText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.muted,
											children: " ▍"
										})]
									})]
								}),
								!sending && coverPrompt !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.msg,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgAvatar,
										children: "薯"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgBubble,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.studioResult,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "封面提示词" }), coverPrompt]
										})
									})]
								}),
								evidence !== void 0 && evidence.reasons.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.msg,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgAvatar,
										children: "薯"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.msgBubble,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.studioResult,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本次生成依据" }),
												evidence.reasons.join("；"),
												evidence.persona !== void 0 && evidence.persona !== "" && `（人设：${evidence.persona}）`
											]
										})
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.studioComposer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 2,
								value: input,
								onChange: (e) => setInput(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										send();
									}
								},
								placeholder: "输入创作指令，例如：找 3 个今天适合发布的选题，并把第 1 个写成可发布草稿……"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.studioSend,
								onClick: () => void send(),
								disabled: sending || input.trim() === "",
								children: sending ? "生成中…" : "发送 ↑"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8,
								padding: "0 20px 16px",
								alignItems: "center"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.modeSwitch,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: mode === "creative" ? panel_module_css_default.on : void 0,
										onClick: () => setMode("creative"),
										children: "创作模式"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: mode === "full" ? panel_module_css_default.on : void 0,
										onClick: () => setMode("full"),
										children: "完整知识库"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.muted,
									style: { flex: 1 },
									children: mode === "creative" ? "仅高权重样本进入上下文" : "全部已发布笔记进入上下文"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: panel_module_css_default.studioSendGhost,
									onClick: () => void saveLastAsDraft(),
									disabled: sending,
									children: ["保存最近结果为草稿", coverPrompt !== "" ? "（含封面提示词）" : ""]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.studioSendGhost,
									onClick: onOpenDraft,
									children: "打开草稿箱"
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
					className: panel_module_css_default.context,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "本次创作上下文" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", { children: "账号人设" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.contextLine,
									children: context.personaName
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { marginTop: 6 },
									children: (context.hookStyles.length === 0 ? ["待配置"] : context.hookStyles).map((style) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.tag,
										children: style
									}, style))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", { children: "本地知识库" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.contextLine,
									children: [
										context.noteCount,
										" 篇已发布 · ",
										context.highCount,
										" 篇高权重"
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.meter,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.contextLine,
									children: "权重 5 样本优先参考，权重 0 样本不进入推荐"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", { children: "已采纳爆款参考" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.contextLine,
									children: [context.viralCount, " 个已采纳爆款"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.contextLine,
									children: "仅使用公开数据，不复制原文"
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/panel/ViralTab.tsx
		const WEIGHTS = [
			0,
			1,
			2,
			3,
			4,
			5
		];
		const BODY_PREVIEW_LENGTH = 90;
		const SOURCE_LABEL = {
			apify: "自动采集",
			manual: "手动新增",
			import: "导入"
		};
		function forbiddenHit(text, words) {
			return words.filter((word) => word !== "" && text.includes(word));
		}
		function ViralTab({ api, accountId, personaId, onPersonaChange }) {
			const [batches, setBatches] = (0, react.useState)([]);
			const [allPersonas, setAllPersonas] = (0, react.useState)([]);
			const [sharedAccounts, setSharedAccounts] = (0, react.useState)(0);
			const [pending, setPending] = (0, react.useState)([]);
			const [filter, setFilter] = (0, react.useState)("");
			const [sourceFilter, setSourceFilter] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [expandedBatchId, setExpandedBatchId] = (0, react.useState)(null);
			const [manualOpen, setManualOpen] = (0, react.useState)(false);
			const [manualTitle, setManualTitle] = (0, react.useState)("");
			const [manualBody, setManualBody] = (0, react.useState)("");
			const [manualSourceUrl, setManualSourceUrl] = (0, react.useState)("");
			const [manualPublishedAt, setManualPublishedAt] = (0, react.useState)("");
			const [transferItem, setTransferItem] = (0, react.useState)(null);
			const [transferTarget, setTransferTarget] = (0, react.useState)("");
			const [pendingOpen, setPendingOpen] = (0, react.useState)(false);
			const [assignTarget, setAssignTarget] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [collecting, setCollecting] = (0, react.useState)(false);
			const [reviewingId, setReviewingId] = (0, react.useState)("");
			const [configOpen, setConfigOpen] = (0, react.useState)(false);
			const [apifyConfigured, setApifyConfigured] = (0, react.useState)(false);
			const [actorId, setActorId] = (0, react.useState)("");
			const [apiToken, setApiToken] = (0, react.useState)("");
			const [maxItems, setMaxItems] = (0, react.useState)("10");
			const [savingConfig, setSavingConfig] = (0, react.useState)(false);
			const refresh = (0, react.useCallback)(async () => {
				if (personaId === "") {
					setBatches([]);
					return;
				}
				try {
					setBatches(await api.listViralBatches(personaId, filter === "" ? void 0 : filter));
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [
				api,
				personaId,
				filter
			]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				api.listPersonas().then((list) => setAllPersonas(list.map((p) => ({
					id: p.id,
					name: p.name,
					forbiddenWords: p.forbiddenWords ?? []
				})))).catch(() => setAllPersonas([]));
			}, [api]);
			(0, react.useEffect)(() => {
				api.listAccounts().then((list) => setSharedAccounts(list.filter((a) => a.personaId === personaId).length)).catch(() => setSharedAccounts(0));
			}, [api, personaId]);
			(0, react.useEffect)(() => {
				api.listPending().then((list) => setPending(list)).catch(() => setPending([]));
			}, [api]);
			const initialBatchSet = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!initialBatchSet.current && batches.length > 0) {
					initialBatchSet.current = true;
					setExpandedBatchId(batches[0].id);
				}
			}, [batches]);
			(0, react.useEffect)(() => {
				api.getApifyConfig().then((config) => {
					setApifyConfigured(config.actorId !== "" && config.apiToken !== "");
					setActorId(config.actorId);
					setApiToken(config.apiToken);
					setMaxItems(String(config.maxItems ?? 10));
				}).catch(() => {});
			}, [api]);
			const collect = async () => {
				if (accountId === "") {
					setError("请先在左侧选择账号");
					return;
				}
				setCollecting(true);
				try {
					await api.collectViral(accountId);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setCollecting(false);
				}
			};
			const review = async (itemId, status) => {
				setReviewingId(itemId);
				try {
					await api.reviewViralItem(personaId, itemId, status);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setReviewingId("");
				}
			};
			const deleteBatch = async (batchId) => {
				if (!window.confirm("确定删除这个采集批次？该批次的全部爆款（含已采纳）将被移除，不影响其他批次。")) return;
				try {
					await api.deleteViralBatch(personaId, batchId);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const addManual = async () => {
				if (manualTitle.trim() === "" || manualBody.trim() === "") {
					setError("标题与正文必填");
					return;
				}
				const payload = {
					title: manualTitle.trim(),
					body: manualBody.trim()
				};
				if (manualSourceUrl.trim() !== "") payload.sourceUrl = manualSourceUrl.trim();
				if (manualPublishedAt !== "") payload.publishedAt = manualPublishedAt;
				setBusy(true);
				try {
					await api.addManualViral(personaId, payload);
					setManualOpen(false);
					setManualTitle("");
					setManualBody("");
					setManualSourceUrl("");
					setManualPublishedAt("");
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(false);
				}
			};
			const transfer = async () => {
				if (transferItem === null) return;
				if (transferTarget === "" || transferTarget === personaId) return;
				setBusy(true);
				try {
					await api.transferVirals(personaId, transferTarget, [transferItem.id]);
					setTransferItem(null);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(false);
				}
			};
			const assign = async (pendingId) => {
				if (assignTarget === "") return;
				try {
					await api.assignPending(pendingId, assignTarget);
					setPending((prev) => prev.filter((entry) => entry.id !== pendingId));
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const openConfig = () => {
				api.getApifyConfig().then((config) => {
					setActorId(config.actorId);
					setApiToken(config.apiToken);
					setMaxItems(String(config.maxItems ?? 10));
					setConfigOpen(true);
				}).catch(() => setConfigOpen(true));
			};
			const saveConfig = async () => {
				if (actorId.trim() === "" || apiToken.trim() === "") {
					setError("Actor ID 与 API Token 必填");
					return;
				}
				if (!actorId.includes("/")) {
					setError("Actor ID 格式应为「用户名/Actor名」");
					return;
				}
				setSavingConfig(true);
				try {
					await api.updateApifyConfig({
						actorId: actorId.trim(),
						apiToken: apiToken.trim(),
						maxItems: Number(maxItems) > 0 ? Number(maxItems) : 10
					});
					setApifyConfigured(true);
					setConfigOpen(false);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setSavingConfig(false);
				}
			};
			const persona = allPersonas.find((p) => p.id === personaId);
			const personaName = persona?.name ?? (personaId === "" ? "未分配" : personaId);
			const allItems = (0, react.useMemo)(() => batches.flatMap((batch) => batch.items), [batches]);
			const acceptedCount = allItems.filter((item) => item.status === "accepted").length;
			const pendingCount = allItems.filter((item) => item.status === "pending").length;
			const avgWeight = allItems.length === 0 ? "0" : (allItems.reduce((sum, item) => sum + item.weight, 0) / allItems.length).toFixed(1);
			const expandedBatch = batches.find((batch) => batch.id === expandedBatchId) ?? null;
			const filterSource = (item) => {
				if (sourceFilter === "") return true;
				return (item.source === "apify" ? "auto" : "manual") === sourceFilter;
			};
			const visibleItems = (batch) => batch.items.filter((item) => {
				if (!filterSource(item)) return false;
				if (filter !== "" && item.status !== filter) return false;
				return true;
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PersonaScopeSelector, {
					api,
					value: personaId,
					onChange: onPersonaChange
				}),
				personaId === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: "该账号未绑定人设，请在右上角切换到某个人设，或先到「人设配置」为账号绑定人设。"
				}),
				personaId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.scopeBand,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", { children: [personaName, " · 共享爆款池"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							"由 ",
							sharedAccounts,
							" 个账号共同使用；切换账号不会搬移或复制内容。"
						] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.scopeStats,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: acceptedCount }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "已采纳" })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: pendingCount }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "待审核" })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: avgWeight }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "平均权重" })] })
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.toolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: panel_module_css_default.input,
								value: filter,
								onChange: (e) => setFilter(e.target.value),
								"aria-label": "状态",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "全部状态"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "accepted",
										children: "已采纳"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "pending",
										children: "待审核"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "ignored",
										children: "已忽略"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: panel_module_css_default.input,
								value: sourceFilter,
								onChange: (e) => setSourceFilter(e.target.value),
								"aria-label": "来源",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "全部来源"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "auto",
										children: "自动采集"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "manual",
										children: "手动新增"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.spacer }),
							pending.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.button,
								onClick: () => {
									setPendingOpen(true);
									setAssignTarget("");
								},
								children: ["待归属 ", pending.length]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.ghostBtn,
								onClick: openConfig,
								children: "配置 Apify"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.primary,
								onClick: () => void collect(),
								disabled: collecting,
								children: collecting ? "采集中…" : "采集爆款"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.primary,
								onClick: () => setManualOpen(true),
								children: "＋ 手动新增"
							})
						]
					}),
					batches.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.muted,
						children: ["爆款池为空。点击「采集爆款」从外部数据源拉取内容并按当前人设与知识库排序；", !apifyConfigured && " 先点击「配置 Apify」填写 Actor ID 与 API Token。"]
					}),
					batches.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.split,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: panel_module_css_default.batchList,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.panelHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "采集批次" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.muted,
									children: [batches.length, " 批"]
								})]
							}), batches.map((batch) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: expandedBatchId === batch.id ? panel_module_css_default.batch + " " + panel_module_css_default.active : panel_module_css_default.batch,
								onClick: () => setExpandedBatchId(batch.id),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.batchCount,
										children: batch.items.length
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: batch.query !== void 0 && batch.query !== "" ? batch.query : batch.id }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["自动采集 · ", batch.collectedAt.slice(0, 16).replace("T", " ")] })
								]
							}, batch.id))]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							className: panel_module_css_default.panel,
							children: expandedBatch === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.muted,
								style: { padding: 16 },
								children: "选择一个批次查看条目。"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.panelHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: expandedBatch.query !== void 0 && expandedBatch.query !== "" ? expandedBatch.query : expandedBatch.id }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.chipAmber,
											children: [visibleItems(expandedBatch).filter((item) => item.status === "pending").length, " 待审核"]
										}),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.chipGreen,
											children: [visibleItems(expandedBatch).filter((item) => item.status === "accepted").length, " 已采纳"]
										})
									] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.dangerBtn,
									style: {
										border: 0,
										borderBottom: "1px solid var(--xhs-border)",
										borderRadius: 0,
										width: "100%"
									},
									onClick: () => void deleteBatch(expandedBatch.id),
									children: "删除该批次"
								}),
								visibleItems(expandedBatch).length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.muted,
									style: { padding: 16 },
									children: "该批次在当前筛选下没有条目。"
								}),
								visibleItems(expandedBatch).map((item) => {
									const hits = forbiddenHit(item.title + item.body, persona?.forbiddenWords ?? []);
									const preview = item.body.length > BODY_PREVIEW_LENGTH ? item.body.slice(0, BODY_PREVIEW_LENGTH) + "…" : item.body;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.item,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.itemTop,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: item.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.meta,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: item.source === "manual" ? panel_module_css_default.chipRed : panel_module_css_default.chip,
																children: SOURCE_LABEL[item.source] ?? item.source
															}),
															item.sourceAccountName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["来源：", item.sourceAccountName] }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["机器评分 ", item.score] })
														]
													})] }),
													item.status === "accepted" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.chipGreen,
														children: "已采纳"
													}),
													item.status === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.chipAmber,
														children: "待审核"
													}),
													item.status === "ignored" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.chip,
														children: "已忽略"
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: panel_module_css_default.excerpt,
												children: preview === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.muted,
													children: "（无正文摘要）"
												}) : preview
											}),
											item.sourceUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.excerpt,
												style: { marginTop: 0 },
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
													href: item.sourceUrl,
													target: "_blank",
													rel: "noreferrer",
													style: { color: "var(--xhs-red)" },
													children: "来源链接 ↗"
												})
											}),
											hits.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.warning,
												children: [
													"参考素材命中人设违禁词「",
													hits[0],
													"」：只警告，不阻止收录；生成内容会强制拦截。"
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.itemActions,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.muted,
														children: "人工权重"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.weight,
														children: WEIGHTS.map((weight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															className: item.weight === weight ? panel_module_css_default.on : void 0,
															title: "权重 " + weight,
															disabled: reviewingId === item.id,
															children: weight
														}, weight))
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.muted,
														children: [
															"权重 ",
															item.weight,
															" / 5"
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														className: panel_module_css_default.textAction,
														onClick: () => {
															setTransferItem(item);
															setTransferTarget("");
														},
														children: "转移人设"
													}),
													item.status === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														className: panel_module_css_default.primary,
														disabled: reviewingId === item.id,
														onClick: () => void review(item.id, "accepted"),
														children: "采纳"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														className: panel_module_css_default.ghostBtn,
														disabled: reviewingId === item.id,
														onClick: () => void review(item.id, "ignored"),
														children: "忽略"
													})] })
												]
											})
										]
									}, item.id);
								})
							] })
						})]
					})
				] }),
				manualOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.overlay,
					onClick: () => setManualOpen(false),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialog,
						onClick: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dialogClose,
								onClick: () => setManualOpen(false),
								"aria-label": "关闭",
								children: "×"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "手动新增爆款笔记" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "归属人设" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: personaName,
									readOnly: true
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "标题" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: manualTitle,
									onChange: (e) => setManualTitle(e.target.value),
									placeholder: "爆款标题"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "正文" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.textarea,
									rows: 4,
									value: manualBody,
									onChange: (e) => setManualBody(e.target.value),
									placeholder: "粘贴或输入爆款笔记正文。"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "来源链接 · 可选" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: manualSourceUrl,
									onChange: (e) => setManualSourceUrl(e.target.value),
									placeholder: "https://"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "发布时间 · 可选" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									type: "date",
									value: manualPublishedAt,
									onChange: (e) => setManualPublishedAt(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.helper,
								children: "默认已采纳 · 权重 5"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => setManualOpen(false),
									children: "取消"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									disabled: busy,
									onClick: () => void addManual(),
									children: "保存到该人设"
								})]
							})
						]
					})
				}),
				transferItem !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.overlay,
					onClick: () => setTransferItem(null),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialog,
						onClick: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dialogClose,
								onClick: () => setTransferItem(null),
								"aria-label": "关闭",
								children: "×"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "转移到其他人设" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "目标人设" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.input,
									"aria-label": "转移目标人设",
									value: transferTarget,
									onChange: (e) => setTransferTarget(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "选择目标人设"
									}), allPersonas.filter((p) => p.id !== personaId).map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: p.id,
										children: p.name
									}, p.id))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									disabled: busy || transferTarget === "" || transferTarget === personaId,
									onClick: () => void transfer(),
									children: "确认转移"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => setTransferItem(null),
									children: "取消"
								})]
							})
						]
					})
				}),
				pendingOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.overlay,
					onClick: () => setPendingOpen(false),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialog,
						onClick: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dialogClose,
								onClick: () => setPendingOpen(false),
								"aria-label": "关闭",
								children: "×"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "待归属数据" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.muted,
								style: { marginBottom: 10 },
								children: "以下内容在迁移时无法解析人设，请显式归属到目标人设。"
							}),
							pending.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.muted,
								children: "没有待归属数据。"
							}),
							pending.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								style: {
									borderTop: "1px solid var(--xhs-border)",
									paddingTop: 10
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: entry.payload.title ?? entry.kind }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: panel_module_css_default.input,
										"aria-label": "归属目标人设",
										value: assignTarget,
										onChange: (e) => setAssignTarget(e.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "选择目标人设"
										}), allPersonas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: p.id,
											children: p.name
										}, p.id))]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.primary,
										style: { marginTop: 8 },
										onClick: () => void assign(entry.id),
										children: "归属到该人设"
									})
								]
							}, entry.id)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.rowActions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => setPendingOpen(false),
									children: "关闭"
								})
							})
						]
					})
				}),
				configOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.overlay,
					onClick: () => setConfigOpen(false),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialog,
						onClick: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dialogClose,
								onClick: () => setConfigOpen(false),
								"aria-label": "关闭",
								children: "×"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "配置 Apify 爆款数据源" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.muted,
								style: {
									marginBottom: 12,
									lineHeight: 1.7
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "如何获取：" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"1. 打开 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										href: "https://apify.com",
										target: "_blank",
										rel: "noreferrer",
										style: { color: "var(--xhs-red)" },
										children: "apify.com"
									}),
									" 注册账号。",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"2. ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "API Token" }),
									"：Settings → Integrations 复制（形如 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "apify_api_xxx" }),
									"）。",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"3. ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "Actor ID" }),
									"：Apify Store 搜索小红书 Actor（如 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "kuaima/xiaohongshu-search" }),
									"）。",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"4. 保存配置后点「采集爆款」。采集消耗 Apify 平台额度，请按需使用。"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "Actor ID" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: actorId,
									onChange: (e) => setActorId(e.target.value),
									placeholder: "如 kuaima/xiaohongshu-search"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "API Token" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									type: "password",
									value: apiToken,
									onChange: (e) => setApiToken(e.target.value),
									placeholder: "apify_api_..."
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "单次最大候选数" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									type: "number",
									min: 1,
									value: maxItems,
									onChange: (e) => setMaxItems(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									onClick: () => void saveConfig(),
									disabled: savingConfig,
									children: savingConfig ? "保存中…" : "保存配置"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.ghostBtn,
									onClick: () => setConfigOpen(false),
									children: "取消"
								})]
							})
						]
					})
				})
			] });
		}
		//#endregion
		//#region src/client/panel/XhsPanel.tsx
		const NAV_GROUPS = [
			{
				group: "运营",
				items: [
					{
						id: "overview",
						icon: "◈",
						label: "总览"
					},
					{
						id: "knowledge",
						icon: "▤",
						label: "已发布知识库"
					},
					{
						id: "viral",
						icon: "✦",
						label: "爆款池"
					}
				]
			},
			{
				group: "创作",
				items: [{
					id: "studio",
					icon: "✎",
					label: "创作台"
				}, {
					id: "drafts",
					icon: "▣",
					label: "草稿箱"
				}]
			},
			{
				group: "设置",
				items: [{
					id: "personas",
					icon: "◉",
					label: "人设配置"
				}]
			}
		];
		/** 根据连接与采集状态计算左侧状态点（绿/橙/红/灰）。 */
		function accountDot(account) {
			const status = account.connection?.status ?? "";
			if (status === "failed" || account.collectionStatus?.lastStatus === "failed") return "error";
			if (status === "awaiting-import" || status === "unbound" || account.collectionStatus?.running) return "warn";
			if (status === "bound" || status === "authorized") return "ok";
			return "idle";
		}
		const PAGE_TITLES = {
			overview: "账号运营总览",
			knowledge: "已发布知识库",
			viral: "爆款池",
			studio: "专属创作台",
			drafts: "草稿箱",
			personas: "人设配置"
		};
		/**
		* 矩阵工作台：左侧导航承载账号切换与运营/创作/设置模块，右侧为当前账号的独立工作区。
		*
		* v4：人设成为内容资产主体。XhsPanel 统一保存「资产人设作用域」assetPersonaId：
		* 默认跟随当前账号人设，知识库/爆款池允许临时切换，再次选择账号时重新跟随其
		* 人设。asset methods 以该作用域为主参数，不再把账号 id 当作人设发送。
		*/
		function XhsPanel(props) {
			const { api } = props;
			const [pageByAccount, setPageByAccount] = (0, react.useState)({});
			const [accountId, setAccountId] = (0, react.useState)("");
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [dialogOpen, setDialogOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [personaScope, setPersonaScope] = (0, react.useState)(null);
			const refreshAccounts = (0, react.useCallback)(async () => {
				try {
					setAccounts(await api.listAccounts());
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refreshAccounts();
			}, [refreshAccounts]);
			(0, react.useEffect)(() => {
				if (accounts.length === 0) {
					setAccountId("");
					return;
				}
				if (!accounts.some((item) => item.id === accountId)) setAccountId(accounts[0].id);
			}, [accounts, accountId]);
			const current = accounts.find((item) => item.id === accountId);
			const currentPage = accountId === "" ? "overview" : pageByAccount[accountId] ?? "overview";
			(0, react.useEffect)(() => {
				setPersonaScope(null);
			}, [accountId]);
			const assetPersonaId = personaScope !== null && personaScope.accountId === accountId ? personaScope.personaId : current?.personaId ?? "";
			const setAssetPersonaId = (id) => setPersonaScope({
				accountId,
				personaId: id
			});
			/** 记录当前账号所在的页面位置。 */
			const rememberPage = (next) => {
				if (accountId !== "") setPageByAccount((prev) => ({
					...prev,
					[accountId]: next
				}));
			};
			/** 导航点击：只在当前账号的工作区里切换页面。 */
			const navigate = (page) => rememberPage(page);
			/** 切换到指定账号并打开其工作区中的某个页面。 */
			const openAccountPage = (id, page) => {
				setAccountId(id);
				setPageByAccount((prev) => ({
					...prev,
					[id]: page
				}));
			};
			/** 进入某账号的创作台（总览/草稿入口）。 */
			const openStudio = (id) => openAccountPage(id, "studio");
			const openDrafts = () => rememberPage("drafts");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.viewGrid,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: panel_module_css_default.sidebar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.brand,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.brandLogo,
									children: "薯"
								}), "矩阵工作台"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.group,
								children: "我的账号"
							}),
							accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: accountId === account.id ? `${panel_module_css_default.accountItem} ${panel_module_css_default.active}` : panel_module_css_default.accountItem,
								onClick: () => setAccountId(account.id),
								title: account.name,
								"aria-current": accountId === account.id ? "true" : void 0,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.face }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.accountName,
										children: account.name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${panel_module_css_default.statusDot} ${panel_module_css_default[accountDot(account)]}` })
								]
							}, account.id)),
							accounts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.empty,
								children: "还没有账号，点击下方添加。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.accountAdd,
								onClick: () => setDialogOpen(true),
								children: "＋ 添加账号"
							}),
							NAV_GROUPS.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.group,
								children: group.group
							}), group.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: currentPage === item.id ? `${panel_module_css_default.navItem} ${panel_module_css_default.active}` : panel_module_css_default.navItem,
								onClick: () => navigate(item.id),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.navIcon,
									children: item.icon
								}), item.label]
							}, item.id))] }, group.group))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
						className: panel_module_css_default.workspace,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.topbar,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: currentPage === "overview" && current !== void 0 ? `${current.name} · ${PAGE_TITLES.overview}` : currentPage === "studio" && current !== void 0 ? `${PAGE_TITLES.studio} · ${current.name}` : PAGE_TITLES[currentPage] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.topbarSub,
								children: currentPage === "studio" && current !== void 0 ? "人设、知识库、爆款池已隔离加载 · 仅矩阵内容" : "小红书矩阵内容管理"
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.topbarRight,
								children: [currentPage === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.modeSwitch,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.on,
										onClick: () => rememberPage("overview"),
										children: "运营总览"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => {
											if (accountId !== "") openStudio(accountId);
										},
										children: "专属创作台"
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.primary,
									onClick: () => setDialogOpen(true),
									children: "＋ 添加账号"
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.content,
							children: [
								error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.danger,
									children: error
								}),
								currentPage === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverviewTab, {
									api,
									accounts,
									onOpenAccount: openAccountPage,
									onOpenStudio: openStudio,
									onAccountUpdated: () => {
										refreshAccounts();
									}
								}),
								currentPage === "knowledge" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KnowledgeTab, {
									api,
									accountId,
									personaId: assetPersonaId,
									onPersonaChange: setAssetPersonaId
								}, `kb-${accountId}`),
								currentPage === "viral" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViralTab, {
									api,
									accountId,
									personaId: assetPersonaId,
									onPersonaChange: setAssetPersonaId
								}, `vp-${accountId}`),
								currentPage === "studio" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StudioTab, {
									api,
									accountId,
									personaId: current?.personaId ?? "",
									onOpenDraft: openDrafts
								}, `st-${accountId}`),
								currentPage === "drafts" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DraftsTab, {
									api,
									accountId,
									onOpenStudio: openStudio
								}, `df-${accountId}`),
								currentPage === "personas" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PersonasTab, { api })
							]
						})]
					}),
					dialogOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountsDialog, {
						api,
						accounts,
						onClose: () => setDialogOpen(false),
						onSaved: async (createdId) => {
							await refreshAccounts();
							setAccountId(createdId);
							setDialogOpen(false);
						},
						onChanged: () => {
							refreshAccounts();
						}
					})
				]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/** 面板视图挂载：中栏接管为独立 React root，data 属性控制显隐。 */
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* 挂载面板 React 树到中栏并绑定显隐。
		* @param controller - 面板控制器。
		* @param api - 数据通道。
		* @returns disposer。
		*/
		function mountPanel(controller, api) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshXhsmatrixView = "";
				container.className = panel_module_css_default.viewHost;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(XhsPanel, {
					controller,
					api
				}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyPanelStyle = () => {
				if (container === void 0) return;
				container.style.setProperty("display", controller.getSnapshot().panelOpen ? "block" : "none", "important");
				container.style.setProperty("width", "100%", "important");
				container.style.setProperty("height", "100%", "important");
			};
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
				applyPanelStyle();
			};
			const onOtherActivate = (event) => {
				if (event.detail !== "xhsmatrix" && controller.getSnapshot().panelOpen) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().panelOpen) return;
				const target = event.target;
				if (target === null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			ensure();
			applyActive();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/sidebar-entry.ts
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshXhsmatrixEntry = "";
			entry.setAttribute("aria-label", "矩阵");
			entry.setAttribute("title", "小红书矩阵管理");
			entry.innerHTML = "<span><svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"2\" y=\"2.5\" width=\"12\" height=\"11\" rx=\"1.5\"/><path d=\"M5 6.5l2 2-2 2\"/><path d=\"M9 10.5h2\"/></svg></span><span>矩阵</span>";
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return entry;
		}
		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				const base = row !== null && row.parentElement === root ? row : button;
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches("[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-xhsmatrix-entry]"));
				const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}
		/**
		* 挂载侧边栏入口，等待 shell 渲染并自愈。
		* @param controller - 面板控制器。
		* @returns disposer。
		*/
		function mountSidebarEntry(controller) {
			const entry = createEntry(controller);
			let root;
			let placed = false;
			const tryPlace = () => {
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry);
			});
			const syncActive = () => {
				if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			syncActive();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** 需要的服务。 */
		const inject = ["slots", "locale"];
		/**
		* 挂载矩阵面板。
		* @param ctx - client 根上下文。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-xhs-matrix: dictionaries");
			const controller = new PanelController();
			const api = new XhsApi();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountPanel(controller, api));
			} catch (error) {
				console.warn("[dsh-xhs-matrix] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-xhs-matrix: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map