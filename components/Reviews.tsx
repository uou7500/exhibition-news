"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteNote, fetchNotes, saveNote, NOTE_TAGS, type Note } from "@/lib/reviews";
import { myUserId, supabaseReady } from "@/lib/supabase";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 상세 창 위쪽 한 줄: 방명록 N · 남기기 (누르면 방명록으로 이동) */
export function GuestbookLink({ count, onClick }: { count: number | null; onClick: () => void }) {
  return (
    <button type="button" className="gb-link" onClick={onClick}>
      {count ? <>방명록 {count} · 읽기</> : "방명록 남기기"}
    </button>
  );
}

/** 상세 창 안의 방명록: 감상 한마디 + 정보 태그. 점수·평균은 없다 */
export function Guestbook({ exhibitionId, onCount }: { exhibitionId: string; onCount: (n: number | null) => void }) {
  const [list, setList] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    fetchNotes(exhibitionId)
      .then((r) => {
        setList(r);
        onCount(r.length);
        const mine = r.find((x) => x.user_id === myUserId());
        if (mine) {
          setBody(mine.body ?? "");
          setTags(mine.tags);
          setNickname(mine.nickname ?? "");
        }
      })
      .catch(() => setError("방명록을 불러오지 못했어요. 잠시 후 다시 열어 주세요."));

  useEffect(() => {
    setList(null);
    onCount(null);
    setBody("");
    setTags([]);
    setDone(null);
    setError(null);
    try {
      setNickname(localStorage.getItem("andepandang-nickname") ?? "");
    } catch {}
    if (supabaseReady) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibitionId]);

  // 다른 관람객들이 고른 정보 태그 모아 보기 (많이 고른 순, 숫자만)
  const tagSummary = useMemo(() => {
    const c = new Map<string, number>();
    list?.forEach((n) => n.tags.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  if (!supabaseReady) {
    return <div className="reviews"><p className="rv-note">방명록을 준비하고 있어요.</p></div>;
  }

  const mine = list?.find((x) => x.user_id === myUserId());
  const toggleTag = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() && tags.length === 0) {
      setError("한마디를 적거나 정보를 하나 이상 골라 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      try {
        localStorage.setItem("andepandang-nickname", nickname.trim());
      } catch {}
      await saveNote(exhibitionId, body, tags, nickname);
      setDone(mine ? "방명록을 고쳤어요." : "방명록을 남겼어요. 고마워요!");
      await load();
    } catch {
      setError("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteNote(exhibitionId);
      setBody("");
      setTags([]);
      setDone("방명록을 지웠어요.");
      await load();
    } catch {
      setError("지우지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reviews" id="reviews">
      <h3 className="rv-h">방명록</h3>
      <p className="rv-note">점수 없이, 다녀온 감상과 다음 관람객에게 도움이 될 정보를 남겨요.</p>

      {tagSummary.length > 0 && (
        <ul className="gb-summary" aria-label="관람객들이 남긴 정보">
          {tagSummary.map(([t, n]) => (
            <li key={t}>{t} <b>{n}</b></li>
          ))}
        </ul>
      )}

      <form className="rv-form" onSubmit={submit}>
        <textarea
          id={`rv-body-${exhibitionId}`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="전시장에서 무엇이 마음에 남았나요?"
          rows={3}
        />
        <div className="gb-tags" role="group" aria-label="정보 고르기 (선택)">
          {NOTE_TAGS.map((t) => (
            <button key={t} type="button" className={"gb-tag" + (tags.includes(t) ? " on" : "")} aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="rv-row">
          <input
            id={`rv-nick-${exhibitionId}`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder="이름 (선택)"
            aria-label="이름"
          />
          <button type="submit" className="btn rv-submit" disabled={saving}>
            {saving ? "저장 중…" : mine ? "고치기" : "남기기"}
          </button>
        </div>
        {mine && (
          <button type="button" className="rv-delete" onClick={remove} disabled={saving}>
            내 방명록 지우기
          </button>
        )}
        {error && <p className="rv-error" role="alert">{error}</p>}
        {done && <p className="rv-done">{done}</p>}
      </form>

      {list === null && !error && <p className="rv-note">불러오는 중…</p>}
      {list && list.length === 0 && <p className="rv-note">아직 남긴 글이 없어요. 첫 방명록을 남겨 주세요.</p>}
      {list && list.length > 0 && (
        <ul className="rv-list">
          {list.map((r) => (
            <li key={r.id}>
              <div className="rv-meta">
                <b>{r.nickname || "익명 관람객"}</b>
                {r.user_id === myUserId() && <span className="rv-me">내 글</span>}
                <time>{fmt(r.created_at)}</time>
              </div>
              {r.body && <p>{r.body}</p>}
              {r.tags.length > 0 && (
                <div className="gb-row-tags">{r.tags.map((t) => <span key={t}>{t}</span>)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
