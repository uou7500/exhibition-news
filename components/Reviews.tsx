"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteNote, fetchNotes, reportNote, saveNote, NOTE_TAGS, REPORT_REASONS, type Note, type Vote } from "@/lib/reviews";
import { hasBadWords } from "@/lib/etiquette";
import { myUserId, supabaseReady } from "@/lib/supabase";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const REPORTED_KEY = "andepandang-reported";
function loadReported(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REPORTED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/** 남의 글 아래 작은 '신고' — 누르면 이유를 고른다 */
function ReportButton({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(() => (loadReported().has(noteId) ? "done" : "idle"));

  const send = async (reason: string) => {
    setState("sending");
    try {
      await reportNote(noteId, reason);
      const r = loadReported();
      r.add(noteId);
      try {
        localStorage.setItem(REPORTED_KEY, JSON.stringify([...r]));
      } catch {}
      setState("done");
      setOpen(false);
    } catch {
      setState("error");
    }
  };

  if (state === "done") return <span className="gb-reported">신고했어요</span>;
  return (
    <>
      <button type="button" className="gb-report" aria-expanded={open} onClick={() => setOpen((v) => !v)}>신고</button>
      {open && (
        <div className="gb-report-box" role="group" aria-label="신고 이유">
          <span>어떤 문제인가요?</span>
          {REPORT_REASONS.map((r) => (
            <button key={r} type="button" disabled={state === "sending"} onClick={() => send(r)}>{r}</button>
          ))}
          {state === "error" && <em>보내지 못했어요. 다시 눌러 주세요.</em>}
        </div>
      )}
    </>
  );
}

/** 상세 창 위쪽 한 줄: 방명록 N · 남기기 (누르면 방명록으로 이동) */
export function GuestbookLink({ count, onClick }: { count: number | null; onClick: () => void }) {
  return (
    <button type="button" className="gb-link" onClick={onClick}>
      {count ? <>방명록 {count} · 읽기</> : "방명록 남기기"}
    </button>
  );
}

/** 상세 창 위쪽: 👍 추천 N · 👎 비추천 M */
export function VoteSummary({ up, down }: { up: number; down: number }) {
  if (!up && !down) return null;
  return (
    <span className="vote-sum" aria-label={`추천 ${up}, 비추천 ${down}`}>
      <span>👍 추천 {up}</span>
      <span>👎 비추천 {down}</span>
    </span>
  );
}

/** 상세 창 안의 방명록: 감상 한마디 + 정보 태그 + 추천·비추천 */
export function Guestbook({ exhibitionId, onCount, onSaved }: { exhibitionId: string; onCount: (n: number | null) => void; onSaved?: () => void }) {
  const [list, setList] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [vote, setVote] = useState<Vote | null>(null);
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
          setVote(mine.vote);
          setNickname(mine.nickname ?? "");
        }
      })
      .catch(() => setError("방명록을 불러오지 못했어요. 잠시 후 다시 열어 주세요."));

  useEffect(() => {
    setList(null);
    onCount(null);
    setBody("");
    setTags([]);
    setVote(null);
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
    if (!body.trim() && tags.length === 0 && vote === null) {
      setError("추천·비추천을 고르거나, 한마디를 적거나, 정보를 하나 이상 골라 주세요.");
      return;
    }
    if (hasBadWords(body, nickname)) {
      setError("욕설이나 남을 낮추는 말은 쓸 수 없어요. 함께 보는 방명록이니 고운 말로 남겨 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      try {
        localStorage.setItem("andepandang-nickname", nickname.trim());
      } catch {}
      await saveNote(exhibitionId, body, tags, nickname, vote);
      setDone(mine ? "방명록을 고쳤어요." : "방명록을 남겼어요. 고마워요!");
      await load();
      onSaved?.();
    } catch (err) {
      setError(
        String(err).includes("bad_words")
          ? "욕설이나 남을 낮추는 말은 쓸 수 없어요. 함께 보는 방명록이니 고운 말로 남겨 주세요."
          : "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.",
      );
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
      setVote(null);
      setDone("방명록을 지웠어요.");
      await load();
      onSaved?.();
    } catch {
      setError("지우지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reviews" id="reviews">
      <h3 className="rv-h">방명록</h3>
      <div className="gb-intro">
        <p><b>예술에 높고 낮음은 없습니다.</b></p>
        <p>앙데팡당은 심사도 상도 없이 누구나 작품을 걸 수 있었던 1884년 파리의 전시에서 이름을 따왔어요. 그래서 별점 대신 다른 분께 권하고 싶은지만 👍·👎로 남겨요.</p>
        <p>잘했다, 못했다는 평가보다 무엇을 보고 어떤 마음이 들었는지, 감상을 남겨 주세요. 예술의 참된 아름다움은 소통이니까요. 😊</p>
      </div>

      {tagSummary.length > 0 && (
        <ul className="gb-summary" aria-label="관람객들이 남긴 정보">
          {tagSummary.map(([t, n]) => (
            <li key={t}>{t} <b>{n}</b></li>
          ))}
        </ul>
      )}

      <form className="rv-form" onSubmit={submit}>
        <div className="gb-vote" role="group" aria-label="다른 분께 권하고 싶나요? (선택)">
          <span>다른 분께 권하고 싶나요?</span>
          <button type="button" className={"gb-vote-btn" + (vote === 1 ? " on" : "")} aria-pressed={vote === 1} onClick={() => setVote((v) => (v === 1 ? null : 1))}>👍 추천</button>
          <button type="button" className={"gb-vote-btn" + (vote === -1 ? " on" : "")} aria-pressed={vote === -1} onClick={() => setVote((v) => (v === -1 ? null : -1))}>👎 비추천</button>
        </div>
        <textarea
          id={`rv-body-${exhibitionId}`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="어떤 장면이, 어떤 색이, 어떤 생각이 마음에 남았나요?"
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
                {r.vote === 1 && <span className="rv-vote up">👍 추천</span>}
                {r.vote === -1 && <span className="rv-vote down">👎 비추천</span>}
                <time>{fmt(r.created_at)}</time>
                {r.user_id !== myUserId() && <ReportButton noteId={r.id} />}
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
