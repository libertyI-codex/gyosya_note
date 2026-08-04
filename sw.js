"use strict";

const CACHE_NAME = "kaitori-company-note-v1-prototype2";
const CACHE_PREFIX = "kaitori-company-note-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/constants.js",
  "./js/utils.js",
  "./js/db.js",
  "./js/cases-ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icons/icon-source.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            return caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .then(() => response);
          }
          return response;
        })
        .catch(async () => {
          const direct = await caches.match(request);
          if (direct) return direct;
          return caches.match(new URL("./index.html", self.registration.scope).href);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .then(() => response);
        }
        return response;
      });
    })
  );
});
