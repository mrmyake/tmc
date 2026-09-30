import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Vrij trainen woont sinds spec-rooster-vrij-trainen.md op /app/rooster.
 * Deze route blijft bestaan voor oude links en bewaart de dag-parameter.
 */
export default async function VrijTrainenRedirect({
  searchParams,
}: {
  searchParams: Promise<{ dag?: string }>;
}) {
  const { dag } = await searchParams;
  const qs = new URLSearchParams({ weergave: "vrij" });
  if (dag) qs.set("dag", dag);
  redirect(`/app/rooster?${qs.toString()}`);
}
