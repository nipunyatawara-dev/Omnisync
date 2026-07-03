"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SettingsPageView, { type SettingsTab } from "@/components/SettingsPageView";

const VALID_TABS = new Set<SettingsTab>(["general", "git", "workspace"]);

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return") || undefined;
  const tabParam = searchParams.get("tab") as SettingsTab | null;
  const defaultTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "general";

  return (
    <SettingsPageView
      mode="page"
      defaultTab={defaultTab}
      returnTo={returnTo}
      onActiveProfileDeleted={() => {
        window.location.href = "/setup";
      }}
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
