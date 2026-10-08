const CACHE_VERSION = "v6";
const CACHE_NAME = `belal-portfolio-cache-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const filesToCache = [
  "./",
  "/",
  "/offline",
  "/admin",
  "site.webmanifest",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "apple-touch-icon.png",
  "favicon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "Belal CV.pdf",

  // css
  "css/styles.css",
  "css/vendor.css",
  "css/admin-dashboard.css",
  "/src/styles/themes.css",
  "/src/components/ai-agent/ai-agent.css",
  "/src/components/notifications/notifications.css",

  // js
  "js/main.js",
  "js/plugins.js",
  "js/site-config.js",
  "js/portfolio.js",
  "js/admin-app.js",
  "js/ai-agent-bootstrap.js",
  "/src/components/ai-agent/ai-agent.js",
  "/src/components/ai-agent/ai-agent-chat.js",
  "/src/components/ai-agent/ai-agent-history.js",
  "/src/components/ai-agent/ai-agent-history-idb.js",
  "/src/components/ai-agent/ai-agent-dropdown.js",
  "/src/components/ai-agent/ai-agent-mention-menu.js",
  "/src/components/ai-agent/ai-agent-actions.js",
  "/src/shared/markdown.js",
  "/src/shared/markdown-css.js",
  "/src/shared/media-resolve.js",
  "/src/components/notifications/notifications.js",

  //images
  "images/about-photo.png",
  "images/about-photo@2x.png",
  "/assets/images/el-bash-mebasmag--no-bg.png",

  // Icons
  "images/icons/icon-72x72.png",
  "images/icons/icon-96x96.png",
  "images/icons/icon-128x128.png",
  "images/icons/icon-192x192.png",
  "images/icons/icon-384x384.png",
  "images/icons/icon-512x512.png",

  // Screenshots
  "screenshots/screenshot-mobile.png",
  "screenshots/screenshot-desktop.png",

  // Portfolio images
  "images/portfolio/ns.jpg",
  "images/portfolio/ns@2x.jpg",
  "images/portfolio/encyption.jpg",
  "images/portfolio/encyption@2x.jpg",
  "images/portfolio/calculator.jpg",
  "images/portfolio/calculator@2x.jpg",
  "images/portfolio/nsweb.jpg",
  "images/portfolio/nsweb@2x.jpg",
  "images/portfolio/quiz.jpg",
  "images/portfolio/quiz@2x.jpg",

  //gellary images
  "images/portfolio/gellary/about-photo.jpg",
  "images/portfolio/gellary/g-calculator.jpg",
  "images/portfolio/gellary/g-encyption.jpg",
  "images/portfolio/gellary/g-numbersystems - web.jpg",
  "images/portfolio/gellary/g-numbersystems.jpg",
  "images/portfolio/gellary/g-quiz.jpg",

  // Avatar
  "images/avatars/user-01.jpg",
  "images/avatars/user-02.jpg",
  "images/avatars/user-03.jpg",
  "images/avatars/user-04.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(filesToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === "navigate") {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});
