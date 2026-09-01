// Module-level cache: React StrictMode calls useState initializer twice on mount.
// Cache prevents second call from hitting sessionStorage again (which throws after first unmount).
// Exported for test cleanup.
let activeTabCache = null

export function getCachedActiveTab(fallback = 'home') {
  if (activeTabCache !== null) return activeTabCache
  try {
    activeTabCache = sessionStorage.getItem('appActiveTab') || fallback
    return activeTabCache
  } catch {
    activeTabCache = fallback
    return activeTabCache
  }
}

export function setCachedActiveTab(tab) {
  activeTabCache = tab
}

export function resetActiveTabCache() {
  activeTabCache = null
}
