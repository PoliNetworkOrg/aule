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

  if (!idfoto || failedSource === "full") return null;

  const url = failedSource === "thumb" ? photoUrl(id) : thumbnailUrl(id);

  return (
    <span
      data-slot="thumbnail"
      className={cn("block flex-none overflow-hidden bg-surface-muted", className)}
      aria-hidden="true"
    >
      <img
        className="size-full object-cover"
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailure({ id, source: failedSource === "thumb" ? "full" : "thumb" })}
      />
    </span>
  );
}
