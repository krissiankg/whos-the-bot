export function adminOrigin(request, requireOrigin = true) {
  try {
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.slice(0,-1);
    const host = request.headers.get("host");
    if (!host || !["http","https"].includes(protocol)) return null;
    const expected = new URL(`${protocol}://${host}`);
    if (expected.protocol !== "https:" && !["localhost","127.0.0.1","[::1]"].includes(expected.hostname)) return null;
    const supplied = request.headers.get("origin");
    if (requireOrigin && !supplied) return null;
    if (supplied && new URL(supplied).origin !== expected.origin) return null;
    return expected;
  } catch { return null; }
}
