import { createHash } from "node:crypto";
import type { Finding, Session } from "../types.js";

interface Detector {
  name: string;
  re: RegExp;
  severity: "high" | "medium";
}

const DETECTORS: Detector[] = [
  { name: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "high" },
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g, severity: "high" },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, severity: "high" },
  { name: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g, severity: "high" },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, severity: "high" },
  { name: "Stripe live key", re: /\b[rs]k_live_[A-Za-z0-9]{16,}\b/g, severity: "high" },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high" },
  { name: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/g, severity: "high" },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, severity: "high" },
  { name: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, severity: "medium" },
  { name: "Credentials in URL", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]{2,}:([^\s:/@]{4,})@[^\s/]+/gi, severity: "medium" },
  {
    name: "Hard-coded secret assignment",
    re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["']([^\s"']{12,})["']/gi,
    severity: "medium",
  },
];

const PLACEHOLDER = /(example|placeholder|your[_-]|xxxx|\*{4}|<[^>]+>|changeme|dummy|\$\{|process\.env|os\.environ|redacted)/i;

/** Show enough to recognise a secret without reproducing it. */
export function redact(secret: string): string {
  if (secret.startsWith("-----BEGIN")) return secret;
  const keep = Math.min(4, Math.floor(secret.length / 5));
  return `${secret.slice(0, keep)}…[${secret.length} chars]`;
}

export function scanText(text: string): { name: string; severity: "high" | "medium"; match: string }[] {
  const hits: { name: string; severity: "high" | "medium"; match: string }[] = [];
  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    for (const m of text.matchAll(d.re)) {
      const value = m[1] ?? m[0];
      if (PLACEHOLDER.test(value) && d.name !== "Private key block") continue;
      hits.push({ name: d.name, severity: d.severity, match: value });
    }
  }
  return hits;
}

/**
 * Secrets that reach the transcript were also sent to the model provider, so
 * any hit in a tool result, command or prompt is worth knowing about.
 */
export function analyzeSecrets(session: Session): Finding[] {
  const seen = new Map<string, Finding>();
  const record = (text: string, where: string, callIndex: number | undefined) => {
    for (const hit of scanText(text)) {
      const key = `${hit.name}:${createHash("sha256").update(hit.match).digest("hex").slice(0, 12)}`;
      const existing = seen.get(key);
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
        continue;
      }
      seen.set(key, {
        kind: "secret",
        severity: hit.severity,
        title: `${hit.name} in transcript`,
        detail: `${redact(hit.match)} · ${where}`,
        callIndex,
        count: 1,
      });
    }
  };
  for (const call of session.calls) {
    if (call.command) record(call.command, "command", call.index);
    else record(JSON.stringify(call.input), `${call.name} input`, call.index);
    if (call.result) record(call.result.text, `output of ${call.name}`, call.index);
  }
  for (const t of session.texts) if (t.role === "user") record(t.text, "your prompt", undefined);
  return [...seen.values()];
}
