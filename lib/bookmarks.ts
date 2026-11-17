"use client";

import { useCallback, useEffect, useState } from "react";

// 관심 전시: 로그인 없이 이 기기(브라우저)에만 저장한다.
const KEY = "andepandang-bookmarks";

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useBookmarks() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => setIds(new Set(read())), []);
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  }, []);
  return { saved: ids, toggle };
}
