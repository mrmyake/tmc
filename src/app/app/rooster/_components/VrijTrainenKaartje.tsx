import Link from "next/link";

/**
 * Klein kaartje onder de lessen van de gekozen dag met de eerstvolgende
 * starttijd met vrije plekken (nextFreeStart). Tik opent de vrij-trainen-
 * weergave op dezelfde dag.
 */
export function VrijTrainenKaartje({
  dag,
  available,
  maxConcurrent,
  time,
}: {
  dag: string;
  available: number;
  maxConcurrent: number;
  time: string;
}) {
  return (
    <Link
      href={`/app/rooster?weergave=vrij&dag=${dag}`}
      scroll={false}
      className="block min-h-11 rounded-lg border border-text/15 p-5 transition-colors duration-300 hover:border-text/40"
    >
      <span className="block font-[family-name:var(--font-playfair)] text-xl text-text leading-tight">
        {/* COPY: confirm met Marlon */}
        Liever vrij trainen?
      </span>
      <span className="mt-2 block text-sm text-text-muted">
        {/* COPY: confirm met Marlon */}
        Nog {available} van {maxConcurrent} plekken vrij om {time}
      </span>
    </Link>
  );
}
