# Detection rules

Rules live in [`src/analyzers/`](../src/analyzers). Each is a heuristic over what the transcript shows: the command line the agent ran, the paths it touched, and the text that came back.

## Severity

| Level | Meaning |
|---|---|
| **high** | Hard to undo, or exposes credentials. Look at it before trusting the session. |
| **medium** | Risky or surprising; usually fine in context, worth a glance. |
| **low** | Hygiene and efficiency. |
| **info** | Outward-facing actions (push, publish, deploy). Not a problem, just a record. |

## Command rules (`risky.ts`)

Heredoc bodies, `-m "..."` commit messages and `echo "..."` strings are stripped before matching, so a commit message that mentions `rm -rf /` is not flagged.

| Rule | Sev | Matches |
|---|---|---|
| Pipes a download into a shell | high | `curl`/`wget … \| sh/bash/zsh` |
| Force-pushes | high | `git push --force`, `-f` (`--force-with-lease` is low) |
| Destructive SQL | high | `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE` |
| Raw disk writes | high | `dd of=/dev/…`, `mkfs` |
| Infra destroy | high | `terraform destroy`, `apply -auto-approve`, `kubectl delete ns/-f`, `gh repo delete`, `docker system prune` |
| Reads a private key | high | `cat`/`cp`/… of `~/.ssh/id_*`, `*.pem` |
| Reads credentials file | medium | `.env*`, `.aws/credentials`, `.npmrc`, `.netrc`, kube config |
| Dumps environment | medium | `printenv`, bare `env`, `export -p` |
| Discards work | medium | `git reset --hard`, `git clean -f`, `git restore .` |
| Skips hooks | medium | `--no-verify` |
| Broad permissions | medium | `chmod 777`, `a+rwx` |
| sudo | medium | `sudo …` |
| Uploads local data | medium | `curl -T`, `-d @file` |
| Shell rc edits | medium | writes to `.zshrc`, `.bashrc`, … |
| Persistence | medium | `crontab`, `launchctl load`, `systemctl enable` |
| Recursive delete | high / medium / low | high: `/`, `~`, `$HOME`, `.`, `..`, `*`, single-segment absolute paths. Medium: absolute or `..` path outside the project. Low: other. Ignored: `node_modules`, `dist`, `build`, `.next`, `__pycache__`, `/tmp`, … |
| Outward actions | info | `git push`, `npm/cargo publish`, `gh pr/issue/release`, deploy commands |

## Path rules

For `Read`, `Write`, `Edit`, and `apply_patch`:

- Modifying `~/.ssh`, `~/.aws`, shell rc files, or `.git/hooks` is **high**.
- Modifying `.env`, `.npmrc`, or `.github/workflows` is **medium**; reading `.env`, `.ssh`, `.aws`, `.npmrc` is **medium**.
- Writing outside every working directory seen in the session is **low**. Temp dirs and `~/.claude` / `~/.codex` are exempt.

Sessions that `cd` between projects are handled: a path is "outside" only if it is outside all directories the session worked in.

## Secret detectors (`secrets.ts`)

AWS access key IDs, GitHub tokens (`ghp_`, `github_pat_`, …), Anthropic and OpenAI keys, Slack tokens, Stripe live keys, Google API keys, npm tokens, PEM private key headers (high); JWTs, passwords in URLs, and `password=`-style assignments with a 12+ character literal (medium).

- Scanned: commands, tool inputs, tool outputs, and your prompts.
- Obvious placeholders (`example`, `your-…`, `${VAR}`, `<token>`, `xxxx`) are skipped.
- Identical secrets are de-duplicated and counted.
- Output never contains the full value, only a short prefix and the length.

## Loop and waste rules (`loops.ts`)

| Rule | Threshold |
|---|---|
| Failing call retried | same command ≥3 times with ≥3 failures (medium) |
| Repeated call | same command/search ≥4 times (low) |
| Failure streak | ≥4 failed calls in a row (medium) |
| File re-read | ≥6 reads (low) |
| File re-edited | ≥8 edits/writes (low) |
| Very large result | ≥30,000 characters (info) |

## Limitations

- **Static and textual.** If the agent writes a script and runs it, only the script's name is visible, not what it does.
- **Obfuscation defeats it.** `r""m -rf`, base64-decoded commands, variable-built paths.
- **False positives happen.** `sudo` inside a container, a `.env` that only holds `PORT=3000`, force-push to your own scratch branch.
- **Parsers target current formats.** Claude Code and Codex CLI transcript formats are undocumented and change. If a session fails to parse, open an issue with a redacted sample.
- **Codex support is newer** and less battle-tested than Claude Code support.
