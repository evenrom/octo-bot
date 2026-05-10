const MIN_DELAY = 1500;
let lastRequestTime = 0;

export async function throttledFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_DELAY) {
    const delay = MIN_DELAY - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Update last request time *before* making the request to ensure sequential
  // delays even if requests overlap in async context.
  lastRequestTime = Date.now();

  return fetch(url, options);
}
