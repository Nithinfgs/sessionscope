import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const example = fileURLToPath(new URL("../../examples/sessions/demo-claude.jsonl", import.meta.url));

function run(args: string[], env: Record<string, string> = {}, cwd?: string) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", ...env }, cwd });
}

test("prints a terminal report", () => {
  const r = run([example]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sessionscope/);
  assert.match(r.stdout, /Force-pushes to a remote/);
  assert.match(r.stdout, /Files changed/);
});

test("--json emits parseable JSON", () => {
  const r = run([example, "--json"]);
  const j = JSON.parse(r.stdout);
  assert.equal(j.session.toolCalls, 36);
  assert.ok(Array.isArray(j.findings) && j.findings.length > 5);
  assert.ok(!r.stdout.includes(`AKIA${"Q7M2XK9TLZ4WB3NV"}`), "secrets stay redacted");
});

test("--fail-on sets the exit code", () => {
  assert.equal(run([example, "--fail-on", "high"]).status, 1);
  assert.equal(run([example, "--fail-on", "bogus"]).status, 2);
});

test("--html writes a self-contained report", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-html-"));
  const out = join(dir, "r.html");
  const r = run([example, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(out));
  const html = readFileSync(out, "utf8");
  assert.match(html, /<svg/);
  assert.match(html, /Force-pushes to a remote/);
  assert.ok(!/https?:\/\/[^"' ]*\.(js|css)/.test(html), "no external assets");
  assert.ok(!html.includes(`AKIA${"Q7M2XK9TLZ4WB3NV"}`));
});

test("discovers sessions and resolves 'latest' and id prefixes", () => {
  const home = mkdtempSync(join(tmpdir(), "ss-home-"));
  const proj = join(home, "projects", "-home-dev-shop-api");
  mkdirSync(proj, { recursive: true });
  cpSync(example, join(proj, "5d1c9a7e-aaaa.jsonl"));
  const env = { CLAUDE_CONFIG_DIR: home, CODEX_HOME: join(home, "no-codex") };
  const list = run(["list"], env);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /5d1c9a7e/);
  assert.match(run(["latest", "--json"], env).stdout, /"toolCalls": 36/);
  assert.match(run(["5d1c9a7e", "--json"], env).stdout, /"toolCalls": 36/);
  assert.equal(run(["nope-123"], env).status, 2);
});

test("demo runs the bundled sessions", () => {
  assert.match(run(["demo"]).stdout, /shop-api/);
  assert.match(run(["demo", "codex"]).stdout, /blog/);
});

test("--help and --version work", () => {
  assert.match(run(["--help"]).stdout, /Usage/);
  assert.match(run(["--version"]).stdout, /^\d+\.\d+\.\d+/);
});
