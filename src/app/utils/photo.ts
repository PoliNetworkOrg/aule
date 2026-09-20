import { getApiBase } from "../config.ts";

// classroom id (number) → resolved URL string
export const photoUrlCache = new Map<number, string>();

export async function fetchPhotoUrl(classroomId: number) {
  if (photoUrlCache.has(classroomId)) return photoUrlCache.get(classroomId)!;

  const url = `${getApiBase()}/v1/photos/${classroomId}`;
  photoUrlCache.set(classroomId, url);

  return url;
}
