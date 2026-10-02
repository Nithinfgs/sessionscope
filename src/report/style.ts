export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  blue(s: string): string;
  green(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
}

const wrap = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;
const plain = (s: string) => s;

export function makeStyle(color: boolean): Style {
  if (!color) return { bold: plain, dim: plain, red: plain, yellow: plain, blue: plain, green: plain, cyan: plain, gray: plain };
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    green: wrap(32, 39),
    cyan: wrap(36, 39),
    gray: wrap(90, 39),
  };
}

export function fmtDuration(ms: number | undefined, end?: number): string {
  const d = end === undefined ? ms : ms === undefined ? undefined : end - ms;
  if (d === undefined || d < 0) return "unknown";
  const s = Math.round(d / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
