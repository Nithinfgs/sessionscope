export type Severity = "high" | "medium" | "low" | "info";

export type Category = "shell" | "read" | "write" | "edit" | "search" | "web" | "agent" | "mcp" | "other";

export interface ToolResult {
  text: string;
  isError: boolean;
}

export interface ToolCall {
  /** Position in the session, starting at 0. */
  index: number;
  id: string;
  name: string;
  category: Category;
  input: Record<string, unknown>;
  ts?: number;
  /** Shell command line for shell-like tools. */
  command?: string;
  /** File paths the call reads or modifies. */
  paths: string[];
  result?: ToolResult;
  /** True when the call was made by a sub-agent. */
  sidechain: boolean;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export interface TextEntry {
  role: "user" | "assistant";
  text: string;
  ts?: number;
}

export type Source = "claude" | "codex";

export interface Session {
  source: Source;
  id: string;
  file: string;
  cwd?: string;
  /** Every working directory seen during the session. */
  cwds: string[];
  branch?: string;
  models: string[];
  start?: number;
  end?: number;
  prompts: number;
  assistantTurns: number;
  usage: Usage;
  calls: ToolCall[];
  texts: TextEntry[];
  malformedLines: number;
}

export type FindingKind = "risk" | "secret" | "loop" | "waste" | "scope" | "outward";

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  title: string;
  detail: string;
  /** Index of the tool call that triggered the finding. */
  callIndex?: number;
  count?: number;
}

export interface FileActivity {
  path: string;
  reads: number;
  edits: number;
  writes: number;
  outsideCwd: boolean;
}

export interface Report {
  session: Session;
  findings: Finding[];
  files: FileActivity[];
  toolCounts: Record<string, number>;
  failedCalls: number;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};
