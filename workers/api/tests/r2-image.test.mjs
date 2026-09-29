import assert from "node:assert/strict";
import { test } from "node:test";
import { serveR2Image } from "../src/r2-image.ts";

const image = {
  httpEtag: '"abc"',
  uploaded: new Date("2026-01-01T00:00:00Z"),
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
};

function context() {
  const raw = new Request("https://api.example/v1/photos/1/thumb");

  return {
    req: { url: raw.url, raw },
    json: (body, status) => Response.json(body, { status }),
    executionCtx: { waitUntil: () => {} },
  };
}

function bucket(objects) {
  const requests = [];

  return {
    requests,
    get: async (key) => {
      requests.push(key);

      return objects[key] ?? null;
    },
  };
}

function resetCache() {
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
}

test("serves a thumbnail with the long cache lifetime", async () => {
  resetCache();
  const r2 = bucket({ "photos/1_thumb.jpg": image });
  const response = await serveR2Image(context(), r2, "photos/1_thumb.jpg", "photos/1.jpg");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=2592000, immutable");
  assert.deepEqual(r2.requests, ["photos/1_thumb.jpg"]);
});

test("falls back to the original with a short cache lifetime", async () => {
  resetCache();
  const r2 = bucket({ "photos/1.jpg": image });
  const response = await serveR2Image(context(), r2, "photos/1_thumb.jpg", "photos/1.jpg");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
  assert.deepEqual(r2.requests, ["photos/1_thumb.jpg", "photos/1.jpg"]);
});

test("returns 404 when neither photo exists", async () => {
  resetCache();
  const r2 = bucket({});
  const response = await serveR2Image(context(), r2, "photos/1_thumb.jpg", "photos/1.jpg");

  assert.equal(response.status, 404);
  assert.deepEqual(r2.requests, ["photos/1_thumb.jpg", "photos/1.jpg"]);
});
