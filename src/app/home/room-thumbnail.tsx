import { useEffect, useState } from "react";
import { fetchPhotoUrl, photoUrlCache } from "../utils/photo";

/** Decorative preview; the room name beside it already labels the card. */
export function RoomThumbnail({ id, idfoto }: { id: number; idfoto?: number | null }) {
  const [url, setUrl] = useState(() => photoUrlCache.get(id) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!idfoto) return;
    let active = true;

    void fetchPhotoUrl(id).then((value) => {
      if (active) setUrl(value);
    });

    return () => {
      active = false;
    };
  }, [id, idfoto]);

  if (!idfoto || failed) return null;

  return (
    <span className="room-thumbnail" aria-hidden="true">
      {url && (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
