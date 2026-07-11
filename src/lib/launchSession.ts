const WORKSPACE_SESSION_KEY = "omnisync_workspace_ready";
const LOCAL_ONLY_KEY = "omnisync_local_only";

export function markWorkspaceReady(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(WORKSPACE_SESSION_KEY, "true");
}

export function clearWorkspaceReady(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
}

export function isWorkspaceReady(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(WORKSPACE_SESSION_KEY) === "true";
}

export function markLocalOnlyMode(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_ONLY_KEY, "true");
}

export function isLocalOnlyMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LOCAL_ONLY_KEY) === "true";
}
