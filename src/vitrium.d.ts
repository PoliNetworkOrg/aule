// Vitrium ships plain JavaScript without declarations. Only the surface this
// app uses is declared.
declare module "vitrium" {
  export interface PillSelection {
    animate?: boolean;
    silent?: boolean;
  }

  export interface Geometry {
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius?: string;
  }

  export interface MorphOptions {
    fromRadius?: string;
    toRadius?: string;
    onSettle?: () => void;
  }

  export function snapGeometry(el: HTMLElement, rect: Geometry, borderRadius?: string): void;
  export function morphGeometry(
    el: HTMLElement,
    from: Geometry,
    to: Geometry,
    options?: MorphOptions,
  ): () => void;
  export function hideInnerBoxInstantly(el: HTMLElement): void;
  export function unhideInnerBox(el: HTMLElement): void;

  export function attachLiquidGlass(
    el: HTMLElement,
    options?: { from?: string; exclude?: string },
  ): () => void;
  export function initLiquidGlass(): (() => void) | undefined;

  export interface PillDragCore {
    cells: HTMLElement[];
    index: number;
    indexOf(el: HTMLElement): number;
    select(index: number, options?: PillSelection): void;
    refresh(options?: { snap?: boolean }): void;
    destroy(): void;
  }
  export function createPillDragCore(options: {
    root: HTMLElement;
    items: HTMLElement;
    pill: HTMLElement;
    hit: HTMLElement;
    activeRow: HTMLElement;
    cellSelector: string;
    activeCellClass?: string;
    liftedClass?: string;
    tapScale?: number;
    trail?: { follow: number; give: number; giveCross: number };
    canSelect?: (index: number) => boolean;
    onReject?: () => void;
    onRender?: (state: { pos: number }) => void;
    onChange?: (index: number, info: { silent: boolean }) => void;
  }): PillDragCore;

  export interface MorphPopup {
    panel: HTMLElement;
    inner: HTMLElement;
    toggle(): void;
    close(): void;
    destroy(): void;
  }
  export function createMorphPopup(options: {
    trigger: HTMLElement;
    role?: string;
    label?: string;
    width?: number;
  }): MorphPopup;

  export function getBlurMode(): string;
  export function setBlurMode(mode: string): void;
  export function resolveBlurCapability(): boolean;
  export function applyBlurState(capable: boolean): void;
  export function scheduleIdleBenchmark(): (() => void) | undefined;
  export function reevaluateBlurCapability(): Promise<void>;

  export interface Toggle {
    el: HTMLElement;
    on: boolean;
    set(value: boolean, options?: { animate?: boolean }): void;
    refresh(options?: { snap?: boolean }): void;
    destroy(): void;
  }
  export function createToggle(options: {
    value?: boolean;
    onChange?: (value: boolean) => void;
    label?: string;
  }): Toggle;

  export interface SegmentedControl {
    value: string | undefined;
    select(value: string, options?: { animate?: boolean; silent?: boolean }): void;
    refresh(options?: { snap?: boolean }): void;
    destroy(): void;
  }
  export function createSegmentedControl(
    root: HTMLElement,
    options: {
      value?: string;
      onSelect?: (value: string, info: { silent: boolean }) => void;
    },
  ): SegmentedControl;

  export interface TabBar {
    select(id: string, options?: { silent?: boolean }): void;
    setLabel(id: string, label: string): void;
    destroy(): void;
  }
  export function createTabBar(
    root: HTMLElement,
    options: {
      label?: string;
      value: string;
      tabs: {
        id: string;
        label: string;
        icon: string;
        panel?: string;
        prominent?: boolean;
        press?: boolean;
        onPress?: () => void;
      }[];
      onSelect?: (id: string, info: { silent: boolean }) => void;
    },
  ): TabBar;

  export interface ChipPicker {
    el: HTMLElement;
    trigger: HTMLButtonElement;
    popup: { panel: HTMLElement };
    destroy(): void;
  }
  export function createChipPicker(options: {
    icon: string;
    label: string;
    title?: false;
    width: number;
    content: HTMLElement;
    onOpen?: () => void;
    onAfterOpen?: () => void;
  }): ChipPicker;

  export interface ListPickerSection {
    label: string;
    options: { value: string; label: string; description?: string }[];
  }
  export interface ListPicker {
    el: HTMLElement;
    value: string;
    setValue(value: string): void;
    setLabel(label: string): void;
    setOptions(options: { sections: ListPickerSection[] }): void;
    setLoading(loading: boolean): void;
    close(): void;
    destroy(): void;
  }
  export function createListPicker(options: {
    label: string;
    icon: string;
    options: never[];
    onChange: (id: string) => void;
  }): ListPicker;

  export interface Popover {
    el: HTMLElement;
    setContent(content: Node): void;
    show(target?: HTMLElement): void;
    hide(): void;
    destroy(): void;
  }
  export function createPopover(options: {
    trigger?: HTMLElement;
    content?: Node;
    placement?: string;
    role?: string;
    dismissable?: boolean;
  }): Popover;

  export interface Sheet {
    el: HTMLElement;
    contentEl: HTMLElement;
    scrollTop: number;
    height: number;
    detent: string;
    isGesturing: boolean;
    detentHeight(id: string): number | undefined;
    setDetent(id: string): void;
    destroy(): void;
  }
  export function createSheet(options: {
    header: HTMLElement;
    content: HTMLElement;
    container: HTMLElement;
    label: string;
    deform: string;
    zIndex: number;
    detents: { id: string; size: number | string }[];
    detent: string;
    margin: { top: number; bottom: number; inline: number };
    width?: number;
    side?: string;
    geometry?: { inset: number[]; radius: number[] };
    onResize: (height: number) => void;
    onDetentChange: (id: string) => void;
  }): Sheet;
}

declare module "vitrium/styles";
