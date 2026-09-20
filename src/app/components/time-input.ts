type InputProperty = "value" | "min" | "max";

interface Observation {
  own: PropertyDescriptor | undefined;
  listeners: Set<(value: string) => void>;
}

const observations = new WeakMap<HTMLInputElement, Map<InputProperty, Observation>>();

// Keep React's native input tracker and allow observers to unmount in either order.
export function observeInputProperty(
  input: HTMLInputElement,
  property: InputProperty,
  changed: (value: string) => void,
) {
  let properties = observations.get(input);

  if (!properties) {
    properties = new Map();
    observations.set(input, properties);
  }

  let observation = properties.get(property);

  if (!observation) {
    const own = Object.getOwnPropertyDescriptor(input, property);
    const previous = own ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, property)!;
    const listeners = new Set<(value: string) => void>();
    observation = { own, listeners };
    properties.set(property, observation);
    Object.defineProperty(input, property, {
      configurable: true,
      get(): string {
        return previous.get!.call(input);
      },
      set(value: string) {
        previous.set!.call(input, value);

        for (const listener of listeners) listener(value);
      },
    });
  }

  const { own, listeners } = observation;
  listeners.add(changed);

  return () => {
    listeners.delete(changed);

    if (listeners.size) return;

    if (own) Object.defineProperty(input, property, own);
    else Reflect.deleteProperty(input, property);
    properties.delete(property);

    if (!properties.size) observations.delete(input);
  };
}
