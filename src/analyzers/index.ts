import { type FileActivity, type Finding, type Report, SEVERITY_ORDER, type Session } from "../types.js";
import { analyzeLoops } from "./loops.js";
import { analyzeRisks, isOutside } from "./risky.js";
import { analyzeSecrets } from "./secrets.js";

function fileActivity(session: Session): FileActivity[] {
  const map = new Map<string, FileActivity>();
  for (const c of session.calls) {
    if (c.category !== "read" && c.category !== "write" && c.category !== "edit") continue;
    for (const path of c.paths) {
      const a = map.get(path) ?? { path, reads: 0, edits: 0, writes: 0, outsideCwd: isOutside(path, session.cwds) };
      if (c.category === "read") a.reads++;
      else if (c.category === "edit") a.edits++;
      else a.writes++;
      map.set(path, a);
    }
  }
  return [...map.values()].sort((a, b) => b.edits + b.writes - (a.edits + a.writes) || b.reads - a.reads);
}

export function analyze(session: Session): Report {
  const findings: Finding[] = [...analyzeRisks(session), ...analyzeSecrets(session), ...analyzeLoops(session)];
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.callIndex ?? 1e9) - (b.callIndex ?? 1e9));
  const toolCounts: Record<string, number> = {};
  let failedCalls = 0;
  for (const c of session.calls) {
    toolCounts[c.category] = (toolCounts[c.category] ?? 0) + 1;
    if (c.result?.isError) failedCalls++;
  }
  return { session, findings, files: fileActivity(session), toolCounts, failedCalls };
}
