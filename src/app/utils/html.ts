// External links retain the source HTTPS-only policy; React escapes their text.
export function safeUrl(url: string) {
  try {
    return new URL(url).protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}
