export async function httpGetJson(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    // Bot / block detection signals
    if ([403, 412, 429].includes(res.status)) {
      return { ok: false, status: res.status, blocked: true, contentType };
    }

    if (!contentType.includes("application/json")) {
      // Many blocks return HTML
      return { ok: false, status: res.status, blocked: true, contentType };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data, contentType };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}
