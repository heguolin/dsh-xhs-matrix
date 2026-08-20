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
			viral: "/api/dsh-xhs-matrix/viral",
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
			/** 按账号与审核状态列出爆款池条目。 */
			async listViralItems(accountId, status) {
				return (await readJson(await fetch(XHS_API.viral + query({
					account: accountId,
					status
				})))).items;
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
			async reviewViralItem(accountId, itemId, status) {
				return (await readJson(await fetch(XHS_API.viral + query({
					account: accountId,
					item: itemId
				}), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ status })
				}))).item;
			}
			async listNotes(accountId) {
				return (await readJson(await fetch(XHS_API.notes + query({ account: accountId })))).notes;
			}
			async setNoteWeight(accountId, noteId, weight) {
				await readJson(await fetch(XHS_API.notes + query({
					account: accountId,
					note: noteId
				}), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ weight })
				}));
			}
			async listMetrics(accountId, noteId) {
				return (await readJson(await fetch(XHS_API.metrics + query({
					account: accountId,
					note: noteId
				})))).metrics;
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
			* 流式发送创作指令（SSE）：onDelta 收到文本增量；完成后 resolve 含
			* messageId/coverPrompt/evidence 的摘要。
			*/
			async studioSendStream(accountId, input, mode, onDelta) {
				const response = await fetch(XHS_API.studioMessages + query({ account: accountId }), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input,
						mode,
						stream: true
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
						const event = buffer.slice(0, boundary);
						buffer = buffer.slice(boundary + 2);
						for (const line of event.split("\n")) {
							if (!line.startsWith("data: ")) continue;
							const payload = JSON.parse(line.slice(6));
							if (typeof payload.delta === "string") onDelta(payload.delta);
							if (payload.error !== void 0) failed = payload.error;
							if (payload.done === true) summary = payload;
						}
					}
				}
				if (failed !== void 0) throw new XhsApiError(failed);
				if (summary === void 0) throw new XhsApiError("流式响应未正常结束");
				return summary;
			}
			/** 保存创作台草稿（v3 草稿独立，不含 topicId）。 */
			async studioSaveDraft(accountId, copy, coverPrompt) {
				return (await readJson(await fetch(XHS_API.studio + "/draft", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accountId,
						copy,
						coverPrompt
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
		//#region \0xhs-css:/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix/packages/dsh-xhs-matrix/src/client/panel/panel.module.css.mjs
		const css = "[data-dsh-xhsmatrix-view]{--xhs-red:#ff2442;--xhs-red-deep:#e01e39;--xhs-red-text:#d52b43;--xhs-red-soft:#fff0f2;--xhs-red-soft2:#fff5f6;--xhs-bg:#fff8f7;--xhs-bg-main:snow;--xhs-card:#fff;--xhs-text:#321f22;--xhs-text-sub:#ab9095;--xhs-text-weak:#b89ca1;--xhs-border:#f1e2e4;--xhs-border-soft:#f7edef;--xhs-face:#ffd4da;--xhs-thumb:#ffe0e4;--xhs-green:#269267;--xhs-green-soft:#e4f8ef;--xhs-warn:#b76c16;--xhs-warn-soft:#fff2df;--xhs-error:#c33c4b;--xhs-error-soft:#ffe9ec;--xhs-shadow:0 3px 10px #b63b4708;z-index:60;background:var(--xhs-bg);color:var(--xhs-text);font-family:Inter,Microsoft YaHei,PingFang SC,sans-serif;display:none;position:absolute;inset:0}html[data-dsh-xhsmatrix-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-xhsmatrix-view]{display:grid}[data-pane=conversation],[class*=centerCol]{position:relative}[data-dsh-xhsmatrix-entry]{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:6px 10px;font-size:13px;display:flex}[data-dsh-xhsmatrix-entry]:hover{color:#ff2442;background:#ff24420f}[data-dsh-xhsmatrix-entry][data-active]{color:#ff2442;background:#ff244214;font-weight:600}.hv-J7W_viewHost{background:var(--xhs-bg);color:var(--xhs-text);position:absolute;inset:0;overflow:hidden}.hv-J7W_viewGrid{grid-template-rows:minmax(0,1fr);grid-template-columns:188px 1fr;min-width:0;height:100%;display:grid}.hv-J7W_sidebar{background:var(--xhs-card);border-right:1px solid var(--xhs-border);flex-direction:column;grid-area:1/1;min-height:0;padding:16px 12px;display:flex;overflow-y:auto}.hv-J7W_brand{color:var(--xhs-text);align-items:center;gap:8px;margin:0 2px 18px;font-size:14px;font-weight:800;display:flex}.hv-J7W_brandLogo{background:var(--xhs-red);color:#fff;border-radius:9px;flex:none;place-items:center;width:28px;height:28px;font-size:12px;display:grid}.hv-J7W_group{color:var(--xhs-text-sub);letter-spacing:.5px;margin:14px 8px 6px;font-size:10px;font-weight:600}.hv-J7W_accountItem{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);cursor:pointer;text-align:left;border-radius:9px;align-items:center;gap:8px;width:100%;margin:0 0 6px;padding:7px 8px;font-size:12px;transition:border-color .15s,background .15s;display:flex}.hv-J7W_accountItem:hover{border-color:var(--xhs-red)}.hv-J7W_accountItem.hv-J7W_active{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.hv-J7W_face{background:var(--xhs-face);border-radius:50%;flex:none;width:24px;height:24px}.hv-J7W_accountName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.hv-J7W_statusDot{border-radius:50%;flex:none;width:8px;height:8px}.hv-J7W_statusDot.hv-J7W_ok{background:#31ae7e}.hv-J7W_statusDot.hv-J7W_warn{background:#f2a43e}.hv-J7W_statusDot.hv-J7W_error{background:#e25662}.hv-J7W_statusDot.hv-J7W_idle{background:#e4d9db}.hv-J7W_accountAdd{border:1px dashed var(--xhs-border);width:100%;color:var(--xhs-text-sub);cursor:pointer;background:0 0;border-radius:9px;align-items:center;gap:6px;padding:7px 10px;font-size:12px;display:flex}.hv-J7W_accountAdd:hover{border-color:var(--xhs-red);color:var(--xhs-red)}.hv-J7W_navItem{width:100%;color:var(--xhs-text-sub);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:9px;align-items:center;gap:8px;margin:2px 0;padding:8px 10px;font-size:13px;display:flex}.hv-J7W_navItem:hover{background:var(--xhs-red-soft);color:var(--xhs-red)}.hv-J7W_navItem.hv-J7W_active{background:var(--xhs-red-soft);color:var(--xhs-red);font-weight:700}.hv-J7W_navIcon{text-align:center;flex:none;width:16px;font-size:12px}.hv-J7W_workspace{background:var(--xhs-bg-main);flex-direction:column;grid-area:1/2;min-width:0;min-height:0;display:flex}.hv-J7W_topbar{border-bottom:1px solid var(--xhs-border);background:var(--xhs-card);justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;display:flex}.hv-J7W_topbar h3{color:var(--xhs-text);margin:0;font-size:17px;font-weight:700}.hv-J7W_topbarSub{color:var(--xhs-text-sub);margin-top:2px;font-size:11px}.hv-J7W_topbarRight{align-items:center;gap:10px;display:flex}.hv-J7W_modeSwitch{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:10px;gap:4px;width:max-content;padding:3px;display:flex}.hv-J7W_modeSwitch button{color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;border-radius:7px;padding:6px 12px;font-size:12px}.hv-J7W_modeSwitch button.hv-J7W_on{background:var(--xhs-red);color:#fff;font-weight:600}.hv-J7W_content{flex:1;min-height:0;padding:18px 22px;overflow-y:auto}.hv-J7W_overview{grid-template-columns:1.15fr .85fr;gap:14px;display:grid}.hv-J7W_panel{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;min-width:0;padding:14px}.hv-J7W_panelTitle{color:var(--xhs-text);justify-content:space-between;align-items:center;gap:8px;margin:0 0 12px;font-size:12px;font-weight:700;display:flex}.hv-J7W_metrics{grid-template-columns:repeat(3,1fr);gap:8px;display:grid}.hv-J7W_metric{background:var(--xhs-red-soft2);color:var(--xhs-text-sub);border-radius:10px;padding:10px;font-size:11px}.hv-J7W_metric b{color:var(--xhs-red);margin-top:3px;font-size:20px;font-weight:700;display:block}.hv-J7W_post{border-top:1px solid var(--xhs-border-soft);align-items:flex-start;gap:9px;padding:9px 0;font-size:12px;display:flex}.hv-J7W_post:first-of-type{border-top:0}.hv-J7W_thumb{background:var(--xhs-thumb);border-radius:7px;flex:none;width:34px;height:34px}.hv-J7W_postBody{flex:1;min-width:0}.hv-J7W_postTitle{color:var(--xhs-text);text-overflow:ellipsis;white-space:nowrap;font-weight:600;overflow:hidden}.hv-J7W_postMeta{color:var(--xhs-text-sub);margin-top:3px;font-size:11px}.hv-J7W_bar{background:#f4e3e6;border-radius:99px;height:5px;margin-top:6px;overflow:hidden}.hv-J7W_bar i{background:var(--xhs-red);border-radius:99px;height:100%;display:block}.hv-J7W_chat{flex-direction:column;height:100%;min-height:0;display:flex}.hv-J7W_chathead{color:var(--xhs-text);border-bottom:1px solid var(--xhs-border-soft);justify-content:space-between;align-items:center;padding-bottom:10px;font-size:12px;font-weight:700;display:flex}.hv-J7W_pill{background:var(--xhs-green-soft);color:var(--xhs-green);white-space:nowrap;border-radius:99px;padding:4px 8px;font-size:10px}.hv-J7W_pillWarn{background:var(--xhs-warn-soft);color:var(--xhs-warn)}.hv-J7W_bubble{background:var(--xhs-red-soft2);max-width:92%;color:var(--xhs-text);border-radius:10px;margin-top:9px;padding:9px 11px;font-size:12px;line-height:1.6}.hv-J7W_bubble.hv-J7W_me{background:var(--xhs-red);color:#fff;align-self:flex-end}.hv-J7W_chatInput{border:1px solid var(--xhs-border);color:var(--xhs-text-weak);background:var(--xhs-card);border-radius:9px;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding:10px;font-size:12px;display:flex}.hv-J7W_chatSend{background:var(--xhs-red);color:#fff;cursor:pointer;border:0;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600}.hv-J7W_below{grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;display:grid}.hv-J7W_chips{flex-wrap:wrap;gap:6px;display:flex}.hv-J7W_contextline{border-top:1px solid var(--xhs-border-soft);justify-content:space-between;align-items:center;gap:8px;padding:9px 0;font-size:12px;display:flex}.hv-J7W_contextline:first-of-type{border-top:0}.hv-J7W_studioLayout{grid-template-columns:1fr 268px;gap:0;height:100%;min-height:0;display:grid}.hv-J7W_studioMain{background:var(--xhs-bg-main);flex-direction:column;min-width:0;display:flex}.hv-J7W_studioTop{border-bottom:1px solid var(--xhs-border);background:var(--xhs-card);justify-content:space-between;align-items:center;gap:12px;height:56px;padding:0 20px;display:flex}.hv-J7W_studioTop strong{color:var(--xhs-text);font-size:14px}.hv-J7W_studioTopSub{color:var(--xhs-text-sub);margin-top:3px;font-size:11px}.hv-J7W_messages{flex:1;min-height:0;padding:16px 20px;overflow-y:auto}.hv-J7W_msg{gap:9px;max-width:92%;margin-bottom:14px;display:flex}.hv-J7W_msg.hv-J7W_me{flex-direction:row-reverse;margin-left:auto}.hv-J7W_msgAvatar{background:var(--xhs-red);color:#fff;border-radius:8px;flex:none;place-items:center;width:26px;height:26px;font-size:11px;display:grid}.hv-J7W_msg.hv-J7W_me .hv-J7W_msgAvatar{background:var(--xhs-face);color:#8a3945}.hv-J7W_msgBubble{background:var(--xhs-card);border:1px solid var(--xhs-border);color:var(--xhs-text);box-shadow:var(--xhs-shadow);white-space:pre-wrap;word-break:break-word;border-radius:11px;padding:10px 12px;font-size:13px;line-height:1.7}.hv-J7W_msg.hv-J7W_me .hv-J7W_msgBubble{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red)}.hv-J7W_studioResult{background:var(--xhs-red-soft2);border-radius:9px;margin-top:9px;padding:9px 11px;font-size:12px;line-height:1.6}.hv-J7W_studioResult b{color:var(--xhs-red-text);margin-bottom:5px;display:block}.hv-J7W_studioComposer{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:flex-end;gap:8px;margin:0 20px 16px;padding:8px 8px 8px 14px;display:flex}.hv-J7W_studioComposer textarea{resize:none;color:var(--xhs-text);background:0 0;border:none;outline:none;flex:1;min-height:44px;max-height:140px;font-family:inherit;font-size:13px;line-height:1.6}.hv-J7W_studioSend{background:var(--xhs-red);color:#fff;cursor:pointer;border:0;border-radius:8px;flex:none;padding:8px 14px;font-size:12px;font-weight:600}.hv-J7W_studioSend:disabled{opacity:.6;cursor:not-allowed}.hv-J7W_studioSendGhost{background:var(--xhs-card);color:var(--xhs-red-text);border:1px solid var(--xhs-border)}.hv-J7W_studioSendGhost:hover{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.hv-J7W_context{background:var(--xhs-card);border-left:1px solid var(--xhs-border);min-height:0;padding:16px 14px;overflow-y:auto}.hv-J7W_context h4{color:var(--xhs-text);margin:0 0 12px;font-size:12px;font-weight:700}.hv-J7W_contextCard{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:10px;margin-bottom:10px;padding:11px}.hv-J7W_contextCard h5{color:var(--xhs-text);margin:0 0 7px;font-size:11px;font-weight:700}.hv-J7W_contextLine{color:#8f777c;border-top:1px solid var(--xhs-border-soft);margin-top:7px;padding-top:7px;font-size:11px;line-height:1.55}.hv-J7W_contextLine:first-of-type{border-top:0;margin-top:0;padding-top:0}.hv-J7W_meter{background:#f3e4e6;border-radius:99px;height:6px;margin-top:6px;overflow:hidden}.hv-J7W_meter i{background:var(--xhs-red);border-radius:99px;width:86%;height:100%;display:block}.hv-J7W_tag{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:99px;margin:2px;padding:4px 8px;font-size:11px;display:inline-block}.hv-J7W_tag.hv-J7W_on{background:var(--xhs-red);color:#fff}.hv-J7W_filterRow{flex-wrap:wrap;gap:6px;margin-bottom:14px;display:flex}.hv-J7W_filter{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text-sub);cursor:pointer;border-radius:99px;padding:6px 12px;font-size:12px}.hv-J7W_filter.hv-J7W_on{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red)}.hv-J7W_libRow{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:flex-start;gap:10px;margin-bottom:9px;padding:12px 14px;display:flex}.hv-J7W_miniThumb{background:var(--xhs-thumb);border-radius:8px;flex:none;width:38px;height:38px}.hv-J7W_libBody{flex:1;min-width:0}.hv-J7W_libTitle{color:var(--xhs-text);font-size:13px;font-weight:600}.hv-J7W_libMeta{color:var(--xhs-text-sub);margin-top:4px;font-size:11px}.hv-J7W_weight{gap:4px;margin-top:8px;display:flex}.hv-J7W_weight button{background:var(--xhs-red-soft2);border:1px solid var(--xhs-border);width:22px;height:22px;color:var(--xhs-red-text);cursor:pointer;border-radius:5px;place-items:center;padding:0;font-size:11px;display:grid}.hv-J7W_weight button:hover{border-color:var(--xhs-red)}.hv-J7W_weight button.hv-J7W_on{background:var(--xhs-red);color:#fff;border-color:var(--xhs-red);font-weight:700}.hv-J7W_topicItem{border-top:1px solid var(--xhs-border-soft);padding:11px 0;font-size:13px}.hv-J7W_topicItem:first-of-type{border-top:0}.hv-J7W_topicTitle{color:var(--xhs-text);margin-bottom:5px;font-weight:600;display:block}.hv-J7W_topicReason{color:var(--xhs-text-sub);font-size:11px;line-height:1.6}.hv-J7W_score{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:99px;margin-top:5px;padding:2px 8px;font-size:11px;display:inline-block}.hv-J7W_scoreLow{background:var(--xhs-warn-soft);color:var(--xhs-warn)}.hv-J7W_personaLayout{grid-template-columns:.95fr 1.05fr;gap:14px;display:grid}.hv-J7W_personaList{flex-direction:column;gap:8px;margin-bottom:14px;display:flex}.hv-J7W_personaItem{border:1px solid var(--xhs-border);background:var(--xhs-card);cursor:pointer;text-align:left;width:100%;color:var(--xhs-text);border-radius:11px;align-items:center;gap:10px;padding:11px 13px;display:flex}.hv-J7W_personaItem:hover{border-color:var(--xhs-red)}.hv-J7W_personaItem.hv-J7W_active{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.hv-J7W_personaAvatar{background:var(--xhs-face);border-radius:50%;flex:none;width:34px;height:34px}.hv-J7W_personaName{font-size:13px;font-weight:700}.hv-J7W_personaDesc{color:var(--xhs-text-sub);text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:11px;overflow:hidden}.hv-J7W_draftLayout{grid-template-columns:1fr .85fr;gap:14px;width:100%;display:grid}.hv-J7W_draftEditor,.hv-J7W_sourcePanel{min-width:0}.hv-J7W_source{border-top:1px solid var(--xhs-border-soft);padding:8px 0;font-size:12px;line-height:1.6}.hv-J7W_source:first-of-type{border-top:0}.hv-J7W_source b{color:var(--xhs-red-text);margin-bottom:3px;display:block}.hv-J7W_weightBadge{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:99px;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:400}.hv-J7W_editbar{flex-wrap:wrap;gap:6px;margin-top:12px;display:flex}.hv-J7W_overlay{z-index:200;background:#321f2259;place-items:center;display:grid;position:fixed;inset:0}.hv-J7W_dialog{background:var(--xhs-bg-main);border:1px solid var(--xhs-border);border-radius:14px;width:520px;max-width:calc(100vw - 40px);max-height:calc(100vh - 60px);padding:18px 20px;overflow-y:auto;box-shadow:0 12px 40px #321f222e}.hv-J7W_dialog h3{color:var(--xhs-text);margin:0 0 14px;font-size:16px;font-weight:700}.hv-J7W_dialogClose{float:right;color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;padding:2px 6px;font-size:18px;line-height:1}.hv-J7W_dialogClose:hover{color:var(--xhs-red)}.hv-J7W_dialogRow{border:1px solid var(--xhs-border);background:var(--xhs-card);border-radius:11px;align-items:center;gap:10px;margin-bottom:8px;padding:10px 12px;font-size:13px;display:flex}.hv-J7W_dialogRow .hv-J7W_face{width:28px;height:28px}.hv-J7W_dialogRowActions{flex:none;gap:6px;margin-left:auto;display:flex}.hv-J7W_field{flex-direction:column;gap:6px;margin-bottom:12px;display:flex}.hv-J7W_field label{color:var(--xhs-text-sub);font-size:12px}.hv-J7W_input{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);border-radius:8px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.hv-J7W_input:focus{border-color:var(--xhs-red);outline:none;box-shadow:0 0 0 3px #ff244214}.hv-J7W_textarea{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);resize:vertical;border-radius:8px;min-height:80px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.hv-J7W_textarea:focus{border-color:var(--xhs-red);outline:none;box-shadow:0 0 0 3px #ff244214}.hv-J7W_button{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);cursor:pointer;border-radius:8px;padding:8px 16px;font-size:12px;transition:border-color .15s,color .15s,background .15s}.hv-J7W_button:hover{border-color:var(--xhs-red);color:var(--xhs-red)}.hv-J7W_primary{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:600;transition:background .15s}.hv-J7W_primary:hover{background:var(--xhs-red-deep)}.hv-J7W_primary:disabled{opacity:.6;cursor:not-allowed}.hv-J7W_ghostBtn{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-red-text);cursor:pointer;border-radius:8px;padding:7px 14px;font-size:12px}.hv-J7W_ghostBtn:hover{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.hv-J7W_dangerBtn{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-error);cursor:pointer;border-radius:8px;padding:7px 14px;font-size:12px}.hv-J7W_dangerBtn:hover{border-color:var(--xhs-error);background:var(--xhs-error-soft)}.hv-J7W_tabs{flex-wrap:wrap;gap:6px;margin-bottom:14px;display:flex}.hv-J7W_tab{color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;border-radius:999px;padding:7px 14px;font-size:12px}.hv-J7W_tab:hover{background:var(--xhs-red-soft);color:var(--xhs-red)}.hv-J7W_tabActive{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:600}.hv-J7W_card{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:center;gap:10px;margin-bottom:8px;padding:12px 14px;display:flex}.hv-J7W_badge{background:var(--xhs-red-soft);color:var(--xhs-red-text);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.hv-J7W_badgeGreen{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.hv-J7W_badgeGray{color:var(--xhs-text-sub);background:#f5f1f1;border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.hv-J7W_badgeDanger{background:var(--xhs-error-soft);color:var(--xhs-error);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.hv-J7W_badgeWarn{background:var(--xhs-warn-soft);color:var(--xhs-warn);border-radius:999px;padding:2px 10px;font-size:11px;display:inline-block}.hv-J7W_success{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:8px;margin-bottom:10px;padding:10px 14px;font-size:12px}.hv-J7W_empty{background:var(--xhs-red-soft2);color:var(--xhs-text-sub);border-radius:9px;margin-bottom:10px;padding:12px 14px;font-size:12px}.hv-J7W_muted{color:var(--xhs-text-sub);font-size:12px}.hv-J7W_danger{background:var(--xhs-error-soft);color:var(--xhs-error);border-radius:8px;margin-bottom:10px;padding:9px 12px;font-size:12px}.hv-J7W_rowActions{flex:none;align-items:center;gap:8px;display:flex}.hv-J7W_spacer{flex:1}";
		const tagId = "dsh-xhs-matrix/panel.module.css?v=c446fd6f";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-xhs-matrix";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"msgBubble": "hv-J7W_msgBubble",
			"postBody": "hv-J7W_postBody",
			"contextCard": "hv-J7W_contextCard",
			"overlay": "hv-J7W_overlay",
			"topicReason": "hv-J7W_topicReason",
			"personaLayout": "hv-J7W_personaLayout",
			"studioMain": "hv-J7W_studioMain",
			"msg": "hv-J7W_msg",
			"studioSendGhost": "hv-J7W_studioSendGhost",
			"spacer": "hv-J7W_spacer",
			"modeSwitch": "hv-J7W_modeSwitch",
			"metric": "hv-J7W_metric",
			"studioSend": "hv-J7W_studioSend",
			"chathead": "hv-J7W_chathead",
			"personaDesc": "hv-J7W_personaDesc",
			"draftEditor": "hv-J7W_draftEditor",
			"studioLayout": "hv-J7W_studioLayout",
			"overview": "hv-J7W_overview",
			"dialogRow": "hv-J7W_dialogRow",
			"brandLogo": "hv-J7W_brandLogo",
			"topicTitle": "hv-J7W_topicTitle",
			"libMeta": "hv-J7W_libMeta",
			"editbar": "hv-J7W_editbar",
			"context": "hv-J7W_context",
			"score": "hv-J7W_score",
			"msgAvatar": "hv-J7W_msgAvatar",
			"chatSend": "hv-J7W_chatSend",
			"meter": "hv-J7W_meter",
			"studioTop": "hv-J7W_studioTop",
			"contextLine": "hv-J7W_contextLine",
			"dialogRowActions": "hv-J7W_dialogRowActions",
			"libBody": "hv-J7W_libBody",
			"libTitle": "hv-J7W_libTitle",
			"danger": "hv-J7W_danger",
			"filterRow": "hv-J7W_filterRow",
			"metrics": "hv-J7W_metrics",
			"primary": "hv-J7W_primary",
			"brand": "hv-J7W_brand",
			"personaAvatar": "hv-J7W_personaAvatar",
			"source": "hv-J7W_source",
			"face": "hv-J7W_face",
			"panel": "hv-J7W_panel",
			"pillWarn": "hv-J7W_pillWarn",
			"textarea": "hv-J7W_textarea",
			"dialogClose": "hv-J7W_dialogClose",
			"rowActions": "hv-J7W_rowActions",
			"accountAdd": "hv-J7W_accountAdd",
			"input": "hv-J7W_input",
			"dialog": "hv-J7W_dialog",
			"empty": "hv-J7W_empty",
			"chatInput": "hv-J7W_chatInput",
			"tab": "hv-J7W_tab",
			"topbar": "hv-J7W_topbar",
			"navIcon": "hv-J7W_navIcon",
			"sourcePanel": "hv-J7W_sourcePanel",
			"warn": "hv-J7W_warn",
			"dangerBtn": "hv-J7W_dangerBtn",
			"accountItem": "hv-J7W_accountItem",
			"sidebar": "hv-J7W_sidebar",
			"badgeGreen": "hv-J7W_badgeGreen",
			"personaItem": "hv-J7W_personaItem",
			"navItem": "hv-J7W_navItem",
			"below": "hv-J7W_below",
			"miniThumb": "hv-J7W_miniThumb",
			"statusDot": "hv-J7W_statusDot",
			"badge": "hv-J7W_badge",
			"viewGrid": "hv-J7W_viewGrid",
			"weightBadge": "hv-J7W_weightBadge",
			"topbarSub": "hv-J7W_topbarSub",
			"active": "hv-J7W_active",
			"badgeDanger": "hv-J7W_badgeDanger",
			"me": "hv-J7W_me",
			"chat": "hv-J7W_chat",
			"weight": "hv-J7W_weight",
			"tabActive": "hv-J7W_tabActive",
			"ghostBtn": "hv-J7W_ghostBtn",
			"post": "hv-J7W_post",
			"libRow": "hv-J7W_libRow",
			"personaList": "hv-J7W_personaList",
			"badgeGray": "hv-J7W_badgeGray",
			"on": "hv-J7W_on",
			"thumb": "hv-J7W_thumb",
			"chips": "hv-J7W_chips",
			"group": "hv-J7W_group",
			"pill": "hv-J7W_pill",
			"error": "hv-J7W_error",
			"topbarRight": "hv-J7W_topbarRight",
			"studioTopSub": "hv-J7W_studioTopSub",
			"content": "hv-J7W_content",
			"messages": "hv-J7W_messages",
			"field": "hv-J7W_field",
			"tag": "hv-J7W_tag",
			"contextline": "hv-J7W_contextline",
			"personaName": "hv-J7W_personaName",
			"tabs": "hv-J7W_tabs",
			"card": "hv-J7W_card",
			"filter": "hv-J7W_filter",
			"topicItem": "hv-J7W_topicItem",
			"badgeWarn": "hv-J7W_badgeWarn",
			"bar": "hv-J7W_bar",
			"success": "hv-J7W_success",
			"panelTitle": "hv-J7W_panelTitle",
			"bubble": "hv-J7W_bubble",
			"postMeta": "hv-J7W_postMeta",
			"studioComposer": "hv-J7W_studioComposer",
			"postTitle": "hv-J7W_postTitle",
			"viewHost": "hv-J7W_viewHost",
			"accountName": "hv-J7W_accountName",
			"studioResult": "hv-J7W_studioResult",
			"button": "hv-J7W_button",
			"muted": "hv-J7W_muted",
			"scoreLow": "hv-J7W_scoreLow",
			"draftLayout": "hv-J7W_draftLayout",
			"workspace": "hv-J7W_workspace",
			"ok": "hv-J7W_ok",
			"idle": "hv-J7W_idle"
		};
		//#endregion
		//#region src/client/panel/ImportDialog.tsx
		/** 后台数据导入简化版：标题（每行一个）+ 正文（与标题行号对应），构造 JSON 数组导入当前账号已发布笔记。 */
		function ImportDialog({ api, accountId, onDone }) {
			const [titles, setTitles] = (0, react.useState)("");
			const [copies, setCopies] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.primary,
					onClick: () => void run(),
					children: "导入"
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
		* 账号与采集状态用状态点与徽标区分，失败可重试绑定。
		*/
		function AccountsDialog({ api, onClose, onSaved }) {
			const [accounts, setAccounts] = (0, react.useState)([]);
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
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [accs, pers] = await Promise.all([api.listAccounts(), api.listPersonas()]);
					setAccounts(accs);
					setPersonas(pers);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const create = async () => {
				if (name.trim() === "") {
					setError("请输入账号名");
					return;
				}
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
					setName("");
					setPersonaId("");
					setProfileUrl("");
					setNotice(`已添加账号「${name.trim()}」${profileUrl.trim() !== "" ? "，并绑定主页待导入" : ""}。`);
					await refresh();
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
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const remove = async (id) => {
				if (!window.confirm("确定删除该账号？其笔记、指标、草稿与创作记录会一并删除。")) return;
				try {
					await api.deleteAccount(id);
					await refresh();
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
					await refresh();
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
								border: `1px solid var(--xhs-border)`,
								borderRadius: 12,
								background: "var(--xhs-card)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImportDialog, {
								api,
								accountId: importingId,
								onDone: () => {
									refresh();
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
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["本地笔记 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.weightBadge,
									children: "高权重参考"
								})] }),
								"引用 ",
								draft.evidence.noteIds.length,
								" 篇已发布笔记"
							]
						}),
						draft.evidence.trendIds.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.source,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["已采纳爆款参考 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.weightBadge,
									children: "外部数据"
								})] }),
								"引用 ",
								draft.evidence.trendIds.length,
								" 个爆款样本"
							]
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
				const reads = window.prompt(`录入「${draft.date}」草稿的阅读量（留空跳过指标）`, "");
				if (reads === null) return;
				const metrics = reads.trim() === "" ? void 0 : {
					reads: Number(reads) || 0,
					likes: 0,
					comments: 0,
					collected: (/* @__PURE__ */ new Date()).toISOString()
				};
				try {
					await api.setDraftStatus(draft.id, "published", metrics);
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
		//#region src/client/panel/KnowledgeTab.tsx
		const WEIGHTS = [
			0,
			1,
			2,
			3,
			4,
			5
		];
		const FILTERS = [
			{
				id: "all",
				label: "全部"
			},
			{
				id: "high",
				label: "权重高"
			},
			{
				id: "pending",
				label: "待补指标"
			},
			{
				id: "recent",
				label: "最近发布"
			}
		];
		/**
		* 已发布知识库（设计稿 content/detail-surfaces.html）：
		* 筛选 chips + 笔记行（缩略图/指标/0-5 权重），权重即控制杆。
		*/
		function KnowledgeTab({ api, accountId }) {
			const [notes, setNotes] = (0, react.useState)([]);
			const [metrics, setMetrics] = (0, react.useState)([]);
			const [filter, setFilter] = (0, react.useState)("all");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [importing, setImporting] = (0, react.useState)(false);
			const refresh = (0, react.useCallback)(async () => {
				if (accountId === "") {
					setNotes([]);
					setMetrics([]);
					return;
				}
				try {
					const [noteList, metricList] = await Promise.all([api.listNotes(accountId), api.listMetrics(accountId)]);
					setNotes(noteList);
					setMetrics(metricList);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api, accountId]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const setWeight = async (noteId, weight) => {
				try {
					await api.setNoteWeight(accountId, noteId, weight);
					setNotice(`已设置权重 ${weight}，将影响下一次推荐。`);
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const latestByNote = /* @__PURE__ */ new Map();
			for (const m of metrics) {
				const prev = latestByNote.get(m.noteId);
				if (prev === void 0 || m.collectedAt > prev.collectedAt) latestByNote.set(m.noteId, m);
			}
			const filtered = [...notes].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).filter((note) => {
				if (filter === "high") return note.weight >= 4;
				if (filter === "pending") return latestByNote.get(note.id) === void 0;
				if (filter === "recent") return Date.now() - Date.parse(note.publishedAt) < 720 * 60 * 60 * 1e3;
				return true;
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.success,
					children: notice
				}),
				accountId === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: "请先在左侧选择账号。"
				}),
				accountId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.filterRow,
						children: [
							FILTERS.map((f) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: filter === f.id ? `${panel_module_css_default.filter} ${panel_module_css_default.on}` : panel_module_css_default.filter,
								onClick: () => setFilter(f.id),
								children: f.label
							}, f.id)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.primary,
								onClick: () => setImporting(true),
								children: "＋ 导入笔记"
							})
						]
					}),
					notes.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.empty,
						children: "该账号还没有已发布笔记。点击「导入笔记」粘贴 CSV/JSON 后台数据。"
					}),
					notes.length > 0 && filtered.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.muted,
						children: "当前筛选下没有笔记。"
					}),
					filtered.map((note) => {
						const metric = latestByNote.get(note.id);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.libRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.miniThumb }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.libBody,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.libTitle,
										children: note.title
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.libMeta,
										children: [
											"发布 ",
											note.publishedAt.slice(0, 10),
											metric !== void 0 ? ` · 浏览 ${metric.reads.toLocaleString()} · 点赞 ${metric.likes} · 收藏 ${metric.favorites} · 评论 ${metric.comments}` : " · 指标待更新",
											note.topic !== void 0 && ` · ${note.topic}`
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.weight,
										children: [WEIGHTS.map((weight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: note.weight === weight ? panel_module_css_default.on : void 0,
											onClick: () => void setWeight(note.id, weight),
											title: `权重 ${weight}`,
											children: weight
										}, weight)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.muted,
											style: {
												marginLeft: 8,
												alignSelf: "center"
											},
											children: [
												"权重 ",
												note.weight,
												" / 5"
											]
										})]
									})
								]
							})]
						}, note.id);
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
							onDone: () => {
								refresh();
								setImporting(false);
							}
						})
					})
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
		function StudioTab({ api, accountId, onOpenDraft }) {
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
				viralCount: 0,
				metricCount: 0
			});
			const refresh = (0, react.useCallback)(async () => {
				if (accountId === "") {
					setMessages([]);
					setContext({
						personaName: "",
						hookStyles: [],
						noteCount: 0,
						highCount: 0,
						viralCount: 0,
						metricCount: 0
					});
					return;
				}
				try {
					const [msgList, accountList, personaList, noteList, viralList, metricList] = await Promise.all([
						api.listStudioMessages(accountId),
						api.listAccounts(),
						api.listPersonas(),
						api.listNotes(accountId),
						api.listViralItems(accountId, "accepted"),
						api.listMetrics(accountId)
					]);
					setMessages(msgList);
					const persona = personaList.find((p) => p.id === accountList.find((a) => a.id === accountId)?.personaId);
					setContext({
						personaName: persona?.name ?? "未分配",
						hookStyles: persona?.hookStyles ?? [],
						noteCount: noteList.length,
						highCount: noteList.filter((n) => n.weight >= 3).length,
						viralCount: viralList.length,
						metricCount: metricList.length
					});
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api, accountId]);
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
					const summary = await api.studioSendStream(accountId, prompt, mode, (delta) => {
						setStreamText((prev) => prev + delta);
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
					await api.studioSaveDraft(accountId, last.content, coverPrompt);
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
												" 个已采纳爆款参考 · ",
												context.metricCount,
												" 条指标历史快照"
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
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", { children: "指标历史快照" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.contextLine,
									children: [context.metricCount, " 条采集记录"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.contextLine,
									children: "采集任务只更新数据，不自动生成"
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/panel/ViralTab.tsx
		/** 正文摘要的截断长度（字符）。 */
		const BODY_PREVIEW_LENGTH = 120;
		/** 单条爆款的展示行：标题、正文摘要、来源链接、推荐分、匹配理由、状态与审核按钮。 */
		function ViralRow({ item, busy, onReview }) {
			const bodyPreview = item.body.length > BODY_PREVIEW_LENGTH ? `${item.body.slice(0, BODY_PREVIEW_LENGTH)}…` : item.body;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.topicItem,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.topicTitle,
						children: item.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.topicReason,
						children: bodyPreview === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.muted,
							children: "（无正文摘要）"
						}) : bodyPreview
					}),
					item.sourceUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.topicReason,
						style: { marginTop: 4 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: item.sourceUrl,
							target: "_blank",
							rel: "noreferrer",
							style: { color: "var(--xhs-red)" },
							children: "来源链接 ↗"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.topicReason,
						style: { marginTop: 4 },
						children: ["匹配：", item.reasons.length > 0 ? item.reasons.join(" · ") : "未说明"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginTop: 6
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: item.score >= 60 ? panel_module_css_default.score : `${panel_module_css_default.score} ${panel_module_css_default.scoreLow}`,
								children: ["推荐分 ", item.score]
							}),
							item.status === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeWarn,
								children: "待审核"
							}),
							item.status === "accepted" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeGreen,
								children: "已采纳（创作参考）"
							}),
							item.status === "ignored" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeGray,
								children: "已忽略"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							item.status === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.primary,
								disabled: busy,
								onClick: () => onReview(item.id, "accepted"),
								children: "采纳"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.ghostBtn,
								disabled: busy,
								onClick: () => onReview(item.id, "ignored"),
								children: "忽略"
							})] })
						]
					})
				]
			});
		}
		/**
		* 爆款池（v3 取代趋势选题页）：
		* 顶部为状态筛选与「采集爆款」「配置 Apify」操作；列表按账号展示爆款条目，
		* 待审核条目可「采纳 / 忽略」，采集与审核后自动刷新。
		*/
		function ViralTab({ api, accountId }) {
			const [items, setItems] = (0, react.useState)([]);
			const [filter, setFilter] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [collecting, setCollecting] = (0, react.useState)(false);
			const [reviewingId, setReviewingId] = (0, react.useState)("");
			const [configOpen, setConfigOpen] = (0, react.useState)(false);
			const [apifyConfigured, setApifyConfigured] = (0, react.useState)(false);
			const [actorId, setActorId] = (0, react.useState)("");
			const [apiToken, setApiToken] = (0, react.useState)("");
			const [maxItems, setMaxItems] = (0, react.useState)("10");
			const [savingConfig, setSavingConfig] = (0, react.useState)(false);
			/** 按账号与当前筛选状态重新拉取爆款池。 */
			const refresh = (0, react.useCallback)(async () => {
				try {
					setItems(await api.listViralItems(accountId, filter === "" ? void 0 : filter));
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [
				api,
				accountId,
				filter
			]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				api.getApifyConfig().then((config) => {
					setApifyConfigured(config.actorId !== "" && config.apiToken !== "");
					setActorId(config.actorId);
					setApiToken(config.apiToken);
					setMaxItems(String(config.maxItems ?? 10));
				}).catch(() => {});
			}, [api]);
			/** 打开配置弹窗，先回填当前配置。 */
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
					setError("Actor ID 格式应为「用户名/Actor名」，如 kuaima/xiaohongshu-search（不是 Apify User ID）");
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
			/** 采集爆款入库（query/maxItems 由后端按人设方向降级），完成后刷新列表。 */
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
					const message = e instanceof Error ? e.message : String(e);
					if (/\b401\b|\b403\b/.test(message)) setError(`${message}。API Token 无效或已过期：请打开 apify.com → Settings → API & Integrations，点击 API token 右侧的「复制」按钮（不要复制掩码星号），回到「配置 Apify」重新粘贴后重试。`);
					else if (/未配置/.test(message)) setError(`${message}。请先点击「配置 Apify」填写 Actor ID 与 API Token。`);
					else if (/尚未分配人设/.test(message)) setError(`${message}。请先到「人设配置」为该账号绑定人设后再采集。`);
					else setError(message);
				} finally {
					setCollecting(false);
				}
			};
			/** 审核条目为 accepted / ignored，完成后刷新列表。 */
			const review = async (itemId, status) => {
				setReviewingId(itemId);
				try {
					await api.reviewViralItem(accountId, itemId, status);
					setError("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setReviewingId("");
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.panel,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.panelTitle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "爆款池" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 6,
									alignItems: "center"
								},
								children: [
									!apifyConfigured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeWarn,
										children: "未配置数据源"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: panel_module_css_default.input,
										style: { width: 130 },
										value: filter,
										onChange: (e) => setFilter(e.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: "全部"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "pending",
												children: "待审核"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "accepted",
												children: "已采纳"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "ignored",
												children: "已忽略"
											})
										]
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
									})
								]
							})]
						}),
						items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.muted,
							children: ["爆款池为空。点击「采集爆款」从外部数据源拉取内容并按当前人设与知识库排序；", !apifyConfigured && " 先点击「配置 Apify」填写 Actor ID 与 API Token。"]
						}),
						items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViralRow, {
							item,
							busy: reviewingId === item.id,
							onReview: (id, status) => void review(id, status)
						}, item.id))
					]
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
									" 注册账号（免费额度可用）。",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"2. ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "API Token" }),
									"：登录后进入 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										href: "https://console.apify.com/settings/integrations",
										target: "_blank",
										rel: "noreferrer",
										style: { color: "var(--xhs-red)" },
										children: "Settings → Integrations"
									}),
									"，复制 API token（形如 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "apify_api_xxx" }),
									"）。",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"3. ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "Actor ID" }),
									"：在 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										href: "https://apify.com/store?q=xiaohongshu",
										target: "_blank",
										rel: "noreferrer",
										style: { color: "var(--xhs-red)" },
										children: "Apify Store"
									}),
									" 搜索小红书相关 Actor（如 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "kuaima/xiaohongshu-search" }),
									"），Actor ID 即「用户名/Actor名」，取自 Actor 页面地址。",
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
		* 矩阵工作台（依据设计稿 content/hybrid-layout.html 的混合布局）：
		* 左侧导航承载账号切换与运营/创作/设置模块，右侧为当前账号的独立工作区。
		*
		* 每个账号拥有独立的工作区：页面位置（pageByAccount）、创作台对话、筛选
		* 与草稿均按账号隔离；切换账号后各自状态保留，切回即恢复。
		*/
		function XhsPanel(props) {
			const { api } = props;
			const [pageByAccount, setPageByAccount] = (0, react.useState)({});
			const [accountId, setAccountId] = (0, react.useState)("");
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [dialogOpen, setDialogOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
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
									accountId
								}, `kb-${accountId}`),
								currentPage === "viral" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViralTab, {
									api,
									accountId
								}, `vp-${accountId}`),
								currentPage === "studio" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StudioTab, {
									api,
									accountId,
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
						onClose: () => setDialogOpen(false),
						onSaved: (createdId) => {
							if (createdId !== void 0) setAccountId(createdId);
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