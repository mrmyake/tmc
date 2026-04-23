import { PauzeRequestBell } from "./PauzeRequestBell";
import { AvatarDropdown } from "./AvatarDropdown";

interface AdminHeaderProps {
  firstName: string;
}

/**
 * Sticky header boven de admin-content. Bevat TMC·Admin wordmark,
 * pauze-request bell en avatar-dropdown met context-switcher. De
 * `+ Nieuw` quick-actions staan expliciet uit scope (zie spec §11);
 * kunnen later toegevoegd als echte server actions bestaan.
 */
export function AdminHeader({ firstName }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-bg/95 backdrop-blur-sm border-b border-[color:var(--ink-500)]/60">
      <div className="h-full flex items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="font-[family-name:var(--font-playfair)] text-xs tracking-[0.12em] border border-accent/40 text-accent px-2 py-0.5"
          >
            TMC
          </span>
          <span className="tmc-eyebrow">Admin</span>
        </div>
        <div className="flex items-center gap-5">
          <PauzeRequestBell />
          <AvatarDropdown
            firstName={firstName}
            role="admin"
            activeContext="admin"
          />
        </div>
      </div>
    </header>
  );
}
