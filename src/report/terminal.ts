import { basename } from "node:path";
import { type Finding, type Report, SEVERITY_ORDER, type Severity } from "../types.js";
import { fmtDuration, fmtNum, makeStyle, type Style } from "./style.js";

export interface TerminalOptions {
  color: boolean;
  /** Max findings listed per severity before collapsing. */
  maxPerSeverity?: number;
  width?: number;
}

const ICON: Record<Severity, string> = { high: "●", medium: "●", low: "○", info: "·" };
const LABEL: Record<Severity, string> = { high: "HIGH", medium: "MED ", low: "LOW ", info: "INFO" };

function sevColor(st: Style, sev: Severity): (s: string) => string {
  return sev === "high" ? st.red : sev === "medium" ? st.yellow : sev === "low" ? st.blue : st.gray;
}

function bar(st: Style, n: number, max: number, width = 18): string {
  const filled = max === 0 ? 0 : Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width));
  return st.cyan("█".repeat(filled)) + st.gray("░".repeat(width - filled));
}

function clipLeft(s: string, n: number): string {
  return s.length > n ? `…${s.slice(s.length - n + 1)}` : s;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

export function renderTerminal(report: Report, opts: TerminalOptions): string {
  const st = makeStyle(opts.color);
  const { session: s, findings } = report;
  const max = opts.maxPerSeverity ?? 6;
  const width = opts.width ?? 100;
  const lines: string[] = [];
  const push = (l = "") => lines.push(l);

  const project = s.cwd ? basename(s.cwd) : "unknown project";
  push(
    `${st.bold("sessionscope")} ${st.gray("·")} ${st.bold(project)} ${st.gray(`· ${s.source} · ${s.branch ?? "no branch"} · ${s.id.slice(0, 8)}`)}`,
  );
  push(st.gray("─".repeat(Math.min(width, 78))));

  const u = s.usage;
  push(
    `${st.bold(fmtDuration(s.start, s.end))} · ${s.prompts} prompt${s.prompts === 1 ? "" : "s"} · ${s.calls.length} tool calls` +
      ` · ${report.failedCalls} failed`,
  );
  push(st.gray(`tokens: ${fmtNum(u.output)} out · ${fmtNum(u.input + u.cacheCreate)} fresh in · ${fmtNum(u.cacheRead)} cache reads`));
  if (s.models.length) push(st.gray(`models: ${s.models.join(", ")}`));
  push();

  const counts = countBySeverity(findings);
  const verdict = (["high", "medium", "low"] as Severity[]).map((sev) => sevColor(st, sev)(`${counts[sev]} ${sev}`)).join(st.gray(" · "));
  push(`${st.bold("Findings")}  ${verdict}${counts.info ? st.gray(` · ${counts.info} notes`) : ""}`);
  push();

  if (findings.length === 0) push(`  ${st.green("✓")} nothing risky, leaked or looping detected`);
  for (const sev of ["high", "medium", "low", "info"] as Severity[]) {
    const group = findings.filter((f) => f.severity === sev);
    for (const f of group.slice(0, max)) {
      const color = sevColor(st, sev);
      const at = f.callIndex === undefined ? "" : st.gray(` #${f.callIndex + 1}`);
      const times = f.count && f.count > 1 && f.kind !== "loop" && f.kind !== "waste" ? st.gray(` ×${f.count}`) : "";
      push(`  ${color(ICON[sev])} ${color(LABEL[sev])} ${st.bold(f.title)}${times}${at}`);
      push(`       ${st.gray(clip(f.detail, width - 8))}`);
    }
    if (group.length > max) push(`       ${st.gray(`+ ${group.length - max} more ${sev} (use --html or --json for all)`)}`);
  }
  push();

  push(st.bold("Tool calls"));
  const entries = Object.entries(report.toolCounts).sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[1] ?? 0;
  for (const [cat, n] of entries) push(`  ${cat.padEnd(7)} ${bar(st, n, top)} ${n}`);
  push();

  const changed = report.files.filter((f) => f.edits + f.writes > 0);
  push(`${st.bold("Files changed")} ${st.gray(`(${changed.length})`)}`);
  for (const f of changed.slice(0, 8)) {
    const where = f.outsideCwd ? st.yellow(" outside project") : "";
    push(
      `  ${clipLeft(shortPath(f.path, s.cwd), 60).padEnd(60)} ${st.gray(`${f.edits + f.writes} write${f.edits + f.writes === 1 ? "" : "s"}`)}${where}`,
    );
  }
  if (changed.length > 8) push(`  ${st.gray(`+ ${changed.length - 8} more`)}`);
  if (changed.length === 0) push(`  ${st.gray("none")}`);
  return lines.join("\n");
}

export function shortPath(p: string, cwd: string | undefined): string {
  if (cwd && p.startsWith(`${cwd}/`)) return p.slice(cwd.length + 1);
  return p;
}

export { SEVERITY_ORDER };
