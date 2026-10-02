// Renders real CLI output (ANSI colors) into docs/assets/demo.svg for the README.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cmd = ["dist/src/cli.js", "examples/sessions/demo-claude.jsonl"];
const raw = execFileSync(process.execPath, cmd, { cwd: root, env: { ...process.env, FORCE_COLOR: "1", NO_COLOR: "" }, encoding: "utf8" });

const palette = { 1: null, 2: "#7d8590", 31: "#ff7b72", 32: "#7ee787", 33: "#e3b341", 34: "#79c0ff", 36: "#56d4dd", 90: "#6e7681" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAX_ROWS = 40;
const lines = raw.replace(/\n$/, "").split("\n").slice(0, MAX_ROWS);
const charW = 8.4;
const lineH = 19;
let maxCols = 0;
const rows = lines.map((line) => {
  let fill = "#e6edf3";
  let bold = false;
  let cols = 0;
  let out = "";
  for (const part of line.split(/(\u001b\[\d+m)/)) {
    const m = /^\u001b\[(\d+)m$/.exec(part);
    if (m) {
      const code = Number(m[1]);
      if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) fill = "#e6edf3";
      else if (palette[code]) fill = palette[code];
    } else if (part) {
      cols += [...part].length;
      out += `<tspan fill="${fill}"${bold ? ' font-weight="700"' : ""}>${esc(part)}</tspan>`;
    }
  }
  maxCols = Math.max(maxCols, cols);
  return out;
});

const w = Math.ceil(maxCols * charW + 48);
const h = rows.length * lineH + 64;
const text = rows.map((r, i) => `<text x="24" y="${52 + i * lineH}" xml:space="preserve">${r}</text>`).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="sessionscope terminal output for a demo session">
<rect width="${w}" height="${h}" rx="10" fill="#0d1117"/>
<circle cx="22" cy="20" r="6" fill="#ff5f56"/><circle cx="42" cy="20" r="6" fill="#ffbd2e"/><circle cx="62" cy="20" r="6" fill="#27c93f"/>
<text x="84" y="25" fill="#7d8590" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12">npx sessionscope examples/sessions/demo-claude.jsonl</text>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace" font-size="14">
${text}
</g></svg>
`;
writeFileSync(new URL("../docs/assets/demo.svg", import.meta.url), svg);
console.log(`docs/assets/demo.svg  ${w}x${h}  ${(svg.length / 1024).toFixed(1)} KB`);
