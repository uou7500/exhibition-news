"use client";

import { useEffect, useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { formatDate, statusOf } from "@/lib/status";
import { SUGGESTIONS, askAssistant, assistantLive, type AssistantReply } from "@/lib/assistant";
import Poster from "./Poster";

type Msg = { id: number; from: "me" | "ai"; text: string; ids?: string[]; total?: number };

const HELLO: Msg = {
  id: 0,
  from: "ai",
  text: "안녕하세요, 전시 도우미예요. 동네, 날짜, 장르를 말씀해 주시면 앙데팡당 지도에 있는 전시 중에서 찾아 드릴게요.",
};

/** 전시 도우미 대화창. open=false면 숨기기만 한다 (대화 내용은 앱을 닫기 전까지 남는다). */
export default function Assistant({
  open,
  exhibitions,
  onClose,
  onOpenExhibition,
}: {
  open: boolean;
  exhibitions: Exhibition[];
  onClose: () => void;
  onOpenExhibition: (id: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([HELLO]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const byId = new Map(exhibitions.map((x) => [x.id, x]));

  // 새 말이 오면 맨 아래로
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // 입력칸 높이를 글 길이에 맞춘다 (최대 4줄 정도)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [text]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setMsgs((m) => [...m, { id: seq.current++, from: "me", text: question }]);
    setBusy(true);
    let reply: AssistantReply;
    try {
      reply = await askAssistant(question, exhibitions);
    } catch {
      reply = { text: "지금은 답을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요.", ids: [], total: 0 };
    }
    setMsgs((m) => [...m, { id: seq.current++, from: "ai", text: reply.text, ids: reply.ids, total: reply.total }]);
    setBusy(false);
  };

  const reset = () => {
    setMsgs([HELLO]);
    setText("");
  };

  const onlyHello = msgs.length === 1;

  return (
    <>
      <div className={"ai-backdrop" + (open ? " show" : "")} onClick={onClose} aria-hidden="true" />
      <section className={"ai-sheet" + (open ? " show" : "")} role="dialog" aria-modal="true" aria-label="전시 도우미" aria-hidden={!open}>
        <header className="ai-head">
          <div className="ai-title">
            <span className="ai-avatar" aria-hidden="true">✦</span>
            <div>
              <h2>전시 도우미</h2>
              <p>{assistantLive ? "앙데팡당 전시 목록에서 찾아 드려요" : "미리보기 · 아직 AI가 연결되지 않았어요"}</p>
            </div>
          </div>
          {!onlyHello && (
            <button type="button" className="ai-reset" onClick={reset}>
              새 대화
            </button>
          )}
          <button type="button" className="sf-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="ai-scroll" ref={scrollRef}>
          {msgs.map((m) => (
            <div key={m.id} className={"ai-msg " + m.from}>
              <p className="ai-bubble">{m.text}</p>
              {m.ids && m.ids.length > 0 && (
                <ul className="ai-cards">
                  {m.ids.map((id) => {
                    const x = byId.get(id);
                    if (!x) return null;
                    const st = statusOf(x);
                    return (
                      <li key={id}>
                        <button type="button" className="ai-card" onClick={() => onOpenExhibition(id)}>
                          <Poster exhibition={x} className="ai-thumb" />
                          <span className="ai-card-t">
                            <b>{x.title}</b>
                            <small>{x.venue} · {x.city}</small>
                            <small>
                              {st.kind === "ending" ? <span className="tag end">{st.label}</span> : st.kind === "upcoming" ? <span className="tag up">{st.label}</span> : null}
                              {formatDate(x.startDate)} – {formatDate(x.endDate)}
                              {x.price === 0 && <span className="ai-free"> · 무료</span>}
                            </small>
                          </span>
                          <span className="ai-go" aria-hidden="true">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          {busy && (
            <div className="ai-msg ai" aria-live="polite">
              <p className="ai-bubble ai-typing" aria-label="찾는 중">
                <i />
                <i />
                <i />
              </p>
            </div>
          )}
          {onlyHello && !busy && (
            <div className="ai-suggest" aria-label="이렇게 물어보세요">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          className="ai-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <div className="ai-input">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={300}
              placeholder="예: 이번 주말 성수 무료 전시"
              aria-label="도우미에게 물어보기"
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // 컴퓨터: Enter = 보내기, Shift+Enter = 줄바꿈. 한글 조합 중에는 보내지 않는다.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <button type="submit" className="ai-send" aria-label="보내기" disabled={!text.trim() || busy}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          <p className="ai-fine">순위는 매기지 않아요 · 내 위치는 보내지 않아요 · 가기 전에 전시 안내를 확인하세요</p>
        </form>
      </section>
    </>
  );
}

/** 지도 위 '물어보기' 버튼 */
export function AssistantButton({ onClick, style }: { onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button type="button" className="ai-fab" style={style} onClick={onClick} aria-label="전시 도우미에게 물어보기">
      <span aria-hidden="true">✦</span> 물어보기
    </button>
  );
}
