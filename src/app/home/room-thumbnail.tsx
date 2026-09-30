import { useState } from "react";
import { cn } from "../../lib/cn";
import { photoUrl, thumbnailUrl } from "../utils/photo";

/**
 * Decorative preview; the room name beside it already labels the card. Without
 * a photo (none on record, or both sizes failed to load) it shows a grey
 * PoliNetwork logo instead, so every card keeps the same shape.
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

  if (!idfoto || failedSource === "full")
    return (
      <span
        data-slot="thumbnail"
        className={cn(
          "grid flex-none place-items-center overflow-hidden bg-surface-muted",
          className,
        )}
        aria-hidden="true"
      >
        <img
          className="aspect-square h-1/2 opacity-30 grayscale dark:opacity-20"
          src="/brand/logo-80.png"
          srcSet="/brand/logo-80.png 1x, /brand/logo-160.png 2x, /brand/logo-240.png 3x"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </span>
    );

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
