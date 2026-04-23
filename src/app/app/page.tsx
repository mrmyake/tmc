import { redirect } from "next/navigation";

/**
 * Post-refactor: `/app` heeft geen eigen dashboard meer. Leden landen
 * direct op `/app/rooster`, waar "Volgende sessie" bovenaan staat.
 * Trainer/admin landen elders (zie /auth/callback).
 */
export default function AppIndex() {
  redirect("/app/rooster");
}
