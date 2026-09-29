window.__ModuleLoader__.load({
	id: "@linxin666/dsh-recall",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/body-mutations.ts
		/** Cross-bundle registry key; `Symbol.for` so every module copy agrees. */
		const HUB_KEY = Symbol.for("dsh-web.body-mutation-hub");
		const INVALIDATION_ONLY = Symbol.for("dsh-web.body-mutation-invalidation");
		function needsRecords(subscribers) {
			for (const listener of subscribers) if (!listener[INVALIDATION_ONLY]) return true;
			return false;
		}
		/**
		* Subscribe to a coalesced DOM re-check without retaining mutation records.
		* The marked wrapper also works with an older hub, which delivers records
		* that it simply ignores until a page reload picks up the updated hub.
		*/
		function subscribeBodyInvalidations(subscriber) {
			const listener = () => {
				subscriber();
			};
			listener[INVALIDATION_ONLY] = true;
			return subscribeBodyMutations(listener);
		}
		/**
		* Subscribe to body-level childList mutations.
		* @param subscriber - called at most once per animation frame with the records
		*   collected since the previous flush; must be safe to run repeatedly.
		* @returns the disposer removing this subscriber (and the observer when it was
		*   the last one).
		*/
		function subscribeBodyMutations(subscriber) {
			if (typeof globalThis === "undefined" || typeof document === "undefined") return () => {};
			if (typeof MutationObserver !== "function") return () => {};
			const registry = globalThis;
			let hub = registry[HUB_KEY];
			if (hub === void 0) {
				const subscribers = /* @__PURE__ */ new Set();
				const created = {
					observer: void 0,
					subscribers,
					pending: [],
					scheduled: false
				};
				const flush = () => {
					created.frame = void 0;
					created.scheduled = false;
					const batch = created.pending;
					created.pending = [];
					for (const listener of [...subscribers]) {
						if (!subscribers.has(listener)) continue;
						try {
							listener(batch);
						} catch {}
					}
				};
				const schedule = () => {
					if (created.scheduled) return;
					created.scheduled = true;
					if (typeof requestAnimationFrame === "function") created.frame = requestAnimationFrame(flush);
					else flush();
				};
				created.observer = new MutationObserver((records) => {
					if (needsRecords(subscribers)) for (const record of records) created.pending.push(record);
					schedule();
				});
				created.observer.observe(document.body ?? document.documentElement, {
					childList: true,
					subtree: true
				});
				registry[HUB_KEY] = created;
				hub = created;
			}
			const active = hub;
			active.subscribers.add(subscriber);
			let subscribed = true;
			return () => {
				if (!subscribed) return;
				subscribed = false;
				active.subscribers.delete(subscriber);
				if (!needsRecords(active.subscribers)) active.pending = [];
				if (active.subscribers.size === 0 && registry[HUB_KEY] === active) {
					active.observer.disconnect();
					if (active.frame !== void 0 && typeof cancelAnimationFrame === "function") cancelAnimationFrame(active.frame);
					active.frame = void 0;
					active.pending = [];
					active.scheduled = false;
					delete registry[HUB_KEY];
				}
			};
		}
		//#endregion
		//#region src/client/cleanup.ts
		/**
		* Client-side cleanup after a successful recall: the recalled latest turn's
		* flow rows vanish from the open conversation immediately — the operator sees
		* their message and its reply removed without reopening the session or
		* restarting dsh. The on-disk facts stay authoritative (the host route already
		* truncated the event log); this module only keeps the visible flow in step.
		*
		* The official chat shell renders every turn's content as flow rows marked
		* with `data-chat-turn=<number>` (ascending along the conversation) and a
		* stable identity key on `data-chat-anchor-key` (mirrored on
		* `data-chat-flow-key`). Disk recall semantics (core/rollback) cut everything
		* from the turn containing the LAST real user message through the end of the
		* log, so the client mirror is: anchor on the LAST flow row of kind `user` or
		* `steering` (the shell's own selector for operator-typed messages — injected
		* platform content never renders as `user`), then remove every row whose turn
		* number is that row's or higher.
		*
		* The shell renders rows from its own React store (the running host keeps the
		* session in memory), so a later reconciliation re-creates removed rows.
		* Every removed row's anchor key therefore lands in a page-level stylesheet,
		* and the key sets persist per session (localStorage, best effort): re-created
		* rows are hidden by attribute selector while the SPA lives, and the same keys
		* cannot reappear elsewhere — anchor keys derive from event identity, so both
		* a re-sent message and a post-reopen reload render fresh keys, which keeps
		* stale rules inert instead of hiding new content. Storage-unavailable
		* environments fall back to the in-page map: hiding still works for the whole
		* page lifetime, only the cross-reload persistence is lost.
		* @module @linxin666/dsh-recall/client/cleanup
		*/
		const HIDDEN_PREFIX = "dsh-recall.hidden.";
		/** Cap on persisted key sets, trimming the least recently written sessions. */
		const MAX_PERSISTED_SESSIONS = 20;
		/** The shell marks operator-typed messages (mid-stream steering included) so. */
		const USER_ROW_SELECTOR = "[data-chat-flow-kind=\"user\"], [data-chat-flow-kind=\"steering\"]";
		const TURN_ATTR = "data-chat-turn";
		const KEY_ATTR = "data-chat-anchor-key";
		const FALLBACK_KEY_ATTR = "data-chat-flow-key";
		/** The live per-session key sets (insertion order = recency). */
		const hiddenBySession = /* @__PURE__ */ new Map();
		let hydrated = false;
		/** Best-effort Storage access (null when the environment provides none). */
		function storage() {
			try {
				return window.localStorage ?? null;
			} catch {
				return null;
			}
		}
		/** Hydrate the live map from persisted key sets (once per page). */
		function hydrate() {
			if (hydrated) return;
			hydrated = true;
			const store = storage();
			if (store === null) return;
			for (let i = 0; i < store.length; i++) {
				const key = store.key(i);
				if (key === null || !key.startsWith(HIDDEN_PREFIX)) continue;
				try {
					const sessionId = key.slice(18);
					if (hiddenBySession.has(sessionId)) continue;
					const parsed = JSON.parse(store.getItem(key) ?? "[]");
					if (Array.isArray(parsed)) hiddenBySession.set(sessionId, new Set(parsed.filter((k) => typeof k === "string")));
				} catch {
					continue;
				}
			}
		}
		/** Persist one session's hidden keys, trimming the oldest persisted sessions past the cap. */
		function persist(sessionId, keys) {
			const store = storage();
			if (store === null) return;
			try {
				store.removeItem(HIDDEN_PREFIX + sessionId);
				for (let i = hiddenBySession.size; i > MAX_PERSISTED_SESSIONS; i--) {
					const stale = hiddenBySession.keys().next().value;
					if (stale === void 0) break;
					store.removeItem(HIDDEN_PREFIX + stale);
				}
				store.setItem(HIDDEN_PREFIX + sessionId, JSON.stringify([...keys]));
			} catch {}
		}
		/** Register one session's hidden keys in the live map. */
		function remember(sessionId, added) {
			hydrate();
			const set = hiddenBySession.get(sessionId) ?? /* @__PURE__ */ new Set();
			for (const key of added) set.add(key);
			hiddenBySession.delete(sessionId);
			hiddenBySession.set(sessionId, set);
			persist(sessionId, set);
		}
		/** A row's turn number, or null when absent or not a safe integer. */
		function turnValue(row) {
			const value = Number(row.getAttribute(TURN_ATTR));
			return Number.isSafeInteger(value) ? value : null;
		}
		/** A row's identity key, or null when the shell rendered it bare. */
		function rowKey(row) {
			return row.getAttribute(KEY_ATTR) ?? row.getAttribute(FALLBACK_KEY_ATTR) ?? null;
		}
		/** Escape a key for a double-quoted CSS attribute selector. */
		function cssEscape(value) {
			return value.replace(/[\\"]/g, (ch) => "\\" + ch);
		}
		/** The page-level stylesheet that keeps re-created rows hidden (or null). */
		function hiddenStyle() {
			if (typeof document === "undefined") return null;
			let style = document.querySelector("style[data-dsh-recall-hidden]");
			if (style === null && document.head !== null) {
				style = document.createElement("style");
				style.setAttribute("data-dsh-recall-hidden", "");
				document.head.appendChild(style);
			}
			return style;
		}
		/** Rebuild the stylesheet from every session's hidden keys. */
		function refreshStyle() {
			const style = hiddenStyle();
			if (style === null) return;
			const rules = [];
			for (const keys of hiddenBySession.values()) for (const key of keys) rules.push(`[${KEY_ATTR}="${cssEscape(key)}"]{display:none!important}`);
			style.textContent = rules.join("\n");
		}
		/**
		* Remove the recalled latest turn's rows from the open conversation flow and
		* remember their identity keys so re-created rows stay hidden. No-op when no
		* conversation is open or no operator message anchors the flow (the disk
		* rollback's outcome is unaffected either way).
		* @param sessionId - the session whose recall just succeeded on disk.
		*/
		function hideRecalledTail(sessionId) {
			const flow = recallFlow();
			if (flow === null) return;
			const rows = [...flow.querySelectorAll(`[${TURN_ATTR}]`)];
			const userRows = rows.filter((row) => row.matches(USER_ROW_SELECTOR));
			const anchor = userRows.length > 0 ? userRows[userRows.length - 1] : null;
			if (anchor === null) return;
			const turn = turnValue(anchor);
			if (turn === null) return;
			const doomed = rows.filter((row) => {
				const value = turnValue(row);
				return value !== null && value >= turn;
			});
			if (doomed.length === 0) return;
			const keys = /* @__PURE__ */ new Set();
			for (const row of doomed) {
				const key = rowKey(row);
				if (key !== null) keys.add(key);
			}
			for (const row of doomed) row.remove();
			if (keys.size > 0) {
				remember(sessionId, keys);
				refreshStyle();
			}
		}
		/**
		* Drop the plugin's page-level hidden stylesheet (plugin disposal): the
		* persisted key sets survive a reload so re-created rows stay hidden there.
		* @returns disposer removing the stylesheet.
		*/
		function recallCleanupDisposer() {
			return () => {
				document.querySelector("style[data-dsh-recall-hidden]")?.remove();
			};
		}
		/** Locate the open conversation's message flow (null outside a chat view). */
		function recallFlow() {
			return document.querySelector("[data-pane=\"conversation\"]")?.querySelector("[data-chat-flow]") ?? null;
		}
		//#endregion
		//#region src/client/composer.ts
		/**
		* Composer refill: put recalled text back into the official conversation
		* composer. The shell's composer is a controlled contenteditable textbox
		* (`[role="textbox"][contenteditable="true"]`, falling back to a visible
		* textarea), so the text is written directly and an `input` event is
		* dispatched for the shell to pick it up.
		* @module @linxin666/dsh-recall/client/composer
		*/
		/** The conversation composer element (null when no chat view is open). */
		function composerElement() {
			const pane = document.querySelector("[data-pane=\"conversation\"]");
			if (pane === null) return null;
			for (const el of pane.querySelectorAll("[role=\"textbox\"][contenteditable=\"true\"], textarea")) if (el.offsetParent !== null) return el;
			return null;
		}
		/** Fill the composer with text (no-op when the composer is absent). */
		function fillComposer(text) {
			const el = composerElement();
			if (el === null || text.length === 0) return;
			el.focus();
			if (el instanceof HTMLTextAreaElement) {
				const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
				if (setter !== void 0) setter.call(el, text);
				el.dispatchEvent(new Event("input", { bubbles: true }));
				return;
			}
			el.textContent = "";
			el.appendChild(el.ownerDocument.createTextNode(text));
			const sel = el.ownerDocument.getSelection();
			sel?.removeAllRanges();
			const range = el.ownerDocument.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
			sel?.addRange(range);
			el.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: text
			}));
		}
		//#endregion
		//#region src/client/draft.ts
		const DRAFT_PREFIX = "dsh-recall.draft.";
		/** Save the recalled content as the pending refill for a session. */
		function saveDraft(sessionId, content) {
			try {
				window.localStorage.setItem(DRAFT_PREFIX + sessionId, JSON.stringify({
					...content,
					at: Date.now()
				}));
			} catch {}
		}
		/** Take and remove the pending draft for a session (null when none). */
		function takeDraft(sessionId) {
			try {
				const raw = window.localStorage.getItem(DRAFT_PREFIX + sessionId);
				if (raw === null) return null;
				window.localStorage.removeItem(DRAFT_PREFIX + sessionId);
				const parsed = JSON.parse(raw);
				if (typeof parsed.text !== "string") return null;
				return parsed;
			} catch {
				return null;
			}
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-recall/src/client/recall.module.css.mjs
		const css = ".I6_ymW_trigger{appearance:none;box-sizing:border-box;color:inherit;cursor:pointer;background:color-mix(in srgb, currentColor 6%, transparent);border:1px solid color-mix(in srgb, currentColor 16%, transparent);opacity:.8;border-radius:8px;justify-content:center;align-self:flex-start;align-items:center;width:26px;height:26px;margin:0;padding:4px;transition:opacity .12s,background-color .12s;display:inline-flex}.I6_ymW_wrap{align-items:center;gap:6px;display:inline-flex}.I6_ymW_status{opacity:.65;font:400 12px/16px inherit}.I6_ymW_trigger:hover:not(:disabled){opacity:1;background:color-mix(in srgb, currentColor 10%, transparent)}.I6_ymW_trigger:disabled{cursor:default;opacity:.5}.I6_ymW_trigger:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:-1px}.I6_ymW_trigger svg{flex:none;display:block}";
		const tagId = "@linxin666/dsh-recall/packages/dsh-recall/src/client/recall.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-recall";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var recall_module_css_default = {
			"status": "I6_ymW_status",
			"trigger": "I6_ymW_trigger",
			"wrap": "I6_ymW_wrap"
		};
		//#endregion
		//#region src/client/RecallTrigger.tsx
		/**
		* The recall trigger: a small tail-of-conversation button. Clicking it
		* confirms once, POSTs the active session id to the host rollback route,
		* removes the latest turn's rows from the visible flow immediately, and keeps
		* the recalled content available as a composer draft (the reopen/restart
		* note covers the host-memory side, not the visible flow).
		* @module @linxin666/dsh-recall/client/RecallTrigger
		*/
		function RecallTrigger({ t, sessionId, inFlight }) {
			const [outcome, setOutcome] = (0, react.useState)("idle");
			const busy = outcome === "loading";
			const recall = () => {
				const id = sessionId();
				if (id === null || inFlight()) return;
				if (!window.confirm(t("recall.confirm"))) return;
				setOutcome("loading");
				const MAX_ATTEMPTS = 5;
				let attempts = 0;
				const attempt = () => {
					fetch("/api/dsh-recall/rollback", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId: id })
					}).then((r) => r.json()).then((res) => {
						if (!res.ok) {
							if (res.reason === "missing-session" && attempts < MAX_ATTEMPTS) {
								attempts += 1;
								window.setTimeout(attempt, 2e3 * attempts);
								return;
							}
							setOutcome(res.reason === "missing-session" ? "missing" : res.reason === "nothing-to-recall" ? "none" : "failed");
							return;
						}
						hideRecalledTail(id);
						if (res.recalled !== void 0 && id !== null) {
							saveDraft(id, {
								text: res.recalled.text,
								attachments: res.recalled.attachments ?? []
							});
							if (res.recalled.text.length > 0) fillComposer(res.recalled.text);
						}
						setOutcome("done");
					}).catch(() => setOutcome("failed"));
				};
				attempt();
			};
			const status = outcome === "failed" || outcome === "missing" || outcome === "none" ? t("recall.failed") : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: recall_module_css_default.wrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: recall_module_css_default.trigger,
					"data-dsh-plugin": "recall",
					disabled: busy,
					title: t("recall.hint"),
					"aria-label": t("recall.button"),
					onClick: recall,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						viewBox: "0 0 16 16",
						width: "14",
						height: "14",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						strokeLinecap: "round",
						strokeLinejoin: "round",
						"aria-hidden": "true",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M11.2 2.8v5.2a4 4 0 0 1-4 4H2.8" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.4 9.4l-2.8 2.8 2.8 2.8" })]
					})
				}), status !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: recall_module_css_default.status,
					children: status
				}) : null]
			});
		}
		/** The active conversation's session id (null outside a chat view). */
		function recallSessionId() {
			const pane = document.querySelector("[data-pane=\"conversation\"]");
			if (pane === null) return null;
			if (pane.dataset.conversationSession !== void 0) return pane.dataset.conversationSession || null;
			return pane.querySelector("[data-conversation-session]")?.getAttribute("data-conversation-session") ?? null;
		}
		/** Whether a turn is currently streaming in the conversation pane. */
		function isTurnInFlight() {
			return document.querySelector("[data-streaming], [data-state=\"running\"], [aria-busy=\"true\"]") !== null;
		}
		/**
		* Mount the recall trigger beside the open conversation's latest copy button.
		* @param props - label and rollback request inputs.
		* @returns disposer removing the container and its observers.
		*/
		function mountRecallTrigger(props) {
			if (typeof document !== "undefined" && document.querySelector("[data-dsh-recall-trigger]") !== null) return () => {};
			const container = document.createElement("div");
			container.setAttribute("data-dsh-recall-trigger", "");
			const root = (0, react_dom_client.createRoot)(container);
			root.render((0, react.createElement)(RecallTrigger, props));
			/** Keep the trigger at the chat flow tail; hide for history sockets or in-flight turns. */
			const place = () => {
				const pane = document.querySelector("[data-pane=\"conversation\"]");
				const flow = pane?.querySelector("[data-chat-flow]");
				if (pane == null || flow == null) {
					if (container.parentElement !== null) container.remove();
					return;
				}
				const sid = props.sessionId();
				if (sid !== null) {
					const draft = takeDraft(sid);
					if (draft !== null && draft.text.length > 0) fillComposer(draft.text);
				}
				const copies = [...flow.querySelectorAll("button")].filter((b) => /copy|\u590d\u5236/i.test(b.getAttribute("aria-label") ?? "") && b.getBoundingClientRect().width > 0);
				const anchor = copies.length > 0 ? copies[copies.length - 1] : null;
				const row = anchor?.parentElement ?? null;
				if (anchor === null || row === null) {
					container.style.display = "none";
					return;
				}
				if (container.parentElement !== row) row.insertBefore(container, anchor.nextSibling);
				container.style.display = props.sessionId() !== null && !props.inFlight() ? "flex" : "none";
			};
			place();
			const unsubscribeBody = subscribeBodyInvalidations(place);
			return () => {
				unsubscribeBody();
				root.unmount();
				container.remove();
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Client locale dictionary for the recall namespace (zh is the key source).
		* @module @linxin666/dsh-recall/client/locales
		*/
		const NS = "dsh-web-ui-recall";
		const zh = {
			"recall.button": "撤回最新",
			"recall.hint": "撤回最新一条对话内容（仅最新；历史对话不可撤回）",
			"recall.confirm": "确定撤回最新一条对话内容？历史对话不受影响。",
			"recall.failed": "撤回失败，请重试"
		};
		const en = {
			"recall.button": "Recall latest",
			"recall.hint": "Recall the latest conversation turn (latest only; history stays untouched)",
			"recall.confirm": "Recall the latest conversation turn? History stays untouched.",
			"recall.failed": "Recall failed, try again"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = ["locale"];
		/** Mount the recall trigger behind the conversation flow tail. */
		function apply(ctx) {
			ctx.locale.register(NS, {
				zh,
				en
			});
			const disposeRecall = mountRecallTrigger({
				t: ctx.locale.bind(NS),
				sessionId: recallSessionId,
				inFlight: isTurnInFlight
			});
			ctx.effect(() => () => {
				disposeRecall();
				recallCleanupDisposer()();
			}, "dsh-recall: conversation recall trigger");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map