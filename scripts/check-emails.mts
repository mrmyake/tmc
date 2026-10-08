// Guard: mail-HTML volgt de linkregel (zie CLAUDE.md, kop "E-mail"). In de
// HTML-versie van een mail is een URL of kaal domein nooit zichtbare tekst;
// elke link heeft een beschrijvende linktekst; elke href wijst naar
// themovementclub.nl. Plain-text valt erbuiten.
//
// Toetst (1) dat elke src/emails/*.tsx (behalve bestanden met `_`) in de
// registry staat, (2) elke registry-entry gerenderd met zijn fixture en
// (3) elke Supabase Auth-template in supabase/templates/*.html.
// Geen env vars en geen netwerk nodig. Draait als prebuild:
//   node --import tsx scripts/check-emails.mts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { render } from "@react-email/render";
import { loadLint, loadRegistry } from "./emails/load.mts";

const { lintAuthTemplate, lintHtml } = await loadLint();
const { emailRegistry } = await loadRegistry();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function unregisteredTemplates(files: string[], ids: string[]): string[] {
  const known = new Set(ids);
  return files
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("_"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .filter((id) => !known.has(id))
    .sort();
}

export async function checkEmails(): Promise<string[]> {
  const problems: string[] = [];

  const files = readdirSync(resolve(root, "src/emails"));
  for (const id of unregisteredTemplates(files, emailRegistry.map((e) => e.id))) {
    problems.push(`src/emails/${id}.tsx staat niet in src/emails/registry.ts`);
  }

  for (const entry of emailRegistry) {
    const label = `src/emails/${entry.id}.tsx${entry.variant ? ` (${entry.variant})` : ""}`;
    let html: string;
    try {
      html = await render(entry.render());
    } catch (err) {
      problems.push(`${label}: renderen mislukt: ${String(err)}`);
      continue;
    }
    for (const v of lintHtml(html)) problems.push(`${label}: [${v.rule}] ${v.message}`);
  }

  const templateDir = resolve(root, "supabase/templates");
  for (const file of readdirSync(templateDir).filter((f) => f.endsWith(".html")).sort()) {
    const source = readFileSync(resolve(templateDir, file), "utf8");
    for (const v of lintAuthTemplate(source)) {
      problems.push(`supabase/templates/${file}: [${v.rule}] ${v.message}`);
    }
  }

  return problems;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const problems = await checkEmails();
  if (problems.length > 0) {
    console.error("check-emails: linkregel geschonden:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    console.error("\nRegel: in de HTML van een mail is een URL of kaal domein nooit zichtbare tekst; elke link heeft een beschrijvende linktekst.");
    process.exit(1);
  }
  console.log(`check-emails: ${emailRegistry.length} templates en Auth-templates in orde`);
}
