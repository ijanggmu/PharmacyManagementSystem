// Basic offline caching for POS shell and critical assets

const CACHE_NAME = "pharmacy-pos-cache-v1"
const OFFLINE_URLS = [
  "/",
  "/dashboard/sales/new",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS)
    }),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  // Only cache GET requests
  if (request.method !== "GET") {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).catch(() => {
        // If network fails and we don't have cache, try home page
        return caches.match("/")
      })
    }),
  )
})

