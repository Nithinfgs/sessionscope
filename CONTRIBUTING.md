# Contributing

Thanks for helping. The most valuable contributions are **new transcript parsers** and **detection rules with tests**, especially false-positive fixes.

## Setup

```bash
git clone https://github.com/Nithinfgs/sessionscope && cd sessionscope
npm install
npm test           # tsc + node:test
npm run lint       # biome
npm run demo       # run on the bundled example
```

Node 20+ (macOS/Linux). There are no runtime dependencies and we'd like to keep it that way.

## Ground rules

- **Never commit a real transcript.** They contain code, paths and secrets. Use `scripts/make-examples.mjs` to build synthetic samples. Build secret-shaped test strings at runtime (see `test/secrets.test.ts`) so scanners don't trip on the repo.
- **Every rule needs a negative test.** A rule that fires on `git commit -m "mention rm -rf /"` is worse than no rule.
- Findings must never print a full secret.
- Keep claims honest. This is a heuristic reader of logs, not a security boundary.

## Pull requests

1. Open an issue first for new features or parsers.
2. Keep PRs focused; add tests; run `npm test && npm run lint`.
3. Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Reporting a parser problem

Open an issue with the agent and its version, plus a **scrubbed** sample of 5–10 lines (replace content with `x`, keep the JSON structure).
