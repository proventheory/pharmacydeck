/**
 * Fetch with retries and exponential backoff for external APIs.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_MS = 500;

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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries) {
      const delay = initialMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error("fetch failed");
}
