import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "@/components/nav/AdminHeader";
import { AdminMobileBlock } from "@/components/nav/AdminMobileBlock";

interface AdminShellProps {
  firstName: string;
  children: ReactNode;
}

/**
 * Admin cockpit shell. Desktop-only layout met sidebar links + sticky
 * header boven de content. Op <lg vervangen we alles door een mobile-
 * block: admin is desktop-only per spec §3.4.
 */
export function AdminShell({ firstName, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <AdminMobileBlock />
      <div className="hidden lg:flex min-h-screen">
        <AdminSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <AdminHeader firstName={firstName} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
