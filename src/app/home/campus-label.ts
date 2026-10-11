import { t, tf } from "../i18n";
import { campuses, findCampus } from "../state/availability";
import { splitBuildingKey } from "../state/store";
import type { Campus } from "../types";

/**
 * How the campus selection reads: one campus by name (then its area and city),
 * a whole area such as Città Studi by the area's name, anything else as a list.
 */
export function campusSelectionLabel(campusIds: string[]) {
  const all = campuses();
  const selected = campusIds.flatMap((id) => all.find((campus) => campus.id === id) ?? []);
  const names = selected.map((campus) => campus.name);

  if (selected.length <= 1) {
    const campus = selected[0];

    return {
      title: campus?.name ?? "",
      subtitle: campus ? [campus.group, campus.city].filter(Boolean).join(" · ") : "",
    };
  }

  const group = wholeGroup(selected, all);

  if (group) return { title: group, subtitle: names.join(" · ") };

  return { title: names.join(", "), subtitle: tf("campus.count", { n: selected.length }) };
}

/** The area `selected` is exactly, when it's every campus of one area. */
function wholeGroup(selected: Campus[], all: Campus[]) {
  const group = selected[0]?.group;

  if (!group || selected.some((campus) => campus.group !== group)) return null;

  return all.filter((campus) => campus.group === group).length === selected.length ? group : null;
}

/** "Edificio 8", or "Edificio 8 · Lecco" when several campuses are listed together. */
export function buildingLabel(key: string, withCampus: boolean) {
  const { campusId, name } = splitBuildingKey(key);
  const campus = withCampus ? findCampus(campusId) : null;

  return `${t("building.prefix")} ${name}${campus ? ` · ${campus.name}` : ""}`;
}

/** An id for a building's elements: keys hold "/" (and names may hold anything). */
export function buildingDomId(key: string) {
  return `building-${key.replace(/[^a-z0-9]/gi, "-")}`;
}
