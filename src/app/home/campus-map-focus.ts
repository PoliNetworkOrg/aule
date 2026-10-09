import type { Campus } from "../types";

/** A selected building takes priority; otherwise keep the chosen campus while selected. */
export function focusedMapCampus(
  campuses: Campus[],
  focusedId: string | null,
  buildingCampusId?: string,
) {
  return (
    campuses.find((campus) => campus.id === buildingCampusId) ??
    campuses.find((campus) => campus.id === focusedId) ??
    campuses[0] ??
    null
  );
}
