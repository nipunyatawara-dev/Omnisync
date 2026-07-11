"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type OAuthState = "idle" | "authorizing" | "success";

export interface OAuthSuccessData {
  username: string;
  avatarUrl?: string;
}

interface UseGithubOAuthOptions {
  onAuthSuccess: (data: OAuthSuccessData) => void | Promise<void>;
}

export function useGithubOAuth({ onAuthSuccess }: UseGithubOAuthOptions) {
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [oauthState, setOauthState] = useState<OAuthState>("idle");
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [githubClientId, setGithubClientId] = useState("");
  const [showOauthConfigForm, setShowOauthConfigForm] = useState(false);
  const [inputClientId, setInputClientId] = useState("");
  const [isSavingOauthConfig, setIsSavingOauthConfig] = useState(false);
  const [oauthConfigError, setOauthConfigError] = useState("");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const modalOpenRef = useRef(false);
  const onAuthSuccessRef = useRef(onAuthSuccess);

  useEffect(() => {
    modalOpenRef.current = isOAuthModalOpen;
  }, [isOAuthModalOpen]);

  useEffect(() => {
    onAuthSuccessRef.current = onAuthSuccess;
  }, [onAuthSuccess]);

  const checkOauthConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/config");
      const data = await res.json();
      if (data.hasConfig) {
        setOauthConfigured(true);
        setGithubClientId(data.clientId || "");
      } else {
        setOauthConfigured(false);
      }
    } catch {
      setOauthConfigured(false);
    }
  }, []);

  const startDevicePoll = useCallback((devCode: string, intervalSeconds: number) => {
    let active = true;

    const checkStatus = async () => {
      if (!active || !modalOpenRef.current) {
        active = false;
        return;
      }
      try {
        const res = await fetch("/api/auth/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: devCode }),
        });
        const data = await res.json();

        if (data.status === "success") {
          active = false;
          setOauthStatusText("Signed in — preparing your workspace…");
          setOauthState("success");

          await onAuthSuccessRef.current({
            username: data.username,
            avatarUrl: data.avatarUrl || "",
          });

          await new Promise((resolve) => setTimeout(resolve, 1400));
          setIsOAuthModalOpen(false);
          setOauthState("idle");
        } else if (data.status === "error") {
          active = false;
          setOauthState("idle");
          setIsOAuthModalOpen(false);
          alert(`Authentication error: ${data.error}`);
        } else {
          setTimeout(checkStatus, intervalSeconds * 1000);
        }
      } catch (err) {
        console.error("Polling error", err);
        setTimeout(checkStatus, intervalSeconds * 1000);
      }
    };

    setTimeout(checkStatus, intervalSeconds * 1000);
  }, []);

  const triggerGitHubDeviceFlow = useCallback(async () => {
    setIsOAuthModalOpen(true);
    setOauthState("authorizing");
    setOauthStatusText("Requesting authorization codes from GitHub...");
    setUserCode("");
    setVerificationUri("");

    try {
      const res = await fetch("/api/auth/device/code", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setUserCode(data.userCode);
      setVerificationUri(data.verificationUri);
      setOauthStatusText("Waiting for authorization on GitHub...");

      startDevicePoll(data.deviceCode, data.interval || 5);
    } catch (err: unknown) {
      setOauthState("idle");
      setIsOAuthModalOpen(false);
      alert(`Failed to start GitHub Device Flow: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [startDevicePoll]);

  const handleSaveOauthConfig = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputClientId) {
        setOauthConfigError("Client ID is required.");
        return;
      }

      setIsSavingOauthConfig(true);
      setOauthConfigError("");

      try {
        const res = await fetch("/api/auth/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: inputClientId, clientSecret: "device_flow_public" }),
        });
        const data = await res.json();
        if (data.success) {
          setOauthConfigured(true);
          setGithubClientId(inputClientId);
          setShowOauthConfigForm(false);
          triggerGitHubDeviceFlow();
        } else {
          setOauthConfigError(data.error || "Failed to save configuration.");
        }
      } catch (err: unknown) {
        setOauthConfigError(err instanceof Error ? err.message : "Error saving Client ID.");
      } finally {
        setIsSavingOauthConfig(false);
      }
    },
    [inputClientId, triggerGitHubDeviceFlow]
  );

  const handleGitHubSignIn = useCallback(() => {
    if (oauthConfigured && githubClientId) {
      triggerGitHubDeviceFlow();
    } else {
      setShowOauthConfigForm(true);
    }
  }, [oauthConfigured, githubClientId, triggerGitHubDeviceFlow]);

  const copyUserCode = useCallback(() => {
    navigator.clipboard.writeText(userCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }, [userCode]);

  const closeOAuthModal = useCallback(() => {
    setIsOAuthModalOpen(false);
    setOauthState("idle");
  }, []);

  return {
    isOAuthModalOpen,
    oauthState,
    oauthStatusText,
    oauthConfigured,
    githubClientId,
    showOauthConfigForm,
    setShowOauthConfigForm,
    inputClientId,
    setInputClientId,
    isSavingOauthConfig,
    oauthConfigError,
    setOauthConfigError,
    userCode,
    verificationUri,
    copiedCode,
    checkOauthConfig,
    handleSaveOauthConfig,
    triggerGitHubDeviceFlow,
    handleGitHubSignIn,
    copyUserCode,
    closeOAuthModal,
  };
}
