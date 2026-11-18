/*
 * 앙데팡당 서비스 워커 — '홈 화면에 추가'한 앱이 인터넷이 잠깐 끊겨도 열리게 한다.
 * 방침: 늘 인터넷에서 먼저 받고(최신 우선), 실패할 때만 저장해 둔 사본을 쓴다.
 * 우리 사이트(같은 주소) 파일만 다룬다. 지도·데이터·로그인 같은 다른 주소 요청은 건드리지 않는다.
 */
const CACHE = "adpd-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match(self.registration.scope) : undefined)).then((r) => r || Response.error()),
      ),
  );
});
