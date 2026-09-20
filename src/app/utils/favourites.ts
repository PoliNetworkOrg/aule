// Client-only "favourite classrooms" store, backed by localStorage.
// Value is a JSON array of numeric classroom ids (classroom.id from
// data/classrooms.json). No backend.

const KEY = "poliAule_favourites";

// Returns the favourite classroom ids as a deduped array of numbers.
// Any parse/storage failure yields an empty list rather than throwing.
export function getFavouriteIds() {
  try {
    const raw = localStorage.getItem(KEY);

    if (!raw) return [];
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return [...new Set(parsed.map(Number).filter((n) => Number.isFinite(n)))];
  } catch {
    return [];
  }
}

export function isFavourite(id: string | number) {
  return getFavouriteIds().includes(Number(id));
}

function write(ids: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage full or unavailable — favourites just won't persist */
  }

  window.dispatchEvent(new CustomEvent("favourites-changed"));
}

// Adds or removes the id. Returns the new favourited state (boolean).
export function toggleFavourite(id: string | number) {
  const num = Number(id);
  const ids = getFavouriteIds();
  const idx = ids.indexOf(num);

  if (idx === -1) {
    ids.push(num);
    write(ids);

    return true;
  }

  ids.splice(idx, 1);
  write(ids);

  return false;
}
