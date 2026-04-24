"use client";

import { usePathname } from "next/navigation";
import { MemberNav } from "@/components/nav/MemberNav";
import { TrainerNav } from "@/components/nav/TrainerNav";
import type { Role } from "@/components/nav/AvatarDropdown";

/**
 * Client-side chrome switcher. De outer `/app/layout.tsx` haalt role +
 * firstName op (server) en geeft ze hier door. Op basis van pathname
 * kiezen we welke nav (of geen, voor admin) te renderen.
 *
 * Admin-routes krijgen GEEN outer chrome — de admin-layout heeft zijn
 * eigen sidebar + header. Trainer- en member-routes delen hier dezelfde
 * wrapper en alleen de `<nav>` varieert.
 */

interface AppChromeProps {
  firstName: string;
  role: Role;
  eligibleForVrijTrainen: boolean;
  children: React.ReactNode;
}

export function AppChrome({
  firstName,
  role,
  eligibleForVrijTrainen,
  children,
}: AppChromeProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/app/admin")) {
    return <>{children}</>;
  }

  const isTrainer = pathname.startsWith("/app/trainer");

  return (
    <div className="min-h-screen flex flex-col">
      {isTrainer ? (
        <TrainerNav firstName={firstName} role={role} />
      ) : (
        <MemberNav
          firstName={firstName}
          role={role}
          eligibleForVrijTrainen={eligibleForVrijTrainen}
        />
      )}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
