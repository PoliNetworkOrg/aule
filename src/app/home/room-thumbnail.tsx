import { useState } from "react";
import { photoUrl, thumbnailUrl } from "../utils/photo";

/** Decorative preview; the room name beside it already labels the card. */
export function RoomThumbnail({ id, idfoto }: { id: number; idfoto?: number | null }) {
  const [failure, setFailure] = useState<{ id: number; source: "thumb" | "full" } | null>(null);
  const failedSource = failure?.id === id ? failure.source : null;

  if (!idfoto || failedSource === "full") return null;

  const url = failedSource === "thumb" ? photoUrl(id) : thumbnailUrl(id);

  return (
    <span className="room-thumbnail" aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailure({ id, source: failedSource === "thumb" ? "full" : "thumb" })}
      />
    </span>
  );
}
