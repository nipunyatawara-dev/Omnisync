"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoCommit } from "@/types/dashboard";

export function useCollaborationFeed(branches: string[]) {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [commits, setCommits] = useState<RepoCommit[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sessionAvatarUrl, setSessionAvatarUrl] = useState<string | undefined>();
  const [sessionEmail, setSessionEmail] = useState<string | undefined>();
  const [sessionLogin, setSessionLogin] = useState<string | undefined>();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (branches.length === 0) {
      initializedRef.current = false;
      setSelectedBranches([]);
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      setSelectedBranches([...branches]);
      return;
    }
    setSelectedBranches((prev) => prev.filter((b) => branches.includes(b)));
  }, [branches]);

  const loadCommits = useCallback(async (branchFilter: string[]) => {
    if (branchFilter.length === 0) {
      setCommits([]);
      setAvatars({});
      return;
    }
    setIsLoading(true);
    try {
      const qs = encodeURIComponent(branchFilter.join(","));
      const res = await fetch(`/api/workspace/git?action=all-commits&branches=${qs}`);
      const data = await res.json();
      if (res.ok) {
        setCommits((data.commits as RepoCommit[]) || []);
        setAvatars((data.avatars as Record<string, string>) || {});
      }
    } catch {
      // leave existing
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommits(selectedBranches);
  }, [selectedBranches, loadCommits]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/github/user");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSessionAvatarUrl(data.avatarUrl || undefined);
        setSessionLogin(data.login || undefined);
        if (typeof data.email === "string") setSessionEmail(data.email);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    selectedBranches,
    setSelectedBranches,
    commits,
    avatars,
    isLoading,
    reload: () => loadCommits(selectedBranches),
    sessionAvatarUrl,
    sessionEmail,
    sessionLogin,
  };
}
