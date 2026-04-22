import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";

interface AdminShellProps {
  firstName: string;
  children: ReactNode;
}

export function AdminShell({ firstName, children }: AdminShellProps) {
  return (
    <div className="min-h-screen flex bg-bg text-text">
      <AdminSidebar firstName={firstName} />
      <main className="flex-1 min-w-0 pt-16 lg:pt-0">{children}</main>
    </div>
  );
}
