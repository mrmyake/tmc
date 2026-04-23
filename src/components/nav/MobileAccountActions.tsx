import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import type { Role, ActiveContext } from "./AvatarDropdown";

/**
 * Op mobiel toont de bottom-tab bar geen avatar-dropdown. De acties
 * daaruit (context-switch + uitloggen) komen inline bovenaan de
 * Profiel-pagina. Niet-admins zien alleen de Uitloggen-knop.
 */

interface Props {
  role: Role;
  activeContext: ActiveContext;
}

interface SwitchTarget {
  label: string;
  href: string;
}

function targetsFor(role: Role, active: ActiveContext): SwitchTarget[] {
  if (role !== "admin") return [];
  const all: Record<ActiveContext, SwitchTarget> = {
    admin: { label: "Admin cockpit", href: "/app/admin" },
    trainer: { label: "Trainer view", href: "/app/trainer/sessies" },
    member: { label: "Member view", href: "/app/rooster" },
  };
  return (["admin", "trainer", "member"] as ActiveContext[])
    .filter((ctx) => ctx !== active)
    .map((ctx) => all[ctx]);
}

export function MobileAccountActions({ role, activeContext }: Props) {
  const switchTargets = targetsFor(role, activeContext);
  const showSwitcher = switchTargets.length > 0;

  return (
    <section
      aria-label="Account-acties"
      className="md:hidden mb-8 border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60"
    >
      {showSwitcher && (
        <div className="py-5">
          <span className="tmc-eyebrow block mb-3">Schakel naar</span>
          <ul className="flex flex-col gap-2">
            {switchTargets.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="block text-sm text-text hover:text-accent transition-colors duration-300"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className="w-full flex items-center justify-between py-5 text-sm text-text-muted hover:text-accent transition-colors duration-300 cursor-pointer"
        >
          <span>Uitloggen</span>
          <LogOut size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </form>
    </section>
  );
}
