import { useState } from "react";
import { photoUrl, thumbnailUrl } from "../utils/photo";

/** Decorative preview; the room name beside it already labels the card. */
export function RoomThumbnail({ id, idfoto }: { id: number; idfoto?: number | null }) {
  const [failure, setFailure] = useState<{ id: number; source: "thumb" | "full" } | null>(null);
  const failedSource = failure?.id === id ? failure.source : null;
  // The URL that finished loading: fades the image in, and a new URL (another
  // room, or the full-size fallback) starts hidden again.
  const [loaded, setLoaded] = useState<string | null>(null);

  if (!idfoto || failedSource === "full") return null;

  const url = failedSource === "thumb" ? photoUrl(id) : thumbnailUrl(id);

  return (
    <span
      className={`room-thumbnail${loaded === url ? " room-thumbnail--ready" : ""}`}
      aria-hidden="true"
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(url)}
        onError={() => setFailure({ id, source: failedSource === "thumb" ? "full" : "thumb" })}
      />
    </span>
  );
}
