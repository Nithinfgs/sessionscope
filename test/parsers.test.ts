import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyzers/index.js";
import { patchPaths } from "../src/parsers/codex.js";
import { detectSource, parseSession } from "../src/parsers/index.js";

const ex = (name: string) => fileURLToPath(new URL(`../../examples/sessions/${name}`, import.meta.url));

test("parses the Claude Code example", () => {
  assert.equal(detectSource(ex("demo-claude.jsonl")), "claude");
  const s = parseSession(ex("demo-claude.jsonl"));
  assert.equal(s.source, "claude");
  assert.equal(s.cwd, "/home/dev/shop-api");
  assert.equal(s.branch, "feat/rate-limit");
  assert.equal(s.prompts, 1);
  assert.equal(s.calls.length, 36);
  assert.ok(
    s.calls.every((c) => c.result),
    "every call is paired with its result",
  );
  assert.equal(s.calls.filter((c) => c.result?.isError).length, 5);
  assert.deepEqual(s.models, ["claude-sonnet-5-5"]);
});

test("parses the Codex example", () => {
  assert.equal(detectSource(ex("demo-codex.jsonl")), "codex");
  const s = parseSession(ex("demo-codex.jsonl"));
  assert.equal(s.cwd, "/home/dev/blog");
  assert.equal(s.calls.length, 6);
  assert.equal(s.calls[0]?.command, "rg -n 'rss' src");
  assert.equal(s.calls[1]?.result?.isError, true, "non-zero exit code is an error");
  assert.deepEqual(s.calls[2]?.paths, ["src/feed.ts"]);
  assert.equal(s.calls[2]?.category, "edit");
  assert.equal(s.usage.cacheRead, 38000);
  assert.equal(s.usage.input, 14000);
});

test("end-to-end analysis of the Claude example", () => {
  const r = analyze(parseSession(ex("demo-claude.jsonl")));
  const titles = r.findings.map((f) => f.title);
  for (const expected of [
    "Pipes a download into a shell",
    "Force-pushes to a remote",
    "AWS access key ID in transcript",
    "Credentials in URL in transcript",
  ]) {
    assert.ok(titles.includes(expected), `missing: ${expected}`);
  }
  assert.ok(titles.some((t) => t.startsWith("Retried a failing call")));
  assert.equal(r.failedCalls, 5);
});

test("tolerates malformed lines and counts them", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-"));
  const file = join(dir, "bad.jsonl");
  writeFileSync(
    file,
    [
      "not json",
      JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "hello" } }),
      "{broken",
      "",
    ].join("\n"),
  );
  const s = parseSession(file);
  assert.equal(s.malformedLines, 2);
  assert.equal(s.prompts, 1);
});

test("rejects files that are not agent transcripts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-"));
  const file = join(dir, "other.jsonl");
  writeFileSync(file, `${JSON.stringify({ hello: "world" })}\n`);
  assert.throws(() => parseSession(file), /Unrecognised transcript format/);
});

test("patchPaths extracts files from apply_patch bodies", () => {
  const body = "*** Begin Patch\n*** Add File: a.txt\n+x\n*** Update File: src/b.ts\n*** Delete File: c.md\n*** End Patch";
  assert.deepEqual(patchPaths(body), ["a.txt", "src/b.ts", "c.md"]);
});

test("streaming duplicates of one message count tokens once", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-"));
  const file = join(dir, "dup.jsonl");
  const row = (out: number) =>
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:00:00Z",
      message: { id: "m1", model: "m", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 10, output_tokens: out } },
    });
  writeFileSync(file, `${row(5)}\n${row(50)}\n`);
  const s = parseSession(file);
  assert.equal(s.usage.output, 50);
  assert.equal(s.usage.input, 10);
  assert.equal(s.assistantTurns, 1);
});
