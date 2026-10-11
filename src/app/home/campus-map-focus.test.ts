import { describe, expect, it } from "vite-plus/test";
import type { Campus } from "../types";
import { focusedMapCampus } from "./campus-map-focus";

const leonardo: Campus = { id: "MIA01", name: "Leonardo", buildings: [] };

const mantova: Campus = { id: "MNG01", name: "Mantova", buildings: [] };

const lecco: Campus = { id: "LCF04", name: "Lecco", buildings: [] };

describe("map campus focus", () => {
  it("starts on the first selected campus, including distant selections", () => {
    expect(focusedMapCampus([leonardo, mantova], null)).toBe(leonardo);
  });

  it("switches to another selected campus and keeps it when the selection grows", () => {
    expect(focusedMapCampus([leonardo, mantova], mantova.id)).toBe(mantova);
    expect(focusedMapCampus([leonardo, lecco, mantova], mantova.id)).toBe(mantova);
  });

  it("falls back to the first remaining campus when the focused campus is removed", () => {
    expect(focusedMapCampus([leonardo, lecco], mantova.id)).toBe(leonardo);
  });

  it("focuses a building's campus even when another campus was in focus", () => {
    expect(focusedMapCampus([leonardo, mantova], leonardo.id, mantova.id)).toBe(mantova);
  });

  it("ignores a building from a campus that is no longer selected", () => {
    expect(focusedMapCampus([leonardo, lecco], lecco.id, mantova.id)).toBe(lecco);
  });

  it("keeps single-campus behavior and handles an empty directory", () => {
    expect(focusedMapCampus([leonardo], mantova.id)).toBe(leonardo);
    expect(focusedMapCampus([], mantova.id)).toBeNull();
  });
});
