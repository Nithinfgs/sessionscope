import type { Finding, Session, ToolCall } from "../types.js";
import { shorten } from "./risky.js";

const BIG_RESULT_CHARS = 30_000;

function normalize(cmd: string): string {
  return cmd.replace(/\s+/g, " ").trim();
}

function fingerprint(c: ToolCall): string | undefined {
  if (c.command) return `${c.name}:${normalize(c.command)}`;
  if (c.category === "search" || c.category === "web" || c.category === "mcp") return `${c.name}:${JSON.stringify(c.input)}`;
  return undefined;
}

export function analyzeLoops(session: Session): Finding[] {
  const out: Finding[] = [];

  // Same command run repeatedly.
  const groups = new Map<string, ToolCall[]>();
  for (const c of session.calls) {
    const fp = fingerprint(c);
    if (!fp) continue;
    const list = groups.get(fp) ?? [];
    list.push(c);
    groups.set(fp, list);
  }
  for (const list of groups.values()) {
    const first = list[0];
    if (!first || list.length < 3) continue;
    const failures = list.filter((c) => c.result?.isError).length;
    const label = first.command ?? `${first.name} ${shorten(JSON.stringify(first.input), 80)}`;
    if (failures >= 3) {
      out.push({
        kind: "loop",
        severity: "medium",
        title: `Retried a failing call ${list.length}×`,
        detail: `${shorten(label)} (${failures} failed)`,
        callIndex: first.index,
        count: list.length,
      });
    } else if (list.length >= 4) {
      out.push({
        kind: "loop",
        severity: "low",
        title: `Repeated the same call ${list.length}×`,
        detail: shorten(label),
        callIndex: first.index,
        count: list.length,
      });
    }
  }

  // Unbroken streak of failed calls.
  let streak: ToolCall[] = [];
  const flush = () => {
    const first = streak[0];
    if (first && streak.length >= 4) {
      out.push({
        kind: "loop",
        severity: "medium",
        title: `${streak.length} failed tool calls in a row`,
        detail: `starting at call #${first.index + 1}: ${shorten(first.command ?? first.name, 100)}`,
        callIndex: first.index,
        count: streak.length,
      });
    }
    streak = [];
  };
  for (const c of session.calls) {
    if (!c.result) continue;
    if (c.result.isError) streak.push(c);
    else flush();
  }
  flush();

  // Files re-read or re-edited many times.
  const reads = new Map<string, ToolCall[]>();
  const edits = new Map<string, ToolCall[]>();
  for (const c of session.calls) {
    const target = c.category === "read" ? reads : c.category === "edit" || c.category === "write" ? edits : undefined;
    if (!target) continue;
    for (const p of c.paths) target.set(p, [...(target.get(p) ?? []), c]);
  }
  for (const [p, list] of reads) {
    const first = list[0];
    if (first && list.length >= 6)
      out.push({
        kind: "waste",
        severity: "low",
        title: `Read one file ${list.length}×`,
        detail: p,
        callIndex: first.index,
        count: list.length,
      });
  }
  for (const [p, list] of edits) {
    const first = list[0];
    if (first && list.length >= 8)
      out.push({
        kind: "waste",
        severity: "low",
        title: `Edited one file ${list.length}×`,
        detail: p,
        callIndex: first.index,
        count: list.length,
      });
  }

  // Tool results large enough to crowd out context.
  const big = session.calls.filter((c) => (c.result?.text.length ?? 0) >= BIG_RESULT_CHARS);
  if (big.length > 0) {
    const worst = big.reduce((a, b) => ((a.result?.text.length ?? 0) >= (b.result?.text.length ?? 0) ? a : b));
    out.push({
      kind: "waste",
      severity: "info",
      title: `${big.length} very large tool result${big.length > 1 ? "s" : ""}`,
      detail: `largest: ${Math.round((worst.result?.text.length ?? 0) / 1000)}k chars from ${shorten(worst.command ?? worst.name, 80)}`,
      callIndex: worst.index,
      count: big.length,
    });
  }
  return out;
}
