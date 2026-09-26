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
		//#region \0dsh-css:packages/dsh-recall/src/client/recall.module.css.mjs
		const css = ".I6_ymW_trigger{appearance:none;box-sizing:border-box;color:inherit;cursor:pointer;background:color-mix(in srgb, currentColor 6%, transparent);border:1px solid color-mix(in srgb, currentColor 16%, transparent);opacity:.85;border-radius:999px;justify-content:center;align-self:flex-start;align-items:center;gap:5px;margin:4px 12px 12px;padding:4px 10px;font:500 12px/18px inherit;transition:opacity .12s,background-color .12s;display:inline-flex}.I6_ymW_trigger:hover:not(:disabled){opacity:1;background:color-mix(in srgb, currentColor 10%, transparent)}.I6_ymW_trigger:disabled{cursor:default;opacity:.5}.I6_ymW_trigger:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:-1px}.I6_ymW_trigger svg{flex:none;display:block}";
		const tagId = "@linxin666/dsh-recall/packages/dsh-recall/src/client/recall.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-recall";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var recall_module_css_default = { "trigger": "I6_ymW_trigger" };
		//#endregion
		//#region src/client/RecallTrigger.tsx
		/**
		* The recall trigger: a small tail-of-conversation button. Clicking it
		* confirms once, POSTs the active session id to the host rollback route, and
		* surfaces the outcome with the reopen/restart note.
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
				fetch("/api/dsh-recall/rollback", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: id })
				}).then((r) => r.json()).then((res) => {
					if (!res.ok) {
						setOutcome(res.reason === "missing-session" ? "missing" : res.reason === "nothing-to-recall" ? "none" : "failed");
						return;
					}
					setOutcome("done");
				}).catch(() => setOutcome("failed"));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: recall_module_css_default.trigger,
				"data-dsh-plugin": "recall",
				disabled: busy,
				title: t("recall.hint"),
				"aria-label": t("recall.button"),
				onClick: recall,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					viewBox: "0 0 16 16",
					width: "13",
					height: "13",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.4",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 6.5h9" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8.5 2.5l3 4-3 4" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 13.5h9.5" })
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: outcome === "idle" || outcome === "loading" ? t("recall.button") : outcome === "done" ? t("recall.done") : t("recall.failed") })]
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
		* Mount the recall trigger at the tail of the open conversation flow.
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
				if (container.parentElement !== flow) flow.append(container);
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
			"recall.done": "已撤回，重新打开会话或重启 dsh 后生效",
			"recall.failed": "撤回失败，请重试"
		};
		const en = {
			"recall.button": "Recall latest",
			"recall.hint": "Recall the latest conversation turn (latest only; history stays untouched)",
			"recall.confirm": "Recall the latest conversation turn? History stays untouched.",
			"recall.done": "Recalled; reopen the conversation or restart dsh to apply",
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
			ctx.effect(() => () => disposeRecall(), "dsh-recall: conversation recall trigger");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map