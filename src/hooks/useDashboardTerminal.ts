"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalLine } from "@/lib/dashboardTerminal";
import { terminalLineColor } from "@/lib/parseInstallLogs";

const STORAGE_HEIGHT_KEY = "omnisync_terminal_height";
const STORAGE_COLLAPSED_KEY = "omnisync_terminal_collapsed";
const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 520;
const ACTIVE_POLL_MS = 1000;
const IDLE_POLL_MS = 4000;

export function useDashboardTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [prompt, setPrompt] = useState("user@localhost workspace");
  const [isManualRunning, setIsManualRunning] = useState(false);
  const [input, setInput] = useState("");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lastIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const shellAckRef = useRef(false);
  const isManualRunningRef = useRef(false);
  const isCollapsedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedHeight = Number(localStorage.getItem(STORAGE_HEIGHT_KEY));
    if (!Number.isNaN(storedHeight) && storedHeight >= MIN_HEIGHT) {
      setHeight(Math.min(storedHeight, MAX_HEIGHT));
    }
    setIsCollapsed(localStorage.getItem(STORAGE_COLLAPSED_KEY) === "true");
  }, []);

  useEffect(() => {
    isManualRunningRef.current = isManualRunning;
  }, [isManualRunning]);

  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  const persistHeight = useCallback((value: number) => {
    const next = Math.max(MIN_HEIGHT, Math.min(value, MAX_HEIGHT));
    setHeight(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_HEIGHT_KEY, String(next));
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  }, []);

  const pollTerminal = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace/terminal?since=${lastIdRef.current}`);
      const data = await res.json();
      if (!res.ok) return;

      if (typeof data.prompt === "string") {
        setPrompt(data.prompt);
      }
      if (typeof data.isManualRunning === "boolean") {
        setIsManualRunning(data.isManualRunning);
      }

      const incoming = (data.lines as TerminalLine[]) || [];
      if (incoming.length > 0) {
        setLines((prev) => {
          const merged = [...prev, ...incoming];
          return merged.length > 5000 ? merged.slice(-5000) : merged;
        });
        lastIdRef.current = data.lastId ?? lastIdRef.current;
      }
    } catch {}
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (delay: number) => {
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const shouldPoll =
        visible && (!isCollapsedRef.current || isManualRunningRef.current);

      if (shouldPoll) {
        await pollTerminal();
      }

      const active =
        isManualRunningRef.current ||
        (visible && !isCollapsedRef.current);
      schedule(active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pollTerminal();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollTerminal]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, isManualRunning, isSubmitting]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const submitCommand = useCallback(async () => {
    const command = input.trim();
    if (!command || isSubmitting) return;

    if (!shellAckRef.current) {
      const ok = window.confirm(
        "Terminal commands run as your user with full shell access on this machine. Continue?"
      );
      if (!ok) return;
      shellAckRef.current = true;
    }

    setIsSubmitting(true);
    shouldAutoScrollRef.current = true;
    setInput("");

    try {
      const res = await fetch("/api/workspace/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.lines) {
        setLines(data.lines as TerminalLine[]);
        lastIdRef.current = data.lastId ?? lastIdRef.current;
      } else {
        await pollTerminal();
      }
    } catch {
      await pollTerminal();
    } finally {
      setIsSubmitting(false);
    }
  }, [input, isSubmitting, pollTerminal]);

  const clearTerminal = useCallback(async () => {
    try {
      await fetch("/api/workspace/terminal", { method: "DELETE" });
      setLines([]);
      lastIdRef.current = 0;
    } catch {}
  }, []);

  const lineColor = useCallback((line: TerminalLine) => {
    if (line.kind === "command") return "#58a6ff";
    if (line.kind === "error") return "var(--color-danger-fg)";
    if (line.kind === "system") return "#8b949e";
    return terminalLineColor(line.text);
  }, []);

  return {
    lines,
    prompt,
    input,
    setInput,
    height,
    persistHeight,
    isCollapsed,
    toggleCollapsed,
    isManualRunning,
    isSubmitting,
    scrollRef,
    handleScroll,
    submitCommand,
    clearTerminal,
    lineColor,
  };
}
