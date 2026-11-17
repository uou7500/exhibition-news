"use client";

import { useState } from "react";
import { submitExhibition, type SubmissionInput } from "@/lib/submissions";
import { supabaseReady } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 주소 → 좌표 (지도에 이미 불러온 카카오 SDK의 주소 검색 사용) */
function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services) return resolve(null);
    new kakao.maps.services.Geocoder().addressSearch(address, (res: any[], status: string) => {
      if (status !== kakao.maps.services.Status.OK || !res[0]) return resolve(null);
      resolve({ lat: Number(res[0].y), lon: Number(res[0].x) });
    });
  });
}

const EMPTY = {
  title: "", artist: "", venue: "", address: "", start_date: "", end_date: "",
  free: true, price: "", kind: "작가전" as SubmissionInput["kind"], link: "", poster_url: "", description: "", contact: "",
};

export default function SubmitForm({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.title.trim() || !f.venue.trim() || !f.address.trim() || !f.start_date || !f.end_date) {
      setError("전시 이름, 장소, 주소, 기간은 꼭 적어 주세요.");
      return;
    }
    if (f.end_date < f.start_date) {
      setError("끝나는 날이 시작하는 날보다 빨라요. 기간을 확인해 주세요.");
      return;
    }
    setSending(true);
    try {
      const pos = await geocode(f.address.trim());
      if (!pos) {
        setError("주소로 위치를 찾지 못했어요. '서울 마포구 와우산로 94'처럼 도로명 주소로 적어 주세요.");
        setSending(false);
        return;
      }
      await submitExhibition({
        title: f.title.trim(),
        artist: f.artist,
        venue: f.venue.trim(),
        address: f.address.trim(),
        lat: pos.lat,
        lon: pos.lon,
        start_date: f.start_date,
        end_date: f.end_date,
        price: f.free ? 0 : f.price ? Number(f.price.replace(/\D/g, "")) : null,
        kind: f.kind,
        link: f.link,
        poster_url: f.poster_url,
        description: f.description,
        contact: f.contact,
      });
      setSent(true);
    } catch {
      setError("보내지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="submit-sheet" role="dialog" aria-modal="true" aria-label="전시 등록 요청" onClick={(e) => e.stopPropagation()}>
        <div className="sf-head">
          <h2>전시 등록 요청</h2>
          <button type="button" className="sf-close" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        {!supabaseReady ? (
          <p className="sf-note">전시 등록 기능을 준비하고 있어요.</p>
        ) : sent ? (
          <div className="sf-done">
            <p><b>보내 주셔서 고마워요.</b></p>
            <p>확인을 거쳐 지도에 올려 드릴게요. 보통 하루 이틀 걸려요.</p>
            <button type="button" className="btn" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <form className="sf-form" onSubmit={submit}>
            <p className="sf-note">작가·공간·학교 누구나 전시를 올릴 수 있어요. 확인을 거쳐 지도에 표시돼요.</p>
            <label>전시 이름 *<input id="sf-title" value={f.title} onChange={(e) => set("title", e.target.value.slice(0, 120))} placeholder="예: 제1회 OO 개인전 《빛의 결》" /></label>
            <label>작가 / 단체<input id="sf-artist" value={f.artist} onChange={(e) => set("artist", e.target.value.slice(0, 120))} placeholder="예: 홍길동, OO대학교 회화과" /></label>
            <label>분류
              <select id="sf-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as SubmissionInput["kind"])}>
                <option value="작가전">작가전 (개인·그룹전)</option>
                <option value="졸업전시">졸업전시</option>
                <option value="실험전시">실험전시 (프로젝트·레지던시 등)</option>
                <option value="기타">기타</option>
              </select>
            </label>
            <label>장소 이름 *<input id="sf-venue" value={f.venue} onChange={(e) => set("venue", e.target.value.slice(0, 80))} placeholder="예: OO갤러리 2층" /></label>
            <label>도로명 주소 *<input id="sf-address" value={f.address} onChange={(e) => set("address", e.target.value.slice(0, 160))} placeholder="예: 서울 마포구 와우산로 94" /></label>
            <div className="sf-two">
              <label>시작일 *<input id="sf-start" type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></label>
              <label>종료일 *<input id="sf-end" type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></label>
            </div>
            <div className="sf-price">
              <label className="sf-check"><input id="sf-free" type="checkbox" checked={f.free} onChange={(e) => set("free", e.target.checked)} /> 무료 관람</label>
              {!f.free && <input id="sf-price" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="성인 관람료 (원)" aria-label="관람료" />}
            </div>
            <label>인스타그램 / 홈페이지 링크<input id="sf-link" type="url" value={f.link} onChange={(e) => set("link", e.target.value.slice(0, 300))} placeholder="https://" /></label>
            <label>포스터 이미지 링크<input id="sf-poster" type="url" value={f.poster_url} onChange={(e) => set("poster_url", e.target.value.slice(0, 500))} placeholder="https:// (있으면)" /></label>
            <label>전시 소개<textarea id="sf-desc" rows={4} value={f.description} onChange={(e) => set("description", e.target.value.slice(0, 1000))} placeholder="어떤 전시인지 짧게 소개해 주세요" /></label>
            <label>연락처 (공개되지 않아요)<input id="sf-contact" value={f.contact} onChange={(e) => set("contact", e.target.value.slice(0, 120))} placeholder="확인이 필요할 때 연락드릴 이메일 또는 인스타그램" /></label>
            {error && <p className="rv-error" role="alert">{error}</p>}
            <button type="submit" className="btn" disabled={sending}>{sending ? "보내는 중…" : "등록 요청 보내기"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
