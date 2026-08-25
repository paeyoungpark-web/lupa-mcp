#!/usr/bin/env node
/**
 * 스모크 테스트 — 실제 MCP 클라이언트가 하는 것과 같은 순서로 stdio에 말을 건다.
 * initialize → tools/list → lupa_search → lupa_read.
 *
 * 실제 인덱스를 읽으므로 Lupa 앱이 설치·인덱싱된 Mac에서만 의미가 있다.
 *   node test/smoke.js [검색어]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const query = process.argv[2] || "보호정책";

const server = spawn("node", [join(here, "..", "src", "index.js")], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const waiting = new Map();

server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const resolve = waiting.get(message.id);
    if (resolve) {
      waiting.delete(message.id);
      resolve(message);
    }
  }
});

let nextId = 1;
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`${method} 응답 없음`)), 40_000);
  });
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
  return condition;
}

const init = await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
check("initialize", init.result?.serverInfo?.name === "lupa", init.result?.serverInfo?.name);
server.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
);

const tools = await call("tools/list", {});
const names = (tools.result?.tools || []).map((t) => t.name).sort();
check("tools/list", names.join(",") === "lupa_read,lupa_search", names.join(","));

const searched = await call("tools/call", {
  name: "lupa_search",
  arguments: { query, limit: 3 },
});
const text = searched.result?.content?.[0]?.text || "";
let payload = {};
try {
  payload = JSON.parse(text);
} catch {
  /* 아래 검사에서 걸린다 */
}
check("lupa_search 응답이 JSON", typeof payload.total_matches === "number",
      `total=${payload.total_matches} returned=${payload.returned} ${payload.elapsed_ms}ms`);

if (payload.results?.length) {
  const first = payload.results[0];
  check("결과에 경로가 있음", typeof first.path === "string", first.name);

  const read = await call("tools/call", {
    name: "lupa_read",
    arguments: { path: first.path, max_chars: 300 },
  });
  const body = read.result?.content?.[0]?.text || "";
  const failed = read.result?.isError;
  check("lupa_read 응답", body.length > 0,
        failed ? `본문 없음(정상 처리): ${body.slice(0, 60)}` : `${body.length}자`);
} else {
  console.log("… 결과가 0건이라 lupa_read는 건너뜀 (다른 검색어로 시도해 보세요)");
}

const missing = await call("tools/call", {
  name: "lupa_read",
  arguments: { path: "/nowhere/does-not-exist.pdf" },
});
check("없는 파일은 오류로 보고", missing.result?.isError === true,
      (missing.result?.content?.[0]?.text || "").slice(0, 50));

server.kill();
