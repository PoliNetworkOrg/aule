// External links retain the source HTTPS-only policy; React escapes their text.
export function safeUrl(url: string) {
  try {
    return new URL(url).protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

// Appends/overrides a query param on a URL that's already been through
// safeUrl(). Returns "" (rather than a broken "#&param=value" concatenation)
// when safeUrl() rejected the URL, so callers can skip rendering the image
// instead of firing a request that can never succeed.
export function appendSafeUrlParam(url: string, param: string, value: string) {
  if (url === "#") return "";

  try {
    const parsed = new URL(url);

    parsed.searchParams.set(param, value);

    return parsed.toString();
  } catch {
    return "";
  }
}
