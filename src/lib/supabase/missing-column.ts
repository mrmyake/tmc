/**
 * Herkent "kolom bestaat niet" (SQLSTATE 42703) in een PostgREST-fout. Nodig
 * in het venster tussen de deploy van een PR met migratie en de
 * `supabase db push` na de merge, en op een Vercel-preview die tegen de
 * productiedatabase draait: code die een nieuwe kolom selecteert valt dan
 * terug op de oude vorm in plaats van de hele pagina te breken.
 */
export function isMissingColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  if (!e) return false;
  if (e.code === "42703") return true;
  return typeof e.message === "string" && /column .* does not exist/i.test(e.message);
}
