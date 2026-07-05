import { listAllClassTypes, listClassPillars } from "@/lib/admin/class-types-query";
import { ClassTypesClient } from "./_components/ClassTypesClient";

export const metadata = {
  title: "Admin · Lestypes | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminClassTypesPage() {
  const [rows, pillars] = await Promise.all([
    listAllClassTypes(),
    listClassPillars(),
  ]);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Lestypes.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {rows.length} {rows.length === 1 ? "lestype" : "lestypes"} totaal
        </p>
      </header>

      <ClassTypesClient rows={rows} pillars={pillars} />
    </div>
  );
}
