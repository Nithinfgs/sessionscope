# Architecture

```
src/
  cli.ts                 argument parsing, session resolution, output selection
  types.ts               Session, ToolCall, Finding, Report
  parsers/
    common.ts            JSONL reader, shared helpers, tool categorisation
    claude.ts            Claude Code transcripts
    codex.ts             Codex CLI rollouts
    index.ts             format detection and session discovery
  analyzers/
    risky.ts             command and path rules
    secrets.ts           credential detectors and redaction
    loops.ts             retry loops, repeated reads, oversized results
    index.ts             runs all analyzers, builds file activity and counts
  report/
    terminal.ts          ANSI summary
    html.ts              self-contained HTML with SVG timeline
    json.ts              machine-readable output
```

## Data model

Every parser produces a `Session`: metadata (cwd(s), branch, models, tokens) plus an ordered list of `ToolCall`s. A call carries its normalised `category` (`shell`, `read`, `edit`, …), its shell `command` if any, the `paths` it touches, and the paired `result` (`text`, `isError`). Analyzers never see raw transcript JSON, so a new agent format only needs a parser.

## Format notes

**Claude Code**: one JSON object per line; `assistant` rows carry `tool_use` blocks, the following `user` rows carry `tool_result` blocks keyed by `tool_use_id`. Streaming writes the same `message.id` several times, so token usage is the per-message maximum, not the sum of rows.

**Codex CLI**: `session_meta`, `turn_context`, `response_item` (messages, `function_call`/`function_call_output`, `custom_tool_call` for `apply_patch`) and `event_msg` rows. Error status comes from `exit_code` metadata or an `Exit code:` line. Token totals come from the last `token_count` event.

## Adding a detection rule

1. Add a `Rule` to `RULES` in `src/analyzers/risky.ts` (id, severity, kind, title, regex).
2. Add a positive case and, importantly, a look-alike negative case to `test/risky.test.ts`.
3. Document it in `docs/RULES.md`.

## Adding a parser

1. Create `src/parsers/<agent>.ts` exporting `parse<Agent>(file): Session`.
2. Extend `detectSource` and `discoverSessions` in `src/parsers/index.ts`.
3. Add a small synthetic sample in `scripts/make-examples.mjs` and parser tests.

Never commit real transcripts; samples must be synthetic or fully scrubbed.
