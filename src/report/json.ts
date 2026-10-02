import type { Report } from "../types.js";

export function renderJson(report: Report): string {
  const { session: s } = report;
  return JSON.stringify(
    {
      session: {
        source: s.source,
        id: s.id,
        cwd: s.cwd,
        branch: s.branch,
        models: s.models,
        start: s.start ? new Date(s.start).toISOString() : null,
        end: s.end ? new Date(s.end).toISOString() : null,
        prompts: s.prompts,
        assistantTurns: s.assistantTurns,
        toolCalls: s.calls.length,
        failedCalls: report.failedCalls,
        usage: s.usage,
        malformedLines: s.malformedLines,
      },
      toolCounts: report.toolCounts,
      findings: report.findings.map((f) => ({ ...f, callNumber: f.callIndex === undefined ? null : f.callIndex + 1 })),
      files: report.files,
    },
    null,
    2,
  );
}
