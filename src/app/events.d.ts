export {};

declare global {
  interface DocumentEventMap {
    campuschange: CustomEvent<{ id: string }>;
    campusmapshifted: CustomEvent<{ shifted: boolean }>;
    buildingchange: CustomEvent<{ campusId: string; buildingId: string | null }>;
    campussheetresize: CustomEvent<{ height: number }>;
    buildingpageopen: CustomEvent<void>;
    campusrecenter: CustomEvent<void>;
  }
}
