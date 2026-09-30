/**
 * Press feedback: taps get no hover state and the tap highlight is off, so
 * pressable surfaces sink slightly while held. The press is instant
 * (duration-0 while :active) so it never lags the finger; the release eases
 * back through the element's own transition, which has to list `scale`.
 */
export const pressable =
  "ease-smooth-out active:not-disabled:scale-97 active:not-disabled:duration-0";

/** Large cards move more at the same ratio: keep their press subtle. */
export const pressableLarge =
  "ease-smooth-out active:not-disabled:scale-[0.985] active:not-disabled:duration-0";
