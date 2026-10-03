import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/lib/api/client.ts";
import { outputLabels, provenanceLabels } from "../src/lib/profile.ts";

test("read model client supports anonymous discovery, bounded team and gaps without fake entity IDs", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body?: string }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body as string | undefined });
    if (String(url).includes("living-profile"))
      return Response.json({ candidate_id: "candidate", timeline: [] });
    if (String(url).includes("discovery"))
      return Response.json({ need_id: "need", candidates: [] });
    if (String(url).includes("gaps"))
      return Response.json({ match_id: "match", items: [] });
    return Response.json({ need_id: "need", criteria: [] });
  };
  try {
    await api.livingProfile("candidate", "2026-01-01");
    await api.discovery("need");
    await api.team("need", ["one", "two"]);
    await api.gaps("match");
    assert.ok(calls[0].url.endsWith("?since=2026-01-01"));
    assert.ok(calls[1].url.includes("anonymous=true&offset=0&limit=20"));
    assert.deepEqual(JSON.parse(calls[2].body!), {
      candidate_ids: ["one", "two"],
      anonymous: true,
    });
    globalThis.fetch = async () => Response.json({ id: "irrelevant" });
    await assert.rejects(
      api.discovery("need"),
      (e: unknown) => e instanceof ApiError && e.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("portfolio outputs and repository observations retain distinct provenance language", () => {
  assert.equal(outputLabels.article, "Teknik makale");
  assert.notEqual(provenanceLabels.observed, provenanceLabels.verified);
  assert.notEqual(provenanceLabels.linked, provenanceLabels.verified);
  assert.equal(provenanceLabels.observed, "Gözlemlenen kullanım");
});
