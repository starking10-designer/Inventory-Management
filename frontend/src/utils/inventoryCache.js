const CACHE_TTL_MS = 60 * 1000;

function getCacheKey(inventoryType) {
  return `inventory_cache_${inventoryType}`;
}

export function readInventoryCache(inventoryType) {
  try {
    const raw = sessionStorage.getItem(getCacheKey(inventoryType));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeInventoryCache(inventoryType, rows) {
  try {
    sessionStorage.setItem(
      getCacheKey(inventoryType),
      JSON.stringify({
        savedAt: Date.now(),
        rows: Array.isArray(rows) ? rows : [],
      }),
    );
  } catch {
    // Ignore cache write failures.
  }
}

export function clearInventoryCache(inventoryType) {
  try {
    sessionStorage.removeItem(getCacheKey(inventoryType));
  } catch {
    // Ignore cache clear failures.
  }
}
