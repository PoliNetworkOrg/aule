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

  // Safari-only trackpad pinch events (see components/campus-map.tsx).
  interface HTMLElementEventMap {
    gesturestart: Event & { clientX: number; clientY: number; scale: number };
    gesturechange: Event & { clientX: number; clientY: number; scale: number };
    gestureend: Event;
  }
}
