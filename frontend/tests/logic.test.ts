import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApiError, userError } from "../src/lib/api/client.ts";
import {
  safeSource,
  statusLabels,
  strengthLabels,
  scoreLabel,
  scoreExplanation,
  validateGithub,
  validateName,
  validateNeed,
} from "../src/lib/presentation.ts";
test("database error gives safe actionable guidance", () => {
  assert.equal(
    userError(
      parseApiError(
        { error: { code: "DATABASE_ERROR", message: "internal" } },
        503,
      ),
    ),
    "Veritabanı bağlantısı hazır değil. Yerel demo servislerini kontrol edin.",
  );
});
test("backend envelope preserves safe message and retryability", () => {
  const e = parseApiError(
    {
      error: {
        code: "LLM_TIMEOUT",
        message: "Zaman aşımı.",
        retryable: true,
        details: {},
      },
    },
    504,
  );
  assert.equal(e.code, "LLM_TIMEOUT");
  assert.equal(e.message, "Zaman aşımı.");
  assert.equal(e.retryable, true);
});
test("non-envelope response never displays raw stack or HTML", () => {
  assert.equal(
    parseApiError("<html>secret stack</html>", 502).message,
    "Servis isteği tamamlayamadı (HTTP 502).",
  );
});
test("evidence labels distinguish claims and strength from proficiency", () => {
  assert.equal(statusLabels.declared_only, "Yalnızca beyan");
  assert.equal(statusLabels.not_found, "Kanıt bulunamadı");
  assert.equal(strengthLabels.strong, "Güçlü kanıt");
});
test("score means evidence alignment", () => {
  assert.equal(scoreLabel, "Kanıt Uyumu");
  assert.match(scoreExplanation, /proje kanıtlarının uyumunu/);
});
test("required fields reject whitespace", () => {
  assert.ok(validateName("  ", "Aday adı"));
  assert.ok(validateNeed(" "));
  assert.equal(validateNeed("Python gerekli"), undefined);
});
test("GitHub URL validation prevents unsafe origins and credentials", () => {
  for (const v of [
    "javascript:alert(1)",
    "https://github.com.evil.test/a/b",
    "https://token@github.com/a/b",
    "https://github.com/a/b/tree/main",
  ])
    assert.ok(validateGithub(v));
  assert.equal(
    validateGithub("https://github.com/cgdsgcgll/devora-zeminai"),
    undefined,
  );
  assert.equal(safeSource("javascript:alert(1)"), undefined);
});

test("evidence links reject unsafe schemes, ports and disguised hosts", () => {
  for (const url of [
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://github.com/a/b",
    "https://github.com:8443/a/b",
    "https://github.com.evil.test/a/b",
    "https://github.com@evil.test/a/b",
    "https://token@github.com/a/b",
    "https://127.0.0.1/a/b",
  ])
    assert.equal(safeSource(url), undefined);
  const source = "https://github.com/owner/repo/blob/abc123/app.py";
  assert.equal(safeSource(source), source);
});
