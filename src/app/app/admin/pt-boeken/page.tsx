import { redirect } from "next/navigation";

/**
 * PT-agenda C3: het Boek-voor-klant-scherm is verhuisd naar
 * /app/trainer/boeken (agenda en boeken zijn primair trainer-werk; admins
 * houden toegang via hetzelfde staff-predicaat). Deze stub vangt oude
 * bookmarks en geschiedenis op; de AdminSidebar linkt al direct naar het
 * nieuwe pad.
 */
export default function PtBoekenRedirect() {
  redirect("/app/trainer/boeken");
}
