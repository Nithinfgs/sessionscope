import { basename } from "node:path";
import type { Category, Report, Severity } from "../types.js";
import { fmtDuration, fmtNum } from "./style.js";
import { countBySeverity, shortPath } from "./terminal.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CAT_VAR: Record<Category, string> = {
  shell: "--c-shell",
  read: "--c-read",
  write: "--c-write",
  edit: "--c-write",
  search: "--c-search",
  web: "--c-web",
  agent: "--c-agent",
  mcp: "--c-agent",
  other: "--c-other",
};

function timeline(report: Report): string {
  const calls = report.session.calls;
  if (calls.length === 0) return "";
  const w = Math.max(900, Math.min(1600, calls.length * 6));
  const step = w / calls.length;
  const flagged = new Map<number, Severity>();
  const rank: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };
  for (const f of report.findings) {
    if (f.callIndex === undefined || f.severity === "info") continue;
    const cur = flagged.get(f.callIndex);
    if (!cur || rank[f.severity] > rank[cur]) flagged.set(f.callIndex, f.severity);
  }
  const bars = calls
    .map((c, i) => {
      const x = (i * step).toFixed(1);
      const err = c.result?.isError ? ` stroke="var(--high)" stroke-width="1.5"` : "";
      const label = esc(`#${i + 1} ${c.name}${c.command ? `: ${c.command.slice(0, 80)}` : c.paths[0] ? `: ${c.paths[0]}` : ""}`);
      return `<rect x="${x}" y="22" width="${Math.max(1.5, step - 0.8).toFixed(1)}" height="30" rx="1" fill="var(${CAT_VAR[c.category]})"${err}><title>${label}</title></rect>`;
    })
    .join("");
  const marks = [...flagged.entries()]
    .map(
      ([i, sev]) =>
        `<path d="M${(i * step + step / 2).toFixed(1)} 4 l4 8 h-8 z" fill="var(--${sev})"><title>call #${i + 1}: ${sev} finding</title></path>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${w} 58" width="100%" height="70" role="img" aria-label="Timeline of tool calls">${marks}${bars}</svg>`;
}

export function renderHtml(report: Report): string {
  const { session: s, findings } = report;
  const counts = countBySeverity(findings);
  const u = s.usage;
  const maxTool = Math.max(1, ...Object.values(report.toolCounts));
  const project = s.cwd ? basename(s.cwd) : "session";

  const findingRows = findings
    .map(
      (f) =>
        `<tr><td><span class="pill ${f.severity}">${f.severity}</span></td><td><strong>${esc(f.title)}</strong>${f.count && f.count > 1 && f.kind !== "loop" && f.kind !== "waste" ? ` <span class="muted">×${f.count}</span>` : ""}<div class="detail">${esc(f.detail)}</div></td><td class="muted num">${f.callIndex === undefined ? "–" : `#${f.callIndex + 1}`}</td></tr>`,
    )
    .join("");

  const toolRows = Object.entries(report.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, n]) =>
        `<div class="tool"><span>${esc(cat)}</span><div class="track"><i style="width:${((n / maxTool) * 100).toFixed(0)}%;background:var(${CAT_VAR[cat as Category] ?? "--c-other"})"></i></div><b>${n}</b></div>`,
    )
    .join("");

  const changed = report.files.filter((f) => f.edits + f.writes > 0);
  const fileRows = changed
    .map(
      (f) =>
        `<tr><td class="mono">${esc(shortPath(f.path, s.cwd))}${f.outsideCwd ? ' <span class="pill medium">outside project</span>' : ""}</td><td class="num muted">${f.edits + f.writes}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>sessionscope · ${esc(project)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e4df;--high:#c62828;--medium:#b26a00;--low:#1565c0;--info:#757575;
--c-shell:#3b6ea8;--c-read:#3aa5b3;--c-write:#2e8b57;--c-search:#b9a46c;--c-web:#8e6bbf;--c-agent:#c0577b;--c-other:#999}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1d1d1b;--fg:#ececE8;--muted:#9a9a93;--line:#2e2e2b;--high:#ef6b63;--medium:#e0a040;--low:#6aaaf0;--info:#9a9a9a;
--c-shell:#5b8fc9;--c-read:#4fb3bf;--c-write:#4fb07a;--c-search:#c9b57a;--c-web:#a98ad6;--c-agent:#d9779a;--c-other:#777}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px}h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.sub{color:var(--muted);font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}
.pill{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;padding:1px 7px;border-radius:99px;color:#fff}.pill.high{background:var(--high)}.pill.medium{background:var(--medium)}.pill.low{background:var(--low)}.pill.info{background:var(--info)}
.detail,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--muted);word-break:break-all}.mono{color:var(--fg)}.muted{color:var(--muted)}.num{text-align:right;white-space:nowrap}
.tool{display:grid;grid-template-columns:70px 1fr 40px;gap:10px;align-items:center;padding:3px 0}.track{height:10px;background:var(--line);border-radius:5px;overflow:hidden}.track i{display:block;height:100%}.tool b{text-align:right;font-weight:600}
.tl{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.legend{font-size:12px;color:var(--muted);margin-top:4px}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 4px 0 10px}
footer{margin-top:36px;color:var(--muted);font-size:12px}
</style></head><body><main>
<h1>${esc(project)}</h1>
<div class="sub">${esc(s.source)} · ${esc(s.branch ?? "no branch")} · session ${esc(s.id.slice(0, 8))}${s.models.length ? ` · ${esc(s.models.join(", "))}` : ""}</div>
<div class="grid">
<div class="card"><b>${esc(fmtDuration(s.start, s.end))}</b><span>duration</span></div>
<div class="card"><b>${s.calls.length}</b><span>tool calls (${report.failedCalls} failed)</span></div>
<div class="card"><b>${s.prompts}</b><span>prompts</span></div>
<div class="card"><b>${fmtNum(u.output)}</b><span>output tokens · ${fmtNum(u.input + u.cacheCreate)} fresh in · ${fmtNum(u.cacheRead)} cached</span></div>
<div class="card"><b>${counts.high} / ${counts.medium} / ${counts.low}</b><span>high / medium / low</span></div>
</div>
<h2>Timeline</h2>
<div class="tl">${timeline(report)}<div class="legend">${(["shell", "read", "edit", "search", "web", "agent"] as Category[]).map((c) => `<i style="background:var(${CAT_VAR[c]})"></i>${c === "edit" ? "write/edit" : c}`).join("")}<i style="background:none;border:1.5px solid var(--high)"></i>failed</div></div>
<h2>Findings (${findings.length})</h2>
${findings.length ? `<table>${findingRows}</table>` : `<div class="card">Nothing risky, leaked or looping detected.</div>`}
<h2>Tool calls</h2><div class="card">${toolRows}</div>
<h2>Files changed (${changed.length})</h2>
${changed.length ? `<table>${fileRows}</table>` : `<div class="card muted">No files were modified.</div>`}
<footer>Generated locally by sessionscope. Secrets are redacted; nothing left your machine.</footer>
</main></body></html>
`;
}
