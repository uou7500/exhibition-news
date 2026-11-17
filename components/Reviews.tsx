"use client";

import { useEffect, useState } from "react";
import { deleteReview, fetchReviews, saveReview, type Rating, type Review } from "@/lib/reviews";
import { myUserId, supabaseReady } from "@/lib/supabase";

/** 별 다섯 개 (보기용). 0.5 단위 반올림 */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const v = Math.round(value * 2) / 2;
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`별점 ${value.toFixed(1)}점`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={v >= i ? "on" : v >= i - 0.5 ? "half" : ""} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

/** 전시 이름 아래 한 줄: ★★★★☆ 4.3 · 리뷰 12개 */
export function RatingLine({ rating, onClick, compact }: { rating?: Rating; onClick?: () => void; compact?: boolean }) {
  if (!rating || rating.n === 0) {
    if (compact) return null;
    return (
      <button type="button" className="rating-line empty" onClick={onClick}>
        아직 리뷰가 없어요 · 첫 리뷰 쓰기
      </button>
    );
  }
  const content = (
    <>
      <Stars value={rating.avg} size={compact ? 11 : 14} />
      <b>{rating.avg.toFixed(1)}</b>
      <span>리뷰 {rating.n}개</span>
    </>
  );
  if (compact) return <span className="rating-line compact">{content}</span>;
  return (
    <button type="button" className="rating-line" onClick={onClick} aria-label={`별점 ${rating.avg.toFixed(1)}, 리뷰 ${rating.n}개 보기`}>
      {content}
    </button>
  );
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 상세 창 안의 리뷰 목록과 쓰기 */
export function ReviewPanel({ exhibitionId, onChanged }: { exhibitionId: string; onChanged: () => void }) {
  const [list, setList] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    fetchReviews(exhibitionId)
      .then((r) => {
        setList(r);
        const mine = r.find((x) => x.user_id === myUserId());
        if (mine) {
          setRating(mine.rating);
          setBody(mine.body ?? "");
          setNickname(mine.nickname ?? "");
        }
      })
      .catch(() => setError("리뷰를 불러오지 못했어요. 잠시 후 다시 열어 주세요."));

  useEffect(() => {
    setList(null);
    setRating(0);
    setBody("");
    setDone(null);
    setError(null);
    try {
      setNickname(localStorage.getItem("andepandang-nickname") ?? "");
    } catch {}
    if (supabaseReady) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibitionId]);

  if (!supabaseReady) {
    return <div className="reviews"><p className="rv-note">리뷰 기능을 준비하고 있어요.</p></div>;
  }

  const mine = list?.find((x) => x.user_id === myUserId());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("별점을 골라 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      try {
        localStorage.setItem("andepandang-nickname", nickname.trim());
      } catch {}
      await saveReview(exhibitionId, rating, body, nickname);
      setDone(mine ? "리뷰를 고쳤어요." : "리뷰를 남겼어요. 고마워요!");
      await load();
      onChanged();
    } catch {
      setError("리뷰를 저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteReview(exhibitionId);
      setRating(0);
      setBody("");
      setDone("리뷰를 지웠어요.");
      await load();
      onChanged();
    } catch {
      setError("리뷰를 지우지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reviews" id="reviews">
      <h3 className="rv-h">관람 리뷰</h3>

      <form className="rv-form" onSubmit={submit}>
        <div className="rv-pick" role="radiogroup" aria-label="별점 고르기">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={`${i}점`}
              className={rating >= i ? "on" : ""}
              onClick={() => setRating(i)}
            >
              ★
            </button>
          ))}
          <span className="rv-pick-label">{rating ? `${rating}점` : "별점을 눌러 주세요"}</span>
        </div>
        <textarea
          id={`rv-body-${exhibitionId}`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="어떤 전시였나요? 다녀온 느낌을 짧게 남겨 주세요 (선택)"
          rows={3}
        />
        <div className="rv-row">
          <input
            id={`rv-nick-${exhibitionId}`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder="닉네임 (선택)"
            aria-label="닉네임"
          />
          <button type="submit" className="btn rv-submit" disabled={saving}>
            {saving ? "저장 중…" : mine ? "리뷰 고치기" : "리뷰 남기기"}
          </button>
        </div>
        {mine && (
          <button type="button" className="rv-delete" onClick={remove} disabled={saving}>
            내 리뷰 지우기
          </button>
        )}
        {error && <p className="rv-error" role="alert">{error}</p>}
        {done && <p className="rv-done">{done}</p>}
      </form>

      {list === null && !error && <p className="rv-note">리뷰를 불러오는 중…</p>}
      {list && list.length === 0 && <p className="rv-note">아직 리뷰가 없어요. 첫 리뷰를 남겨 주세요.</p>}
      {list && list.length > 0 && (
        <ul className="rv-list">
          {list.map((r) => (
            <li key={r.id}>
              <div className="rv-meta">
                <Stars value={r.rating} size={12} />
                <b>{r.nickname || "익명 관람객"}</b>
                {r.user_id === myUserId() && <span className="rv-me">내 리뷰</span>}
                <time>{fmt(r.created_at)}</time>
              </div>
              {r.body && <p>{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
