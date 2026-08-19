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
			accounts: "/api/dsh-xhs-matrix/accounts",
			personas: "/api/dsh-xhs-matrix/personas",
			topics: "/api/dsh-xhs-matrix/topics",
			negatives: "/api/dsh-xhs-matrix/negatives",
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
			async listTopics() {
				return (await readJson(await fetch(XHS_API.topics))).topics;
			}
			async addTopic(title) {
				await readJson(await fetch(XHS_API.topics, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ title })
				}));
			}
			async importTopics(titles) {
				return (await readJson(await fetch(XHS_API.topics, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ titles })
				}))).topics.length;
			}
			async retireTopic(id) {
				await readJson(await fetch(XHS_API.topics + query({ topic: id }), { method: "PATCH" }));
			}
			async listNegatives() {
				return (await readJson(await fetch(XHS_API.negatives))).negatives;
			}
			async addNegative(payload) {
				await readJson(await fetch(XHS_API.negatives, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				}));
			}
			async deleteNegative(id) {
				await readJson(await fetch(XHS_API.negatives + query({ negative: id }), { method: "DELETE" }));
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
			"tab.topics": "选题",
			"tab.negatives": "黑名单",
			"tab.drafts": "草稿"
		};
		/** 英文字典（键对齐）。 */
		const en = {
			"entry.label": "Matrix",
			"entry.tooltip": "Xiaohongshu matrix",
			"panel.title": "XHS Matrix",
			"tab.accounts": "Accounts",
			"tab.personas": "Personas",
			"tab.topics": "Topics",
			"tab.negatives": "Negatives",
			"tab.drafts": "Drafts"
		};
		//#endregion
		//#region \0xhs-css:/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix/packages/dsh-xhs-matrix/src/client/panel/panel.module.css.mjs
		const css = "[data-dsh-xhsmatrix-view]{--xhs-red:#ff2442;--xhs-red-deep:#e01e39;--xhs-red-soft:#ff24420f;--xhs-bg:#fffdfd;--xhs-card:#fff;--xhs-text:#2b2b2b;--xhs-text-sub:#8a8a8a;--xhs-text-weak:#b5afaf;--xhs-border:#f0e6e6;--xhs-green:#2ba471;--xhs-green-soft:#2ba4711a;--xhs-shadow:0 2px 12px #ff244214;z-index:60;background:var(--xhs-bg);display:none;position:absolute;inset:0}html[data-dsh-xhsmatrix-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-xhsmatrix-view]{display:block}[data-pane=conversation],[class*=centerCol]{position:relative}[data-dsh-xhsmatrix-entry]{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:6px 10px;font-size:13px;display:flex}[data-dsh-xhsmatrix-entry]:hover{color:#ff2442;background:#ff24420f}[data-dsh-xhsmatrix-entry][data-active]{color:#ff2442;background:#ff244214;font-weight:600}.hv-J7W_view{background:var(--xhs-bg);color:var(--xhs-text);padding:20px;position:absolute;inset:0;overflow:auto}.hv-J7W_header{align-items:center;gap:8px;margin-bottom:16px;display:flex}.hv-J7W_headerDot{background:var(--xhs-red);border-radius:50%;width:8px;height:8px}.hv-J7W_header h2{margin:0;font-size:18px;font-weight:700}.hv-J7W_tabs{flex-wrap:wrap;gap:6px;margin-bottom:16px;display:flex}.hv-J7W_tab{color:var(--xhs-text-sub);cursor:pointer;background:0 0;border:none;border-radius:999px;padding:7px 16px;font-size:13px}.hv-J7W_tab:hover{background:var(--xhs-red-soft);color:var(--xhs-red)}.hv-J7W_tabActive{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600}.hv-J7W_field{flex-direction:column;gap:6px;margin-bottom:12px;display:flex}.hv-J7W_field label{color:var(--xhs-text-sub);font-size:12px}.hv-J7W_input{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);border-radius:8px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.hv-J7W_input:focus{border-color:var(--xhs-red);box-shadow:0 0 0 3px var(--xhs-red-soft);outline:none}.hv-J7W_textarea{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);resize:vertical;border-radius:8px;min-height:80px;padding:8px 12px;font-size:13px;transition:border-color .15s,box-shadow .15s}.hv-J7W_textarea:focus{border-color:var(--xhs-red);box-shadow:0 0 0 3px var(--xhs-red-soft);outline:none}.hv-J7W_button{border:1px solid var(--xhs-border);background:var(--xhs-card);color:var(--xhs-text);cursor:pointer;border-radius:8px;padding:8px 16px;font-size:13px;transition:border-color .15s,color .15s,background .15s}.hv-J7W_button:hover{border-color:var(--xhs-red);color:var(--xhs-red)}.hv-J7W_primary{background:var(--xhs-red);color:#fff;cursor:pointer;border:none;border-radius:999px;padding:8px 18px;font-size:13px;font-weight:600;transition:background .15s}.hv-J7W_primary:hover{background:var(--xhs-red-deep)}.hv-J7W_danger{color:var(--xhs-red)}.hv-J7W_danger:hover{border-color:var(--xhs-red);background:var(--xhs-red-soft)}.hv-J7W_card{background:var(--xhs-card);border:1px solid var(--xhs-border);border-radius:12px;align-items:center;gap:10px;margin-bottom:8px;padding:12px 14px;transition:box-shadow .15s;display:flex}.hv-J7W_card:hover{box-shadow:var(--xhs-shadow)}.hv-J7W_badge{background:var(--xhs-red-soft);color:var(--xhs-red);border-radius:999px;padding:2px 10px;font-size:12px;display:inline-block}.hv-J7W_badgeGreen{background:var(--xhs-green-soft);color:var(--xhs-green);border-radius:999px;padding:2px 10px;font-size:12px;display:inline-block}.hv-J7W_badgeGray{color:var(--xhs-text-sub);background:#f5f1f1;border-radius:999px;padding:2px 10px;font-size:12px;display:inline-block}.hv-J7W_empty{background:var(--xhs-red-soft);color:var(--xhs-red);border-radius:8px;padding:10px 14px;font-size:12px}.hv-J7W_muted{color:var(--xhs-text-sub);font-size:12px}";
		const tagId = "dsh-xhs-matrix/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-xhs-matrix";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"danger": "hv-J7W_danger",
			"badge": "hv-J7W_badge",
			"tabActive": "hv-J7W_tabActive",
			"field": "hv-J7W_field",
			"header": "hv-J7W_header",
			"badgeGray": "hv-J7W_badgeGray",
			"textarea": "hv-J7W_textarea",
			"headerDot": "hv-J7W_headerDot",
			"button": "hv-J7W_button",
			"empty": "hv-J7W_empty",
			"muted": "hv-J7W_muted",
			"view": "hv-J7W_view",
			"tab": "hv-J7W_tab",
			"primary": "hv-J7W_primary",
			"input": "hv-J7W_input",
			"card": "hv-J7W_card",
			"badgeGreen": "hv-J7W_badgeGreen",
			"tabs": "hv-J7W_tabs"
		};
		//#endregion
		//#region src/client/panel/AccountsTab.tsx
		/** 账号 Tab：增删改 + 分配人设 + 启用/停用。 */
		function AccountsTab({ api }) {
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [personas, setPersonas] = (0, react.useState)([]);
			const [name, setName] = (0, react.useState)("");
			const [personaId, setPersonaId] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [editName, setEditName] = (0, react.useState)("");
			const [editPersonaId, setEditPersonaId] = (0, react.useState)("");
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
				try {
					await api.createAccount({
						name,
						personaId,
						enabled: true
					});
					setName("");
					setPersonaId("");
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
			};
			const saveEdit = async (account) => {
				try {
					await api.updateAccount(account.id, {
						name: editName,
						personaId: editPersonaId,
						enabled: account.enabled
					});
					setEditingId(null);
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const cancelEdit = () => setEditingId(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "账号名" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: name,
						onChange: (e) => setName(e.target.value),
						placeholder: "账号A"
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
							className: panel_module_css_default.empty,
							children: "还没有人设，请先到「人设」Tab 创建（人设名 + 提示词）。"
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.primary,
					onClick: () => void create(),
					children: "添加账号"
				}),
				accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.card,
					style: {
						alignItems: "flex-start",
						flexDirection: "column"
					},
					children: editingId === account.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "账号名" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: editName,
								onChange: (e) => setEditName(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "人设" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: panel_module_css_default.input,
								value: editPersonaId,
								onChange: (e) => setEditPersonaId(e.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "（未分配）"
								}), personas.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: p.id,
									children: p.name
								}, p.id))]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.primary,
							onClick: () => void saveEdit(account),
							children: "保存"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.button,
							onClick: cancelEdit,
							children: "取消"
						})] })
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { fontWeight: 600 },
							children: account.name
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.muted,
							style: { marginLeft: 10 },
							children: account.personaId === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeGray,
								children: "未分配"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge,
								children: personas.find((p) => p.id === account.personaId)?.name ?? "未知人设"
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.muted,
							style: { marginLeft: 10 },
							children: account.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeGreen,
								children: "启用"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badgeGray,
								children: "停用"
							})
						})
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.button,
							onClick: () => startEdit(account),
							children: "编辑"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.button,
							onClick: () => void toggle(account),
							children: account.enabled ? "停用" : "启用"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: `${panel_module_css_default.button} ${panel_module_css_default.danger}`,
							onClick: () => void remove(account.id),
							children: "删除"
						})
					] })] })
				}, account.id))
			] });
		}
		//#endregion
		//#region src/client/panel/DraftsTab.tsx
		/** 草稿 Tab：查看（点击展开完整文案）、标记 published/dropped、录入指标。 */
		function DraftsTab({ api }) {
			const [drafts, setDrafts] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			const [expandedId, setExpandedId] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)(async () => {
				try {
					setDrafts(await api.listDrafts());
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const toggleExpand = (id) => {
				setExpandedId((prev) => prev === id ? null : id);
			};
			const copyDraft = async (draft) => {
				try {
					await navigator.clipboard.writeText(`【标题】${draft.copy}\n【封面提示词】${draft.coverPrompt}`);
					setError("");
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
				drafts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.muted,
					children: "暂无草稿。在对话中问「今天要发什么」生成。 "
				}),
				drafts.map((draft) => {
					const expanded = expandedId === draft.id;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						style: {
							alignItems: "flex-start",
							flexDirection: "column"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { width: "100%" },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { fontWeight: 600 },
										children: draft.date
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.muted,
										style: { marginLeft: 10 },
										children: [
											"账号 ",
											draft.accountId,
											" / 选题 ",
											draft.topicId
										]
									}),
									draft.status === "generated" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGray,
										style: { marginLeft: 10 },
										children: "已生成"
									}) : draft.status === "published" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGreen,
										style: { marginLeft: 10 },
										children: "已发布"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badgeGray,
										style: { marginLeft: 10 },
										children: "已弃用"
									}),
									draft.metrics !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge,
										style: { marginLeft: 10 },
										children: ["阅读 ", draft.metrics.reads]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.button,
								style: {
									alignSelf: "stretch",
									textAlign: "left",
									whiteSpace: "pre-wrap",
									cursor: "pointer"
								},
								onClick: () => toggleExpand(draft.id),
								title: expanded ? "收起" : "点击查看完整文案",
								children: expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { fontWeight: 600 },
										children: draft.copy.split("\n")[0]
									}),
									"\n",
									draft.copy
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.muted,
									children: [draft.copy.slice(0, 80), draft.copy.length > 80 ? "…" : ""]
								})
							}),
							expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { width: "100%" },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "封面提示词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.muted,
											style: { whiteSpace: "pre-wrap" },
											children: draft.coverPrompt || "—"
										})]
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.button,
										onClick: () => void copyDraft(draft),
										children: "复制文案"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: draft.status === "generated" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.primary,
								onClick: () => void publish(draft),
								children: "标记已发布"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: `${panel_module_css_default.button} ${panel_module_css_default.danger}`,
								onClick: () => void drop(draft),
								children: "标记弃用"
							})] }) })
						]
					}, draft.id);
				})
			] });
		}
		//#endregion
		//#region src/client/panel/NegativesTab.tsx
		/** 黑名单 Tab：账号级/全局条目增删。 */
		function NegativesTab({ api }) {
			const [negatives, setNegatives] = (0, react.useState)([]);
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [keyword, setKeyword] = (0, react.useState)("");
			const [reason, setReason] = (0, react.useState)("");
			const [accountId, setAccountId] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [negs, accs] = await Promise.all([api.listNegatives(), api.listAccounts()]);
					setNegatives(negs);
					setAccounts(accs);
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const add = async () => {
				try {
					await api.addNegative({
						keyword,
						reason,
						accountId: accountId === "" ? void 0 : accountId
					});
					setKeyword("");
					setReason("");
					setAccountId("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const remove = async (id) => {
				try {
					await api.deleteNegative(id);
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "关键词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: keyword,
						onChange: (e) => setKeyword(e.target.value),
						placeholder: "美妆技巧"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "原因" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: reason,
						onChange: (e) => setReason(e.target.value),
						placeholder: "上次没流量"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "作用范围" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						className: panel_module_css_default.input,
						value: accountId,
						onChange: (e) => setAccountId(e.target.value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: "全局"
						}), accounts.map((a) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: a.id,
							children: a.name
						}, a.id))]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.primary,
					onClick: () => void add(),
					children: "添加黑名单"
				}),
				negatives.map((negative) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { fontWeight: 600 },
							children: negative.keyword
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.muted,
							style: { flex: 1 },
							children: negative.reason
						}),
						negative.accountId === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badgeGray,
							children: "全局"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: accounts.find((a) => a.id === negative.accountId)?.name ?? negative.accountId
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: `${panel_module_css_default.button} ${panel_module_css_default.danger}`,
							onClick: () => void remove(negative.id),
							children: "删除"
						})
					]
				}, negative.id))
			] });
		}
		//#endregion
		//#region src/client/panel/PersonasTab.tsx
		/** 人设 Tab：增删改（名称 + prompt 文本域 + 口癖标签）。 */
		function PersonasTab({ api }) {
			const [personas, setPersonas] = (0, react.useState)([]);
			const [name, setName] = (0, react.useState)("");
			const [prompt, setPrompt] = (0, react.useState)("");
			const [toneTags, setToneTags] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
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
			const create = async () => {
				try {
					const tags = toneTags.split(/[,，]/).map((t) => t.trim()).filter((t) => t !== "");
					await api.createPersona({
						name,
						prompt,
						toneTags: tags.length > 0 ? tags : void 0
					});
					setName("");
					setPrompt("");
					setToneTags("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const remove = async (id) => {
				try {
					await api.deletePersona(id);
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "人设名" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: name,
						onChange: (e) => setName(e.target.value),
						placeholder: "干货风"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "人设提示词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: panel_module_css_default.textarea,
						value: prompt,
						onChange: (e) => setPrompt(e.target.value),
						placeholder: "专业、数据支撑、不废话"
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.primary,
					onClick: () => void create(),
					children: "添加人设"
				}),
				personas.map((persona) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { fontWeight: 600 },
							children: persona.name
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.muted,
							style: { flex: 1 },
							children: persona.prompt
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: (persona.toneTags ?? []).join("、") || "—"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: `${panel_module_css_default.button} ${panel_module_css_default.danger}`,
							onClick: () => void remove(persona.id),
							children: "删除"
						})
					]
				}, persona.id))
			] });
		}
		//#endregion
		//#region src/client/panel/TopicsTab.tsx
		/** 选题 Tab：状态过滤、手动添加、批量导入、标记弃用。 */
		function TopicsTab({ api }) {
			const [topics, setTopics] = (0, react.useState)([]);
			const [filter, setFilter] = (0, react.useState)("");
			const [title, setTitle] = (0, react.useState)("");
			const [bulk, setBulk] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				try {
					setTopics(await api.listTopics());
					setError("");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const add = async () => {
				if (title.trim() === "") return;
				try {
					await api.addTopic(title);
					setTitle("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const doImport = async () => {
				const titles = bulk.split("\n").map((t) => t.trim()).filter((t) => t !== "");
				if (titles.length === 0) return;
				try {
					await api.importTopics(titles);
					setBulk("");
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const retire = async (id) => {
				try {
					await api.retireTopic(id);
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const visible = filter === "" ? topics : topics.filter((t) => t.status === filter);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.danger,
					children: error
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "单个选题" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						value: title,
						onChange: (e) => setTitle(e.target.value),
						placeholder: "通勤穿搭"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.primary,
					onClick: () => void add(),
					children: "添加选题"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "批量导入（每行一个）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: panel_module_css_default.textarea,
						value: bulk,
						onChange: (e) => setBulk(e.target.value),
						placeholder: "通勤穿搭\n秋季护肤"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: panel_module_css_default.button,
					onClick: () => void doImport(),
					children: "批量导入"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: "状态过滤" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						className: panel_module_css_default.input,
						value: filter,
						onChange: (e) => setFilter(e.target.value),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: "全部"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "open",
								children: "open（可用）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "used",
								children: "used（已用）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "retired",
								children: "retired（弃用）"
							})
						]
					})]
				}),
				visible.map((topic) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { fontWeight: 600 },
							children: topic.title
						}),
						topic.status === "open" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badgeGreen,
							children: "可用"
						}) : topic.status === "used" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badgeGray,
							children: "已用"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badgeGray,
							children: "弃用"
						}),
						topic.status === "open" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.button,
							onClick: () => void retire(topic.id),
							children: "弃用"
						})
					]
				}, topic.id))
			] });
		}
		//#endregion
		//#region src/client/panel/XhsPanel.tsx
		const TABS = [
			{
				id: "accounts",
				label: "账号"
			},
			{
				id: "personas",
				label: "人设"
			},
			{
				id: "topics",
				label: "选题"
			},
			{
				id: "negatives",
				label: "黑名单"
			},
			{
				id: "drafts",
				label: "草稿"
			}
		];
		/** 五 Tab 配置面板容器。 */
		function XhsPanel(props) {
			const { api } = props;
			const [tab, setTab] = (0, react.useState)("accounts");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.view,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.headerDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "小红书矩阵" })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabs,
						children: TABS.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: tab === t.id ? panel_module_css_default.tabActive : panel_module_css_default.tab,
							onClick: () => setTab(t.id),
							children: t.label
						}, t.id))
					}),
					tab === "accounts" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountsTab, { api }),
					tab === "personas" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PersonasTab, { api }),
					tab === "topics" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TopicsTab, { api }),
					tab === "negatives" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NegativesTab, { api }),
					tab === "drafts" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DraftsTab, { api })
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
				container.className = panel_module_css_default.view;
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
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
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
			applyActive();
			ensure();
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