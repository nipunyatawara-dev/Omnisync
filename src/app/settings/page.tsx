"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import SettingsPageView, { type SettingsTab } from "@/components/SettingsPageView";
import { UserProfile } from "@/lib/profiles";

const VALID_TABS = new Set<SettingsTab>(["general", "git", "workspace"]);

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return") || undefined;
  const tabParam = searchParams.get("tab") as SettingsTab | null;
  const defaultTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "general";

  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetch("/api/profiles")
      .then((res) => res.json())
      .then((data) => {
        const profiles: UserProfile[] = data.profiles || [];
        const active = profiles.find((p) => p.id === data.activeProfileId) || null;
        setActiveProfile(active);
      })
      .catch(() => {});
  }, []);

  return (
    <SettingsPageView
      mode="page"
      defaultTab={defaultTab}
      returnTo={returnTo}
      activeProfile={activeProfile}
      onProfileUpdated={setActiveProfile}
    />
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageContent />
    </Suspense>
  );
}
