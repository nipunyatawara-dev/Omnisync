"use client";

import { UserProfile } from "@/lib/profiles";

interface ProfileSelectionStepProps {
  profilesList: UserProfile[];
  onProfileSelect: (profileId: string) => void;
  onSetupNewRepository: () => void;
}

export default function ProfileSelectionStep({
  profilesList,
  onProfileSelect,
  onSetupNewRepository,
}: ProfileSelectionStepProps) {
  return (
    <div>
      <div className="mb-lg">
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Select Workspace</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Choose a previously set up repository workspace or initialize a new one.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-xl">
        {profilesList.map((p) => (
          <div
            key={p.id}
            onClick={() => onProfileSelect(p.id)}
            className="border border-outline-variant rounded-xl p-md bg-surface-container flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-secondary-container hover:shadow-lg transition-all duration-200"
          >
            <div>
              <div className="flex items-center gap-sm mb-sm">
                <div className="w-8 h-8 rounded-lg bg-accent-bg text-secondary-container flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div className="min-w-0">
                  <div className="font-button-text text-on-surface truncate font-semibold">{p.name}</div>
                  <div className="text-[11px] text-on-surface-variant">Local Folder</div>
                </div>
              </div>
              <div className="text-[11px] text-on-surface-variant break-all line-clamp-2 leading-relaxed">
                {p.workspacePath || "No path set"}
              </div>
            </div>
            <div className="text-[12px] text-secondary-container font-semibold text-right mt-sm">
              Launch →
            </div>
          </div>
        ))}

        <div
          onClick={onSetupNewRepository}
          className="border-2 border-dashed border-outline-variant rounded-xl p-md flex flex-col items-center justify-center min-h-[140px] cursor-pointer hover:border-secondary-container hover:bg-surface-container/30 transition-all duration-200"
        >
          <div className="text-2xl text-on-surface-variant mb-xs">+</div>
          <div className="font-button-text text-on-surface-variant font-medium text-center">
            Set up new repository
          </div>
        </div>
      </div>
    </div>
  );
}
