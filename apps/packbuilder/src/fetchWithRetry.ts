/**
 * Fetch with retries and exponential backoff for external APIs.
 * Rate limits (429) and server errors (5xx) use longer backoff; optional Retry-After header honored.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_MS = 500;
const RATE_LIMIT_BACKOFF_MS = 2000;

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: { maxRetries?: number; initialMs?: number } = {}
): Promise<Response> {
  const { maxRetries = DEFAULT_MAX_RETRIES, initialMs = DEFAULT_INITIAL_MS } = config;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt === maxRetries) return res;
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt < maxRetries) {
        const is429 = res.status === 429;
        const is5xx = res.status >= 500 && res.status < 600;
        let delay = initialMs * Math.pow(2, attempt);
        if (is429 || is5xx) delay = Math.max(delay, is429 ? RATE_LIMIT_BACKOFF_MS : 1000);
        const retryAfter = res.headers.get("Retry-After");
        if (retryAfter) {
          const sec = parseInt(retryAfter, 10);
          if (!Number.isNaN(sec)) delay = Math.max(delay, sec * 1000);
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries && !lastError?.message.startsWith("HTTP")) {
      const delay = initialMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error("fetch failed");
}
