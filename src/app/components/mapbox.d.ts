// Contracts used by the existing Mapbox 3.9.1 CDN integration.
export type LngLat = [number, number];

export interface Coordinates {
  lat: number;
  long: number;
}

export interface CameraOptions {
  center?: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  duration?: number;
  essential?: boolean;
  around?: { lng: number; lat: number };
}

export interface MapboxControl {
  _container: HTMLElement;
}

export interface MapboxMap {
  getCanvas(): HTMLCanvasElement;
  getContainer(): HTMLElement;
  project(coordinates: LngLat): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
  getZoom(): number;
  getPitch(): number;
  getBearing(): number;
  getCenter(): { lng: number; lat: number };
  resize(): void;
  jumpTo(options: CameraOptions): void;
  easeTo(options: CameraOptions): void;
  flyTo(options: CameraOptions): void;
  panBy(offset: [number, number], options: { duration: number }): void;
  scrollZoom: { disable(): void };
  addControl(control: MapboxControl, position: string): void;
  on(event: string, listener: () => void): void;
  once(event: string, listener: () => void): void;
  setConfigProperty(importId: string, name: string, value: string): void;
  remove(): void;
}

export interface MapboxMarker {
  setLngLat(coordinates: LngLat): MapboxMarker;
  addTo(map: MapboxMap): MapboxMarker;
  remove(): void;
}

export interface MapboxLibrary {
  accessToken: string;
  Map: new (
    options: CameraOptions & {
      container: HTMLElement;
      style: string;
      minZoom: number;
      maxZoom: number;
      maxPitch: number;
      pitchWithRotate: boolean;
      touchPitch: boolean;
      logoPosition: string;
    },
  ) => MapboxMap;
  Marker: new (options: { element: HTMLElement; anchor: string }) => MapboxMarker;
  NavigationControl: new (options: { showZoom: boolean; showCompass: boolean }) => MapboxControl;
  GeolocateControl: new (options: {
    positionOptions: PositionOptions;
    trackUserLocation: boolean;
    showUserHeading: boolean;
  }) => MapboxControl;
}

declare global {
  interface Window {
    mapboxgl?: MapboxLibrary;
  }

  interface HTMLElementEventMap {
    gesturestart: Event & { clientX: number; clientY: number; scale: number };
    gesturechange: Event & { clientX: number; clientY: number; scale: number };
    gestureend: Event;
  }
}
