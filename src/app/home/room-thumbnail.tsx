import { useState } from "react";
import { cn } from "../../lib/cn";
import { photoUrl, thumbnailUrl } from "../utils/photo";

/**
 * Decorative preview; the room name beside it already labels the card. Renders
 * nothing without a photo, so parents lay out around it with `has-data-[slot=thumbnail]`.
 */
export function RoomThumbnail({
  id,
  idfoto,
  className,
}: {
  id: number;
  idfoto?: number | null;
  className?: string;
}) {
  const [failure, setFailure] = useState<{ id: number; source: "thumb" | "full" } | null>(null);
  const failedSource = failure?.id === id ? failure.source : null;
  // The URL that finished loading: fades the image in, and a new URL (another
  // room, or the full-size fallback) starts hidden again.
  const [loaded, setLoaded] = useState<string | null>(null);

  if (!idfoto || failedSource === "full") return null;

  const url = failedSource === "thumb" ? photoUrl(id) : thumbnailUrl(id);

  return (
    <span
      data-slot="thumbnail"
      className={cn("block flex-none overflow-hidden bg-surface-muted", className)}
      aria-hidden="true"
    >
      {/* Fades in over the muted placeholder once loaded, like the room page photo. */}
      <img
        className={cn(
          "size-full object-cover opacity-0 transition-opacity duration-250 ease-in-out",
          loaded === url && "opacity-100",
        )}
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
