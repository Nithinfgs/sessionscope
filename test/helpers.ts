import type { Session, ToolCall } from "../src/types.js";

export function session(calls: Partial<ToolCall>[], cwd = "/work/app"): Session {
  return {
    source: "claude",
    id: "test",
    file: "test.jsonl",
    cwd,
    cwds: [cwd],
    models: [],
    prompts: 1,
    assistantTurns: 1,
    usage: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    texts: [],
    malformedLines: 0,
    calls: calls.map((c, i) => ({
      index: i,
      id: `c${i}`,
      name: c.command ? "Bash" : "Read",
      category: c.command ? "shell" : "read",
      input: {},
      paths: [],
      sidechain: false,
      ...c,
    })),
  };
}

export const sh = (command: string, isError = false, text = ""): Partial<ToolCall> => ({
  command,
  result: { text, isError },
});
