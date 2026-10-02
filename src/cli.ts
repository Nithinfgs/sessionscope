#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "./analyzers/index.js";
import { discoverSessions, parseSession, type SessionFile } from "./parsers/index.js";
import { renderHtml } from "./report/html.js";
import { renderJson } from "./report/json.js";
import { makeStyle } from "./report/style.js";
import { renderTerminal } from "./report/terminal.js";
import { SEVERITY_ORDER, type Severity } from "./types.js";

const HELP = `sessionscope: post-flight audit for AI coding-agent sessions

Usage
  sessionscope [session] [options]     audit a session (default: your latest one)
  sessionscope list [-n 15]            list sessions found on this machine

<session> can be a path to a .jsonl transcript, "latest", or a session id prefix.
Claude Code (~/.claude/projects) and Codex CLI (~/.codex/sessions) are detected automatically.

Options
  --html               write a self-contained HTML report (sessionscope-report.html)
  --out <file>         HTML report path (implies --html)
  --open               write the HTML report and open it in your browser
  --json               print the full report as JSON
  --fail-on <level>    exit 1 if any finding is at or above high|medium|low (for CI)
  --no-color           disable colors
  -n <count>           number of sessions for "list" (default 15)
  -v, --version        print version
  -h, --help           show this help
`;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function fail(msg: string): never {
  process.stderr.write(`sessionscope: ${msg}\n`);
  process.exit(2);
}

function resolveTarget(target: string | undefined): string {
  if (target && target !== "latest") {
    if (existsSync(target)) return resolve(target);
    const match = discoverSessions().find((s) => basename(s.file).startsWith(target) || basename(s.file).includes(target));
    if (match) return match.file;
    fail(`no transcript found for "${target}". Pass a .jsonl path, a session id prefix, or run "sessionscope list".`);
  }
  const latest = discoverSessions()[0];
  if (!latest) fail("no Claude Code or Codex sessions found. Pass a transcript path explicitly.");
  return latest.file;
}

function listSessions(count: number, color: boolean): void {
  const st = makeStyle(color);
  const all: SessionFile[] = discoverSessions().slice(0, count);
  if (all.length === 0) fail("no sessions found.");
  for (const f of all) {
    const when = new Date(f.mtime).toISOString().slice(0, 16).replace("T", " ");
    const proj = f.source === "claude" ? f.project.replace(/^-/, "").split("-").slice(-2).join("-") : "codex";
    process.stdout.write(
      `${st.gray(when)}  ${f.source.padEnd(6)} ${st.bold(basename(f.file, ".jsonl").slice(0, 8))}  ${proj}  ${st.gray(`${Math.round(f.size / 1024)} KB`)}\n`,
    );
  }
}

function openFile(file: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", file] : [file];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function main(): void {
  const options = {
    html: { type: "boolean" },
    out: { type: "string" },
    open: { type: "boolean" },
    json: { type: "boolean" },
    "fail-on": { type: "string" },
    "no-color": { type: "boolean" },
    n: { type: "string", short: "n" },
    version: { type: "boolean", short: "v" },
    help: { type: "boolean", short: "h" },
  } as const;
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options,
    });
  } catch (e) {
    fail(`${(e as Error).message}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return;
  }

  const color = !values["no-color"] && !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));

  if (positionals[0] === "list") {
    const n = Number(values.n ?? 15);
    listSessions(Number.isFinite(n) && n > 0 ? n : 15, color);
    return;
  }

  const failOn = values["fail-on"] as Severity | undefined;
  if (failOn && !["high", "medium", "low"].includes(failOn)) fail(`--fail-on must be high, medium or low (got "${failOn}")`);

  const file = resolveTarget(positionals[0]);
  let report: ReturnType<typeof analyze>;
  try {
    report = analyze(parseSession(file));
  } catch (e) {
    fail((e as Error).message);
  }

  const wantHtml = values.html || values.open || values.out !== undefined;
  if (values.json) {
    process.stdout.write(`${renderJson(report)}\n`);
  } else {
    process.stdout.write(`${renderTerminal(report, { color, width: process.stdout.columns ?? 100 })}\n`);
  }
  if (wantHtml) {
    const out = resolve(values.out ?? "sessionscope-report.html");
    writeFileSync(out, renderHtml(report));
    process.stderr.write(`\nHTML report: ${out}\n`);
    if (values.open) openFile(out);
  }
  if (report.session.malformedLines > 0) process.stderr.write(`note: skipped ${report.session.malformedLines} unreadable line(s)\n`);

  if (failOn) {
    const limit = SEVERITY_ORDER[failOn];
    if (report.findings.some((f) => SEVERITY_ORDER[f.severity] <= limit)) process.exit(1);
  }
}

main();
