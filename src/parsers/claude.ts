import { basename } from "node:path";
import type { Session, ToolCall, Usage } from "../types.js";
import { addCwd, categorize, dominantCwd, emptySession, flattenContent, num, obj, parseTs, readJsonl, str, widen } from "./common.js";

const NON_PROMPT_PREFIXES = ["<system-reminder>", "<command-", "<local-command", "Caveat:", "<task-notification"];

function pathsOf(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ["file_path", "notebook_path", "path"]) {
    const v = str(input[k]);
    if (v) out.push(v);
  }
  return out;
}

export function parseClaude(file: string): Session {
  const { rows, malformed } = readJsonl(file);
  const s = emptySession("claude", file);
  s.id = basename(file, ".jsonl");
  s.malformedLines = malformed;
  const byId = new Map<string, ToolCall>();
  const usageByMessage = new Map<string, Usage>();
  const models = new Set<string>();
  const cwdTally = new Map<string, number>();

  for (const row of rows) {
    const type = str(row.type);
    if (type !== "user" && type !== "assistant") continue;
    const ts = parseTs(row.timestamp);
    widen(s, ts);
    addCwd(s, str(row.cwd), cwdTally);
    s.branch ??= str(row.gitBranch);
    const sessionId = str(row.sessionId);
    if (sessionId) s.id = sessionId;
    const sidechain = row.isSidechain === true;
    const msg = obj(row.message);
    const content = msg.content;

    if (type === "assistant") {
      const mid = str(msg.id) ?? str(row.uuid) ?? `row-${s.calls.length}`;
      const model = str(msg.model);
      if (model && model !== "<synthetic>") models.add(model);
      const u = obj(msg.usage);
      const prev = usageByMessage.get(mid) ?? { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      usageByMessage.set(mid, {
        input: Math.max(prev.input, num(u.input_tokens)),
        output: Math.max(prev.output, num(u.output_tokens)),
        cacheRead: Math.max(prev.cacheRead, num(u.cache_read_input_tokens)),
        cacheCreate: Math.max(prev.cacheCreate, num(u.cache_creation_input_tokens)),
      });
      if (Array.isArray(content)) {
        for (const b of content) {
          const block = obj(b);
          if (block.type === "tool_use") {
            const id = str(block.id) ?? `call-${s.calls.length}`;
            if (byId.has(id)) continue;
            const name = str(block.name) ?? "unknown";
            const input = obj(block.input);
            const call: ToolCall = {
              index: s.calls.length,
              id,
              name,
              category: categorize(name),
              input,
              ts,
              paths: pathsOf(input),
              sidechain,
            };
            if (call.category === "shell") call.command = str(input.command);
            if (call.category === "search" || call.category === "mcp") call.paths = [];
            s.calls.push(call);
            byId.set(id, call);
          } else if (block.type === "text" && typeof block.text === "string") {
            s.texts.push({ role: "assistant", text: block.text, ts });
          }
        }
      }
    } else {
      let hasPrompt = false;
      const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
      for (const b of blocks) {
        const block = obj(b);
        if (block.type === "tool_result") {
          const call = byId.get(str(block.tool_use_id) ?? "");
          if (call) call.result = { text: flattenContent(block.content), isError: block.is_error === true };
        } else if (block.type === "text" && typeof block.text === "string") {
          const text = block.text;
          if (NON_PROMPT_PREFIXES.some((p) => text.startsWith(p))) continue;
          s.texts.push({ role: "user", text, ts });
          hasPrompt = true;
        }
      }
      if (hasPrompt && !sidechain && row.isMeta !== true) s.prompts++;
    }
  }

  s.assistantTurns = usageByMessage.size;
  for (const u of usageByMessage.values()) {
    s.usage.input += u.input;
    s.usage.output += u.output;
    s.usage.cacheRead += u.cacheRead;
    s.usage.cacheCreate += u.cacheCreate;
  }
  s.cwd = dominantCwd(cwdTally);
  s.models = [...models];
  return s;
}
