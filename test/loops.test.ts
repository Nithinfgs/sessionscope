import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeLoops } from "../src/analyzers/loops.js";
import { session, sh } from "./helpers.js";

test("flags a failing command retried repeatedly", () => {
  const s = session([sh("npm test", true), sh("ls"), sh("npm test", true), sh("npm test", true)]);
  const f = analyzeLoops(s);
  assert.equal(f.length, 1);
  assert.equal(f[0]?.severity, "medium");
  assert.match(f[0]?.title ?? "", /Retried a failing call 3×/);
});

test("flags long failure streaks but not isolated failures", () => {
  const streak = session([sh("a", true), sh("b", true), sh("c", true), sh("d", true)]);
  assert.ok(analyzeLoops(streak).some((f) => /4 failed tool calls in a row/.test(f.title)));
  const isolated = session([sh("a", true), sh("b"), sh("c", true), sh("d"), sh("e", true)]);
  assert.equal(analyzeLoops(isolated).length, 0);
});

test("flags files read or edited many times", () => {
  const reads = Array.from({ length: 6 }, () => ({ name: "Read", category: "read" as const, paths: ["/work/app/a.ts"] }));
  assert.ok(analyzeLoops(session(reads)).some((f) => /Read one file 6×/.test(f.title)));
  const edits = Array.from({ length: 8 }, () => ({ name: "Edit", category: "edit" as const, paths: ["/work/app/a.ts"] }));
  assert.ok(analyzeLoops(session(edits)).some((f) => /Edited one file 8×/.test(f.title)));
});

test("notes very large tool results", () => {
  const f = analyzeLoops(session([sh("cat big.log", false, "x".repeat(40_000))]));
  assert.equal(f[0]?.severity, "info");
});

test("quiet sessions produce nothing", () => {
  assert.deepEqual(analyzeLoops(session([sh("ls"), sh("pwd"), sh("ls")])), []);
});
