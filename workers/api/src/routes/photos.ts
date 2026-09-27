import { Hono } from "hono";
import type { Env } from "../index";
import { serveR2Image } from "../r2-image";

export const photos = new Hono<{ Bindings: Env }>();

// Classroom ids are always numeric (see data/classrooms.json); validating
// keeps this consistent with occupancy.ts's own param check and avoids
// building an R2 key from unvalidated input.
const ID_RE = /^\d+$/;

photos.get("/:id", (c) => {
  const id = c.req.param("id");

  if (!ID_RE.test(id)) return c.json({ error: "id must be numeric" }, 400);

  return serveR2Image(c, c.env.DATA_BUCKET, `photos/${id}.jpg`);
});

// The small copy fetch_photos.py writes next to each photo (640px on its long
// side). Falls back to the full photo while a room has none yet.
photos.get("/:id/thumb", (c) => {
  const id = c.req.param("id");

  if (!ID_RE.test(id)) return c.json({ error: "id must be numeric" }, 400);

  return serveR2Image(c, c.env.DATA_BUCKET, `photos/${id}_thumb.jpg`, `photos/${id}.jpg`);
});
