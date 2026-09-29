// Coordinates arrive from the API as optional numbers; keep the check in a type guard.
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}
