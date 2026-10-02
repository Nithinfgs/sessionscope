# Security policy

## Scope

`sessionscope` reads local transcript files and writes local reports. It makes no network requests. Security-relevant issues include: unsafe file handling, secret values leaking into output (they should always be redacted), or HTML report injection from crafted transcripts.

## Reporting

Please use GitHub's [private vulnerability reporting](https://github.com/Nithinfgs/sessionscope/security/advisories/new) rather than a public issue.

**Do not attach real transcripts or credentials** to any report. If a transcript contains a secret, rotate it.

## Limits

sessionscope is a heuristic log reader. A clean report is not evidence that a session was safe.
