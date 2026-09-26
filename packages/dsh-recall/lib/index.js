import { copyFileSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
//#region src/host/loopback.ts
/** IPv4 127/8 predicate (four decimal octets, first == 127). */
function isIPv4Loopback(v4) {
	const parts = v4.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Whether a socket remote address names the loopback range (127/8, ::1, IPv4-mapped). */
function isLoopbackAddress(address) {
	if (address === void 0) return false;
	const normalized = address.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
	return isIPv4Loopback(normalized);
}
/** Whether a normalized URL hostname names the loopback authority (localhost, [::1], 127/8). */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	return isIPv4Loopback(hostname);
}
/**
* Request-level trust fence: a loopback socket address AND a loopback Host
* header, plus browser same-origin markers. The socket address is
* authoritative; X-Forwarded-For is never trusted.
*/
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
//#region src/host/http.ts
/** Family-default JSON response headers; callers may append or override. */
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"referrer-policy": "no-referrer"
};
/**
* Write one JSON response. Default headers are the family defaults
* (content-type and referrer-policy); caller headers are appended or
* override them.
*/
function writeJson(res, status, body, headers = {}) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		...JSON_HEADERS,
		...headers
	});
	res.end(payload);
}
//#endregion
//#region src/core/rollback.ts
/**
* Compute the recall truncation point for a decoded session event log.
* @param events - the decoded lines in order (first = session header).
* @returns the cut index (inclusive keep boundary), or null when the log has
* no completed turn to recall.
*/
function rollbackCut(events) {
	let starts = 0;
	let ends = 0;
	let lastStart = -1;
	let lastEnd = -1;
	let prevEnd = -1;
	for (let i = 0; i < events.length; i++) {
		const type = eventType(events[i]);
		if (type === "turn/start") {
			starts += 1;
			lastStart = i;
		} else if (type === "turn/end") {
			ends += 1;
			prevEnd = lastEnd;
			lastEnd = i;
		}
	}
	if (ends === 0) return null;
	const inFlight = starts > ends;
	return {
		cut: inFlight ? lastEnd : ends > 1 ? prevEnd : Math.max(lastStart - 1, 0),
		inFlight
	};
}
/** Read the `type` field of a raw event line (null when unparsable). */
function eventType(raw) {
	try {
		const parsed = JSON.parse(raw);
		if (parsed !== null && typeof parsed === "object" && typeof parsed.type === "string") return parsed.type;
	} catch {}
	return null;
}
//#endregion
//#region src/host/rollback.ts
/**
* Host-side conversation recall (撤回): decode the session event log from
* disk, truncate it to the latest-turn boundary via the pure core, and write
* the result back atomically with a backup.
*
* The dsh host persists each session as a zstd-compressed JSONL event log:
* `$DSH_HOME/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`
* (falling back to `session.jsonl.zstd`). Compression is the standard zstd
* codec, handled here with the pure-JS `fzstd` implementation so the plugin
* needs no native bindings.
*
* Consistency caveat (deliberate): the running host keeps sessions in memory
* and has no message-level API, so a rollback changes the on-disk log while
* the host's open view may stay stale; the response reports `requiresRestart`
* and the caller tells the operator to reopen the session or restart dsh.
* @module @linxin666/dsh-recall/host/rollback
*/
/** Default session store root (the dsh CLI's `~/.dsh/sessions`). */
function sessionsRoot() {
	return join(process.env.DSH_HOME ? process.env.DSH_HOME : homedir(), ".dsh", "sessions");
}
/** Locate a session's event-log file by id, or null when absent. */
function sessionLogPath(root, sessionId) {
	if (!/^[A-Za-z0-9-]{1,80}$/.test(sessionId)) return null;
	let dir = null;
	for (const workspace of readdirSync(root, { withFileTypes: true })) {
		if (!workspace.isDirectory()) continue;
		const candidate = join(root, workspace.name, sessionId);
		try {
			if (readdirSync(candidate).some((entry) => entry.endsWith(".jsonl.zstd"))) {
				dir = candidate;
				break;
			}
		} catch {}
	}
	if (dir === null) return null;
	for (const name of ["session.v4.jsonl.zstd", "session.jsonl.zstd"]) {
		const path = join(dir, name);
		try {
			readFileSync(path);
			return path;
		} catch {}
	}
	return null;
}
/**
* Apply the recall truncation to the latest turn of a session's event log.
* @param sessionId - the session to roll back.
* @param root - the sessions store root (defaults to the harness one).
* @returns the rollback result (or the failure reason).
*/
function applyRollback(sessionId, root = sessionsRoot()) {
	const path = sessionLogPath(root, sessionId);
	if (path === null) return {
		ok: false,
		reason: "missing-session",
		sessionId,
		removedLines: 0,
		inFlight: false,
		requiresRestart: true
	};
	const decompressed = zstdDecompressSync(readFileSync(path));
	const lines = new TextDecoder().decode(decompressed).split("\n").filter((line) => line.trim() !== "");
	const cut = rollbackCut(lines);
	if (cut === null) return {
		ok: false,
		reason: "nothing-to-recall",
		sessionId,
		removedLines: 0,
		inFlight: false,
		requiresRestart: true
	};
	const kept = lines.slice(0, cut.cut + 1).join("\n") + "\n";
	copyFileSync(path, `${path}.recall-bak-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`);
	const compressed = zstdCompressSync(Buffer.from(kept, "utf8"));
	const tmp = `${path}.recall-tmp`;
	writeFileSync(tmp, compressed);
	renameSync(tmp, path);
	return {
		ok: true,
		sessionId,
		removedLines: lines.length - kept.trim().split("\n").length,
		inFlight: cut.inFlight,
		requiresRestart: true
	};
}
//#endregion
//#region src/host/routes.ts
const RECALL_API_PREFIX = "/api/dsh-recall";
function fenced(req, res) {
	if (!isLoopbackRequest(req)) {
		writeJson(res, 403, {
			ok: false,
			error: "loopback-required"
		});
		return true;
	}
	if (req.method !== "POST") {
		writeJson(res, 405, {
			ok: false,
			error: "method-not-allowed"
		});
		return true;
	}
	return false;
}
function readBody(req) {
	return new Promise((resolve) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(Buffer.from(chunk));
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				resolve({ sessionId: "" });
			}
		});
		req.on("error", () => resolve({ sessionId: "" }));
	});
}
/** Build the recall API routes. */
function makeRecallRoutes() {
	return [{
		exactRoute: `${RECALL_API_PREFIX}/rollback`,
		handler: async (req, res) => {
			if (fenced(req, res)) return;
			const body = await readBody(req);
			if (typeof body?.sessionId !== "string" || body.sessionId.length === 0) {
				writeJson(res, 400, {
					ok: false,
					error: "session-id-required"
				});
				return;
			}
			const result = applyRollback(body.sessionId, sessionsRoot());
			writeJson(res, result.ok ? 200 : 409, result);
		}
	}];
}
//#endregion
//#region src/index.ts
const name = "dsh-recall";
const inject = ["webServer"];
/** Register the recall rollback route. */
function apply(ctx) {
	for (const route of makeRecallRoutes()) ctx.webServer.register(route);
}
//#endregion
export { apply, inject, name };
