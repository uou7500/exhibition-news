"use client";

/**
 * '홈 화면에 추가' 도우미.
 * - 서비스 워커 등록(인터넷이 잠깐 끊겨도 앱이 열림)
 * - 안드로이드·크롬: 브라우저의 설치 창을 띄운다
 * - 아이폰·아이패드: 설치 창이 없어서 '공유 → 홈 화면에 추가' 방법을 보여 준다
 * - 이미 홈 화면 앱으로 열었으면 아무것도 보이지 않는다
 */
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {});
    }
    if (isStandalone()) return;
    if (isIOS()) {
      setIos(true);
      setShow(true);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const onClick = () => {
    if (prompt) {
      prompt.prompt();
      prompt.userChoice.then(() => setPrompt(null)).catch(() => {});
      return;
    }
    setGuide((v) => !v);
  };

  return (
    <div className="install">
      <button type="button" className="install-btn" onClick={onClick} aria-expanded={ios ? guide : undefined}>
        <span className="install-ico" aria-hidden="true">＋</span>
        홈 화면에 앱으로 추가
      </button>
      {guide && ios && (
        <ol className="install-guide">
          <li>
            Safari 아래(아이패드는 위)의 <b>공유</b> 버튼
            <svg className="install-share" viewBox="0 0 24 24" aria-label="공유 아이콘" role="img">
              <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            을 눌러요.
          </li>
          <li>
            목록을 내려 <b>홈 화면에 추가</b>를 누르고, 오른쪽 위 <b>추가</b>를 눌러요.
          </li>
          <li>홈 화면의 &lsquo;앙데팡당&rsquo; 아이콘으로 열면 앱처럼 전체 화면으로 열려요.</li>
        </ol>
      )}
    </div>
  );
}
