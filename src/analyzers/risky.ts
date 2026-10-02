import { homedir, tmpdir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";
import type { Finding, Session, Severity, ToolCall } from "../types.js";

interface Rule {
  id: string;
  severity: Severity;
  kind: Finding["kind"];
  title: string;
  test: RegExp;
}

const RULES: Rule[] = [
  {
    id: "pipe-to-shell",
    severity: "high",
    kind: "risk",
    title: "Pipes a download into a shell",
    test: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
  },
  {
    id: "force-push",
    severity: "high",
    kind: "risk",
    title: "Force-pushes to a remote",
    test: /\bgit\s+push\b[^\n;&|]*(--force(?!-with-lease)|\s-f\b)/,
  },
  {
    id: "force-with-lease",
    severity: "low",
    kind: "risk",
    title: "Force-pushes with lease",
    test: /\bgit\s+push\b[^\n;&|]*--force-with-lease/,
  },
  {
    id: "sql-destructive",
    severity: "high",
    kind: "risk",
    title: "Runs destructive SQL",
    test: /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i,
  },
  {
    id: "raw-disk",
    severity: "high",
    kind: "risk",
    title: "Writes to a raw disk device",
    test: /\b(dd\b[^\n]*\bof=\/dev\/|mkfs(\.\w+)?\s|>\s*\/dev\/(sd|nvme|disk))/,
  },
  {
    id: "infra-destroy",
    severity: "high",
    kind: "risk",
    title: "Destroys or force-applies infrastructure",
    test: /\b(terraform\s+(destroy|apply\b[^\n]*-auto-approve)|kubectl\s+delete\s+(ns|namespace|-f)|gh\s+repo\s+delete|aws\s+s3\s+rb|docker\s+system\s+prune)\b/,
  },
  {
    id: "ssh-key-read",
    severity: "high",
    kind: "risk",
    title: "Reads a private key",
    test: /\b(cat|less|head|tail|cp|scp|base64)\b[^\n|;&]*(\.ssh\/id_[a-z0-9]+|\.pem\b|\.p12\b)/,
  },
  {
    id: "credential-file",
    severity: "medium",
    kind: "risk",
    title: "Reads a credentials file",
    test: /\b(cat|less|head|tail|grep|cp|source|base64)\b[^\n|;&]*(\.env(\.[\w-]+)?\b|\.aws\/credentials|\.npmrc|\.netrc|\.pgpass|\.docker\/config\.json|\.kube\/config)/,
  },
  {
    id: "env-dump",
    severity: "medium",
    kind: "risk",
    title: "Dumps environment variables",
    test: /(^|[;&|]\s*)(printenv|env|export\s+-p)\s*($|[;&|])/m,
  },
  {
    id: "git-reset-hard",
    severity: "medium",
    kind: "risk",
    title: "Discards uncommitted work",
    test: /\bgit\s+(reset\s+--hard|checkout\s+--\s+\.|restore\s+\.|clean\s+-[a-z]*f)/,
  },
  { id: "no-verify", severity: "medium", kind: "risk", title: "Skips git hooks", test: /\bgit\s+(commit|push)\b[^\n;&|]*--no-verify/ },
  {
    id: "chmod-open",
    severity: "medium",
    kind: "risk",
    title: "Opens file permissions broadly",
    test: /\bchmod\s+(-R\s+)?(0?777|a\+rwx)\b/,
  },
  { id: "sudo", severity: "medium", kind: "risk", title: "Runs a command with sudo", test: /(^|[;&|]\s*)sudo\s/m },
  {
    id: "upload-local",
    severity: "medium",
    kind: "risk",
    title: "Uploads local data over the network",
    test: /\bcurl\b[^\n|;&]*(\s-T\s|--upload-file|(-d|--data(-binary|-raw)?)\s+@)/,
  },
  {
    id: "shell-rc",
    severity: "medium",
    kind: "risk",
    title: "Modifies shell startup files",
    test: /(>>?|\btee\b|\bsed\s+-i)[^\n]*~?\/?\.(zshrc|bashrc|bash_profile|zprofile|profile)\b/,
  },
  {
    id: "persistence",
    severity: "medium",
    kind: "risk",
    title: "Installs a scheduled or login task",
    test: /\b(crontab\s+(-[a-z]*\s+)?[^-\s]|launchctl\s+(load|bootstrap)|systemctl\s+(--user\s+)?enable)\b/,
  },
  {
    id: "global-install",
    severity: "low",
    kind: "risk",
    title: "Installs packages globally",
    test: /\b(npm\s+(i|install)\s+(-g|--global)|pip3?\s+install\b[^\n]*--break-system-packages|brew\s+install)\b/,
  },
  { id: "git-push", severity: "info", kind: "outward", title: "Pushes to a remote", test: /\bgit\s+push\b/ },
  {
    id: "publish",
    severity: "info",
    kind: "outward",
    title: "Publishes a package",
    test: /\b(npm|pnpm|yarn)\s+publish\b|\btwine\s+upload\b|\bcargo\s+publish\b/,
  },
  {
    id: "gh-write",
    severity: "info",
    kind: "outward",
    title: "Changes something on GitHub",
    test: /\bgh\s+(pr\s+(create|merge|close|comment)|issue\s+(create|close|comment)|release\s+create|repo\s+create)\b/,
  },
  {
    id: "deploy",
    severity: "info",
    kind: "outward",
    title: "Deploys",
    test: /\b(vercel\s+(deploy|--prod)|fly\s+deploy|netlify\s+deploy|kubectl\s+apply|helm\s+(install|upgrade)|terraform\s+apply)\b/,
  },
];

const SENSITIVE_PATHS: { re: RegExp; label: string }[] = [
  { re: /(^|\/)\.ssh\//, label: "SSH directory" },
  { re: /(^|\/)\.aws\//, label: "AWS credentials directory" },
  { re: /(^|\/)\.(zshrc|bashrc|bash_profile|zprofile|profile)$/, label: "shell startup file" },
  { re: /(^|\/)\.git\/hooks\//, label: "git hooks" },
  { re: /(^|\/)\.github\/workflows\//, label: "CI workflow" },
  { re: /(^|\/)\.env(\.[\w-]+)?$/, label: ".env file" },
  { re: /(^|\/)\.npmrc$/, label: ".npmrc" },
];

const SAFE_RM_TARGETS =
  /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.turbo|\.cache|__pycache__|\.pytest_cache|\.venv|venv|target|coverage|tmp|\.tmp)\/?$/;

/** Drop heredoc bodies and commit-message text so prose is not mistaken for commands. */
export function stripNoise(cmd: string): string {
  return cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, "<<heredoc")
    .replace(/(\s-m\s+)("(?:[^"\\]|\\.)*"|'[^']*')/g, "$1''")
    .replace(/\becho\s+("(?:[^"\\]|\\.)*"|'[^']*')/g, "echo ''");
}

function expandHome(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : p === "~" ? homedir() : p.replace(/^\$HOME\b/, homedir());
}

export function isOutside(path: string, cwds: string[]): boolean {
  const base = cwds[0];
  if (!base) return false;
  const abs = isAbsolute(expandHome(path)) ? resolve(expandHome(path)) : resolve(base, path);
  const inside = (root: string) => abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep);
  if (cwds.some((c) => inside(resolve(c)))) return false;
  const tmps = [tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"];
  if (tmps.some((t) => inside(resolve(t)))) return false;
  if (inside(resolve(homedir(), ".claude")) || inside(resolve(homedir(), ".codex"))) return false;
  return true;
}

function rmFindings(cmd: string, call: ToolCall, cwds: string[]): Finding[] {
  const out: Finding[] = [];
  for (const m of cmd.matchAll(/\brm\s+((?:-[a-zA-Z-]+\s+)+)([^;&|\n]+)/g)) {
    const flags = m[1] ?? "";
    if (!/r/i.test(flags.replace(/--[a-z-]+/g, ""))) continue;
    for (const raw of (m[2] ?? "").trim().split(/\s+/)) {
      const t = raw.replace(/^["']|["']$/g, "");
      if (!t || t.startsWith("-")) continue;
      if (SAFE_RM_TARGETS.test(t)) continue;
      const expanded = expandHome(t);
      if (isAbsolute(expanded) && /^\/(private\/)?(tmp|var\/folders)\//.test(expanded)) continue;
      const catastrophic =
        /^(\/|~|\$HOME|\.|\.\.|\*|\/\*|~\/\*|\.\/\*)\/?$/.test(t) ||
        (isAbsolute(expanded) && expanded.split("/").filter(Boolean).length <= 1);
      if (catastrophic) {
        out.push({
          kind: "risk",
          severity: "high",
          title: "Recursive delete of a top-level path",
          detail: `rm ${flags.trim()} ${t}`,
          callIndex: call.index,
        });
      } else if (isOutside(t, cwds) && (isAbsolute(expanded) || t.startsWith(".."))) {
        out.push({
          kind: "risk",
          severity: "medium",
          title: "Recursive delete outside the project",
          detail: `rm ${flags.trim()} ${t}`,
          callIndex: call.index,
        });
      } else {
        out.push({ kind: "risk", severity: "low", title: "Recursive delete", detail: `rm ${flags.trim()} ${t}`, callIndex: call.index });
      }
    }
  }
  return out;
}

export function analyzeRisks(session: Session): Finding[] {
  const findings: Finding[] = [];
  for (const call of session.calls) {
    if (call.command) {
      const cmd = stripNoise(call.command);
      for (const rule of RULES) {
        if (rule.test.test(cmd)) {
          findings.push({
            kind: rule.kind,
            severity: rule.severity,
            title: rule.title,
            detail: shorten(call.command),
            callIndex: call.index,
          });
        }
      }
      findings.push(...rmFindings(cmd, call, session.cwds));
    }
    if (call.category === "write" || call.category === "edit" || call.category === "read") {
      for (const p of call.paths) {
        const sens = SENSITIVE_PATHS.find((s) => s.re.test(p));
        const modifies = call.category !== "read";
        if (sens && (modifies || /ssh|aws|\.env|npmrc/.test(sens.label.toLowerCase()))) {
          findings.push({
            kind: "risk",
            severity: modifies && /SSH|AWS|startup|hooks/.test(sens.label) ? "high" : "medium",
            title: `${modifies ? "Modifies" : "Reads"} ${sens.label}`,
            detail: p,
            callIndex: call.index,
          });
        } else if (modifies && isOutside(p, session.cwds)) {
          findings.push({
            kind: "scope",
            severity: "low",
            title: "Writes outside the project directory",
            detail: p,
            callIndex: call.index,
          });
        }
      }
    }
  }
  return findings;
}

export function shorten(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
