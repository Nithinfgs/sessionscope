import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSecrets, redact, scanText } from "../src/analyzers/secrets.js";
import { session, sh } from "./helpers.js";

// Assembled at runtime so no secret-shaped literal lives in the repo.
const aws = `AKIA${"Q7M2XK9TLZ4WB3NV"}`;
const gh = `ghp_${"a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"}`;
const anthropic = `sk-ant-${"api03-" + "x9Y8z7W6v5U4t3S2r1Q0"}`;

test("detects common credential formats", () => {
  const text = `key=${aws} token ${gh} ${anthropic}\n-----BEGIN OPENSSH PRIVATE KEY-----`;
  const names = scanText(text).map((h) => h.name);
  assert.ok(names.includes("AWS access key ID"));
  assert.ok(names.includes("GitHub token"));
  assert.ok(names.includes("Anthropic API key"));
  assert.ok(names.includes("Private key block"));
});

test("detects secrets in URLs and assignments, ignoring placeholders", () => {
  const pw = `hunter${"22xyz"}`;
  assert.ok(scanText(`postgres://admin:${pw}@db.example.com/app`).some((h) => h.name === "Credentials in URL"));
  assert.ok(scanText(`password = "${"Zx9" + "kLm2Qw8Rt4"}"`).some((h) => h.name === "Hard-coded secret assignment"));
  assert.equal(scanText('api_key = "your-api-key-goes-here"').length, 0);
  assert.equal(scanText("AWS_KEY=AKIAIOSFODNN7EXAMPLE").length, 0);
  assert.equal(scanText(`password = "$${"{"}DB_PASSWORD}"`).length, 0);
});

test("findings never contain the full secret and are de-duplicated", () => {
  const s = session([sh("cat .env", false, `A=${aws}`), sh("cat .env", false, `A=${aws}`), sh(`echo ${gh}`)]);
  const findings = analyzeSecrets(s);
  assert.equal(findings.length, 2);
  assert.equal(findings.find((f) => f.title.startsWith("AWS"))?.count, 2);
  for (const f of findings) {
    assert.ok(!f.detail.includes(aws) && !f.detail.includes(gh), f.detail);
  }
});

test("redact keeps a short prefix and the length", () => {
  assert.equal(redact("abcdefghijklmnopqrst"), "abcd…[20 chars]");
  assert.equal(redact("abc"), "…[3 chars]");
});
