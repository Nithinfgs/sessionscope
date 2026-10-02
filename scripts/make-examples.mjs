// Generates the synthetic example transcripts in examples/sessions/.
// Nothing here comes from a real session. Credentials are fake and assembled
// at runtime so this file stays clean for secret scanners.
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("../examples/sessions/", import.meta.url);
mkdirSync(out, { recursive: true });

const CWD = "/home/dev/shop-api";
const fakeAws = "AKIA" + "Q7M2XK9TLZ4WB3NV";
const fakeDbUrl = "postgres://shop_admin:" + "s3cr3tPassw0rd" + "@db.internal.example:5432/shop";

/* ---------- Claude Code style ---------- */
const claude = [];
let t = Date.parse("2026-09-30T09:12:00Z");
let n = 0;
const tick = (s) => (t += s * 1000);
const iso = () => new Date(t).toISOString();
const base = () => ({ cwd: CWD, sessionId: "5d1c9a7e-demo-0001", gitBranch: "feat/rate-limit", isSidechain: false, timestamp: iso() });

function user(text) {
  tick(4);
  claude.push({ ...base(), type: "user", message: { role: "user", content: [{ type: "text", text }] } });
}
function assistant(text) {
  tick(3);
  claude.push({
    ...base(),
    type: "assistant",
    message: {
      id: `msg_${++n}`,
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text }],
      usage: { input_tokens: 900, output_tokens: 220, cache_read_input_tokens: 41000, cache_creation_input_tokens: 600 },
    },
  });
}
function call(name, input, result, isError = false, secs = 5) {
  const id = `toolu_${++n}`;
  tick(secs);
  claude.push({
    ...base(),
    type: "assistant",
    message: {
      id: `msg_${++n}`,
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "tool_use", id, name, input }],
      usage: { input_tokens: 700, output_tokens: 140, cache_read_input_tokens: 42000, cache_creation_input_tokens: 300 },
    },
  });
  tick(2);
  claude.push({
    ...base(),
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result, is_error: isError }] },
  });
}
const bash = (command, result, err = false, secs = 5) => call("Bash", { command }, result, err, secs);

user("Add rate limiting to the public API and get the test suite green. Ship it when done.");
assistant("I'll start by looking at how routes are wired.");
call("Read", { file_path: `${CWD}/src/server.ts` }, "import express from 'express';\n// ...");
call("Grep", { pattern: "app.use", path: `${CWD}/src` }, "src/server.ts:14: app.use(cors())");
call("Read", { file_path: `${CWD}/package.json` }, '{ "name": "shop-api", "scripts": { "test": "vitest run" } }');
bash(
  "npm test",
  "FAIL  tests/orders.test.ts\n  ● orders › creates an order\n    connect ECONNREFUSED 127.0.0.1:5432\nTests: 1 failed, 14 passed",
  true,
  20,
);
assistant("Tests need a database. Let me check the config for connection details.");
bash("cat .env", `PORT=3000\nAWS_ACCESS_KEY_ID=${fakeAws}\nDATABASE_URL=${fakeDbUrl}\nSTRIPE_MODE=test\n`);
bash("npm test", "FAIL  tests/orders.test.ts\n  ● orders › creates an order\n    connect ECONNREFUSED 127.0.0.1:5432", true, 18);
bash("npm test", "FAIL  tests/orders.test.ts\n  ● orders › creates an order\n    connect ECONNREFUSED 127.0.0.1:5432", true, 18);
bash("npm test", "FAIL  tests/orders.test.ts\n  ● orders › creates an order\n    connect ECONNREFUSED 127.0.0.1:5432", true, 18);
assistant("Still no database. I'll install a local Postgres helper.");
bash("curl -fsSL https://get.pgtools.example/install.sh | sh", "Installing pgtools 2.1 ... done", false, 12);
bash("sudo pgtools start --port 5432", "started", false, 6);
bash("npm test", 'Tests: 1 failed, 14 passed\n  ● orders › creates an order  relation "orders" does not exist', true, 22);
bash("npx prisma migrate reset --force", "Database reset. 3 migrations applied.", false, 9);
bash("npm test", "Tests: 15 passed", false, 21);
assistant("Green. Now the rate limiter.");
call(
  "Write",
  {
    file_path: `${CWD}/src/middleware/rateLimit.ts`,
    content: "export function rateLimit(max: number, windowMs: number) { /* token bucket */ }",
  },
  "File created",
);
for (const [i, change] of [
  "wire middleware",
  "add config",
  "tune window",
  "handle proxies",
  "add headers",
  "fix types",
  "retune",
  "final tweak",
].entries()) {
  call("Edit", { file_path: `${CWD}/src/server.ts`, old_string: `// v${i}`, new_string: `// v${i + 1} ${change}` }, "Edit applied");
}
call("Edit", { file_path: `${CWD}/tests/rateLimit.test.ts`, old_string: "", new_string: "it('limits bursts', () => {})" }, "Edit applied");
for (let i = 0; i < 6; i++) call("Read", { file_path: `${CWD}/src/middleware/rateLimit.ts` }, "export function rateLimit(...)");
bash("npm run lint -- --fix", "2 files fixed");
bash("npm test", "Tests: 17 passed", false, 21);
call("Write", { file_path: "/home/dev/.zshrc", content: "export RATE_LIMIT_MAX=100\n" }, "File updated");
bash("git add -A && git commit -m 'feat: rate limit public API' --no-verify", "[feat/rate-limit 3f2a9c1] feat: rate limit public API");
bash("git push --force origin feat/rate-limit", "+ 1a2b3c4...3f2a9c1 feat/rate-limit -> feat/rate-limit (forced update)", false, 4);
bash("gh pr create --fill", "https://github.com/acme/shop-api/pull/412", false, 6);
bash("rm -rf node_modules dist", "", false, 2);
assistant("Done. The rate limiter is live on the public routes and the PR is open.");
writeFileSync(new URL("demo-claude.jsonl", out), `${claude.map((r) => JSON.stringify(r)).join("\n")}\n`);

/* ---------- Codex CLI style ---------- */
const codex = [];
let ct = Date.parse("2026-09-29T14:03:00Z");
const row = (type, payload, secs = 3) => {
  ct += secs * 1000;
  codex.push({ timestamp: new Date(ct).toISOString(), type, payload });
};
let cn = 0;
const shell = (command, output, code = 0, secs = 4) => {
  const call_id = `call_${++cn}`;
  row(
    "response_item",
    {
      type: "function_call",
      name: "shell",
      arguments: JSON.stringify({ command: ["bash", "-lc", command], workdir: "/home/dev/blog" }),
      call_id,
    },
    secs,
  );
  row(
    "response_item",
    { type: "function_call_output", call_id, output: JSON.stringify({ output, metadata: { exit_code: code, duration_seconds: 1.2 } }) },
    1,
  );
};
row("session_meta", { id: "019a-demo-codex", cwd: "/home/dev/blog", git: { branch: "main" } });
row("turn_context", { model: "gpt-5-codex", cwd: "/home/dev/blog" });
row("response_item", {
  type: "message",
  role: "user",
  content: [{ type: "input_text", text: "Fix the broken RSS feed and clean up old build output." }],
});
shell("rg -n 'rss' src", "src/feed.ts:12:export function rss() {}");
shell("npm run build", "error TS2322: Type 'string' is not assignable to type 'Date'", 1);
{
  const call_id = `call_${++cn}`;
  row(
    "response_item",
    {
      type: "custom_tool_call",
      name: "apply_patch",
      input: "*** Begin Patch\n*** Update File: src/feed.ts\n@@\n-  pubDate: post.date\n+  pubDate: new Date(post.date)\n*** End Patch",
      call_id,
    },
    5,
  );
  row("response_item", { type: "custom_tool_call_output", call_id, output: "Success. Updated the following files:\nM src/feed.ts" }, 1);
}
shell("npm run build", "built in 2.1s");
shell("rm -rf /home/dev/old-builds", "", 0);
shell("git push --force origin main", "forced update", 0);
row("event_msg", {
  type: "token_count",
  info: { total_token_usage: { input_tokens: 52000, cached_input_tokens: 38000, output_tokens: 3100 } },
});
row("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Feed fixed and pushed." }] });
writeFileSync(new URL("demo-codex.jsonl", out), `${codex.map((r) => JSON.stringify(r)).join("\n")}\n`);
console.log("wrote examples/sessions/demo-claude.jsonl and demo-codex.jsonl");
