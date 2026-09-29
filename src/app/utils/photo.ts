import { getApiBase } from "../config.ts";

// classroom id (number) → resolved URL string
export const photoUrlCache = new Map<number, string>();

export function photoUrl(classroomId: number) {
  return `${getApiBase()}/v1/photos/${classroomId}`;
}

export async function fetchPhotoUrl(classroomId: number) {
  if (photoUrlCache.has(classroomId)) return photoUrlCache.get(classroomId)!;

  const url = photoUrl(classroomId);
  photoUrlCache.set(classroomId, url);

  return url;
}

export function thumbnailUrl(classroomId: number) {
  return `${getApiBase()}/v1/photos/${classroomId}/thumb`;
}
