import { basename } from "node:path";
import type { Session, ToolCall } from "../types.js";
import { addCwd, categorize, dominantCwd, emptySession, flattenContent, num, obj, parseTs, readJsonl, str, widen } from "./common.js";

const NON_PROMPT_PREFIXES = ["<environment_context>", "# AGENTS.md", "<user_instructions>", "<turn_aborted>"];

function parseArgs(v: unknown): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      return obj(JSON.parse(v));
    } catch {
      return { raw: v };
    }
  }
  return obj(v);
}

function commandOf(args: Record<string, unknown>): string | undefined {
  const c = args.command ?? args.cmd;
  if (typeof c === "string") return c;
  if (Array.isArray(c) && c.length > 0) {
    const parts = c.map(String);
    const flag = parts.findIndex((p) => p === "-lc" || p === "-c");
    return flag >= 0 && flag < parts.length - 1 ? parts.slice(flag + 1).join(" ") : parts.join(" ");
  }
  return undefined;
}

/** Extract touched files from an apply_patch body. */
export function patchPaths(patch: string): string[] {
  const out: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) if (m[1]) out.push(m[1].trim());
  return out;
}

function outputInfo(raw: unknown): { text: string; isError: boolean } {
  let text = flattenContent(raw);
  let isError = false;
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = obj(JSON.parse(trimmed));
      if (typeof j.output === "string") text = j.output;
      const code = obj(j.metadata).exit_code;
      if (typeof code === "number" && code !== 0) isError = true;
    } catch {
      /* keep raw text */
    }
  }
  const m = /Exit code:\s*(-?\d+)/.exec(text);
  if (m && Number(m[1]) !== 0) isError = true;
  return { text, isError };
}

export function parseCodex(file: string): Session {
  const { rows, malformed } = readJsonl(file);
  const s = emptySession("codex", file);
  s.id = basename(file, ".jsonl").replace(/^rollout-/, "");
  s.malformedLines = malformed;
  const byId = new Map<string, ToolCall>();
  const models = new Set<string>();
  const cwdTally = new Map<string, number>();

  for (const row of rows) {
    const ts = parseTs(row.timestamp);
    widen(s, ts);
    const type = str(row.type);
    const p = obj(row.payload);

    if (type === "session_meta") {
      s.id = str(p.id) ?? s.id;
      addCwd(s, str(p.cwd), cwdTally);
      s.branch ??= str(obj(p.git).branch);
    } else if (type === "turn_context") {
      const m = str(p.model);
      if (m) models.add(m);
      addCwd(s, str(p.cwd), cwdTally);
    } else if (type === "event_msg" && p.type === "token_count") {
      const t = obj(obj(p.info).total_token_usage);
      if (Object.keys(t).length > 0) {
        const cached = num(t.cached_input_tokens);
        s.usage = {
          input: Math.max(0, num(t.input_tokens) - cached),
          output: num(t.output_tokens),
          cacheRead: cached,
          cacheCreate: 0,
        };
      }
    } else if (type === "response_item") {
      const pt = str(p.type);
      if (pt === "message") {
        const role = str(p.role);
        const text = flattenContent(p.content);
        if (role === "assistant") {
          s.assistantTurns++;
          if (text) s.texts.push({ role: "assistant", text, ts });
        } else if (role === "user" && text && !NON_PROMPT_PREFIXES.some((x) => text.startsWith(x))) {
          s.prompts++;
          s.texts.push({ role: "user", text, ts });
        }
      } else if (pt === "function_call" || pt === "custom_tool_call" || pt === "local_shell_call") {
        const name = str(p.name) ?? (pt === "local_shell_call" ? "local_shell" : "unknown");
        const id = str(p.call_id) ?? str(p.id) ?? `call-${s.calls.length}`;
        let input = pt === "local_shell_call" ? obj(p.action) : parseArgs(p.arguments ?? p.input);
        let category = categorize(name);
        let command = category === "shell" ? commandOf(input) : undefined;
        let paths: string[] = [];
        if (name === "apply_patch") {
          const body = str(p.input) ?? str(input.input) ?? str(input.raw) ?? "";
          paths = patchPaths(body);
          input = { patch: body };
          category = "edit";
        } else if (category === "shell" && !command) {
          command = commandOf(input);
        }
        const call: ToolCall = { index: s.calls.length, id, name, category, input, ts, command, paths, sidechain: false };
        s.calls.push(call);
        byId.set(id, call);
      } else if (pt === "function_call_output" || pt === "custom_tool_call_output") {
        const call = byId.get(str(p.call_id) ?? "");
        if (call) call.result = outputInfo(p.output);
      }
    }
  }
  s.cwd = dominantCwd(cwdTally);
  s.models = [...models];
  return s;
}
