import { readFileSync } from "node:fs";
import type { Category, Session, Source } from "../types.js";

export function readJsonl(file: string): { rows: Record<string, unknown>[]; malformed: number } {
  const rows: Record<string, unknown>[] = [];
  let malformed = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const v: unknown = JSON.parse(line);
      if (v && typeof v === "object" && !Array.isArray(v)) rows.push(v as Record<string, unknown>);
      else malformed++;
    } catch {
      malformed++;
    }
  }
  return { rows, malformed };
}

export function emptySession(source: Source, file: string): Session {
  return {
    source,
    id: "",
    file,
    cwds: [],
    models: [],
    prompts: 0,
    assistantTurns: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    calls: [],
    texts: [],
    malformedLines: 0,
  };
}

export function parseTs(v: unknown): number | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : undefined;
}

export function widen(s: Session, ts: number | undefined): void {
  if (ts === undefined) return;
  if (s.start === undefined || ts < s.start) s.start = ts;
  if (s.end === undefined || ts > s.end) s.end = ts;
}

export function addCwd(s: Session, cwd: string | undefined, tally?: Map<string, number>): void {
  if (!cwd) return;
  if (!s.cwds.includes(cwd)) s.cwds.push(cwd);
  if (tally) tally.set(cwd, (tally.get(cwd) ?? 0) + 1);
}

export function dominantCwd(tally: Map<string, number>): string | undefined {
  let best: string | undefined;
  let n = 0;
  for (const [k, v] of tally) if (v > n) [best, n] = [k, v];
  return best;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Flatten tool-result content (string or block array) into plain text. */
export function flattenContent(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((b) => {
        const o = obj(b);
        if (typeof o.text === "string") return o.text;
        if (o.type === "image") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

const SHELL_TOOLS = new Set(["bash", "shell", "exec_command", "local_shell", "run_command", "powershell"]);

export function categorize(name: string): Category {
  const n = name.toLowerCase();
  if (SHELL_TOOLS.has(n)) return "shell";
  if (n.startsWith("mcp__")) return "mcp";
  if (n === "read" || n === "view") return "read";
  if (n === "write") return "write";
  if (["edit", "multiedit", "notebookedit", "apply_patch", "str_replace_editor"].includes(n)) return "edit";
  if (["grep", "glob", "ls", "search", "find"].includes(n)) return "search";
  if (["webfetch", "websearch"].includes(n)) return "web";
  if (["task", "agent", "skill"].includes(n)) return "agent";
  return "other";
}
