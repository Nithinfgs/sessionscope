import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Session, Source } from "../types.js";
import { parseClaude } from "./claude.js";
import { parseCodex } from "./codex.js";
import { readJsonl } from "./common.js";

export interface SessionFile {
  source: Source;
  file: string;
  project: string;
  mtime: number;
  size: number;
}

export function detectSource(file: string): Source {
  const { rows } = readJsonl(file);
  for (const r of rows.slice(0, 20)) {
    if (r.type === "session_meta" || r.type === "turn_context" || r.type === "response_item" || r.type === "event_msg") return "codex";
    if (r.type === "user" || r.type === "assistant") return "claude";
  }
  throw new Error(`Unrecognised transcript format: ${file}. Expected Claude Code or Codex JSONL.`);
}

export function parseSession(file: string, source?: Source): Session {
  const src = source ?? detectSource(file);
  return src === "codex" ? parseCodex(file) : parseClaude(file);
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function claudeRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

function codexRoot(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
}

function walk(dir: string, out: string[]): void {
  for (const name of safeReaddir(dir)) {
    const p = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".jsonl")) out.push(p);
  }
}

/** Find transcripts written by Claude Code and Codex CLI on this machine, newest first. */
export function discoverSessions(): SessionFile[] {
  const found: SessionFile[] = [];
  const add = (source: Source, file: string, project: string) => {
    try {
      const st = statSync(file);
      found.push({ source, file, project, mtime: st.mtimeMs, size: st.size });
    } catch {
      /* file vanished */
    }
  };
  const croot = claudeRoot();
  for (const proj of safeReaddir(croot)) {
    for (const f of safeReaddir(join(croot, proj))) {
      if (f.endsWith(".jsonl")) add("claude", join(croot, proj, f), proj);
    }
  }
  const files: string[] = [];
  walk(codexRoot(), files);
  for (const f of files) if (/rollout-.*\.jsonl$/.test(f)) add("codex", f, "codex");
  return found.sort((a, b) => b.mtime - a.mtime);
}
