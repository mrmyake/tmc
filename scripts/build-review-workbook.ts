#!/usr/bin/env node
/**
 * Leest review-scenarios-marlon.md en genereert review-scenarios-marlon.xlsx.
 * De markdown blijft de enige bron voor scenariotekst; de xlsx is een
 * wegwerp-artefact, opnieuw te bouwen met `npm run build:review-workbook`.
 * Doelplatform is Google Sheets: geen beveiligde bereiken, geen notities,
 * geen macro's, geen exotische formules.
 *
 * Eén tabblad per rol (Klant, Trainer, Admin). De opmaaklaag is bewust
 * minimaal: alleen een opgemaakte kopregel, bevroren rij 1, tekstterugloop,
 * vaste kolombreedtes en twee dropdowns. Geen voorwaardelijke opmaak, geen
 * blokkopregels, geen merges, geen berekende rijhoogte, omdat die laag in
 * Google Sheets toch niet betrouwbaar overkomt en het bewerken hindert.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MD_PATH = path.join(REPO_ROOT, "review-scenarios-marlon.md");
const OUT_PATH = path.join(REPO_ROOT, "review-scenarios-marlon.xlsx");

// ---------------------------------------------------------------------------
// Markdown parsing: generieke heading-boom, daarna gerichte extractie.
// ---------------------------------------------------------------------------

interface HeadingNode {
  level: number;
  title: string;
  body: string[];
  children: HeadingNode[];
}

function parseHeadingTree(markdown: string): HeadingNode {
  const root: HeadingNode = { level: 0, title: "root", body: [], children: [] };
  const stack: HeadingNode[] = [root];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const node: HeadingNode = {
        level: m[1].length,
        title: m[2].trim(),
        body: [],
        children: [],
      };
      while (stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].body.push(line);
    }
  }
  return root;
}

function findChild(node: HeadingNode, level: number, pattern: RegExp): HeadingNode {
  const found = node.children.find((c) => c.level === level && pattern.test(c.title));
  if (!found) {
    throw new Error(
      `Kon geen heading van niveau ${level} vinden die voldoet aan ${pattern} onder "${node.title}". ` +
        `Pas review-scenarios-marlon.md aan naar een consistente structuur in plaats van dit script uit te breiden.`,
    );
  }
  return found;
}

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*\(([^*]+)\)\*/g, "($1)")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function extractField(bodyLines: string[], label: string, context: string): string {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`);
  const line = bodyLines.find((l) => re.test(l));
  if (!line) {
    throw new Error(`Veld "${label}" ontbreekt bij scenario "${context}". Pas de md aan.`);
  }
  const m = line.match(re)!;
  return stripMd(m[1].trim());
}

function extractLetOp(bodyLines: string[], context: string): string[] {
  const startIdx = bodyLines.findIndex((l) => /^\*\*Let op:\*\*\s*$/.test(l));
  if (startIdx === -1) {
    throw new Error(`Veld "Let op" ontbreekt bij scenario "${context}". Pas de md aan.`);
  }
  const bullets: string[] = [];
  for (let i = startIdx + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (/^\*\*Neveneffect:\*\*/.test(line)) break;
    if (/^-\s+/.test(line)) {
      bullets.push(stripMd(line.replace(/^-\s+/, "")));
    } else if (line.trim().length > 0) {
      if (bullets.length === 0) {
        throw new Error(
          `Onverwachte regel onder "Let op" bij scenario "${context}" vóór de eerste bullet: "${line}".`,
        );
      }
      bullets[bullets.length - 1] += `\n  ${stripMd(line.trim())}`;
    }
  }
  if (bullets.length === 0) {
    throw new Error(`Geen bullets gevonden onder "Let op" bij scenario "${context}".`);
  }
  return bullets;
}

interface Scenario {
  id: string;
  title: string;
  doel: string;
  startpunt: string;
  opdracht: string;
  letOp: string[];
  neveneffect: string;
}

/** K1 wordt K-1, T3 wordt T-3, enzovoort. Eén prefix per rol. */
function normalizeId(rawId: string, context: string): string {
  const m = rawId.match(/^([KTA])(\d+)$/);
  if (!m) {
    throw new Error(
      `Onbekend scenario-ID formaat "${rawId}" bij "${context}". Verwacht K, T of A gevolgd door een nummer.`,
    );
  }
  return `${m[1]}-${m[2]}`;
}

function parseScenario(node: HeadingNode): Scenario {
  const m = node.title.match(/^([A-Za-z0-9.]+):\s*(.+)$/);
  if (!m) {
    throw new Error(
      `Kan scenario-heading niet parsen: "### ${node.title}". Verwacht formaat "ID: Titel".`,
    );
  }
  const [, rawId, title] = m;
  const id = normalizeId(rawId, node.title);
  return {
    id,
    title: stripMd(title.trim()),
    doel: extractField(node.body, "Doel", node.title),
    startpunt: extractField(node.body, "Startpunt", node.title),
    opdracht: extractField(node.body, "Opdracht", node.title),
    letOp: extractLetOp(node.body, node.title),
    neveneffect: extractField(node.body, "Neveneffect", node.title),
  };
}

function parseScenarioBlock(node: HeadingNode): Scenario[] {
  const scenarios = node.children.filter((c) => c.level === node.level + 1).map(parseScenario);
  if (scenarios.length === 0) {
    throw new Error(`Blok "${node.title}" bevat geen scenario's. Pas de md aan.`);
  }
  return scenarios;
}

function paragraphsOf(node: HeadingNode): string[] {
  const raw = node.body.join("\n");
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 0 && p !== "---")
    .map(stripMd);
}

/**
 * Body van een node als platte regels, in documentvolgorde: genummerde
 * items, bullets, sub-bullets en losse alinea's door elkaar. Vervangt de
 * eerdere aparte helpers die elk maar één vorm aankonden en die op de
 * blokken C en D telkens net iets lieten vallen.
 */
function flowOf(node: HeadingNode): string[] {
  const out: string[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      out.push(stripMd(paragraph.join(" ").trim()));
      paragraph = [];
    }
  }

  for (const line of node.body) {
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    const subBullet = line.match(/^\s{2,}-\s+(.*)$/);
    const bullet = line.match(/^-\s+(.*)$/);

    if (numbered) {
      flushParagraph();
      out.push(`${numbered[1]}. ${stripMd(numbered[2])}`);
    } else if (subBullet) {
      flushParagraph();
      out.push(`    - ${stripMd(subBullet[1])}`);
    } else if (bullet) {
      flushParagraph();
      out.push(`- ${stripMd(bullet[1])}`);
    } else if (line.trim().length === 0 || line.trim() === "---") {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();

  if (out.length === 0) {
    throw new Error(`Geen inhoud gevonden onder "${node.title}".`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markdown inlezen en structuur valideren
// ---------------------------------------------------------------------------

const markdown = fs.readFileSync(MD_PATH, "utf8");
const root = parseHeadingTree(markdown);
const h1 = findChild(root, 1, /^Review met Marlon/);

const introNode = findChild(h1, 2, /^Voor jij begint$/);
const feedbackNode = findChild(introNode, 3, /^Hoe je feedback geeft$/);

const blokKNode = findChild(h1, 2, /^Blok K:/);
const blokTNode = findChild(h1, 2, /^Blok T:/);
const blokANode = findChild(h1, 2, /^Blok A:/);
const blokCNode = findChild(h1, 2, /^Blok C:/);

const blokDNode = findChild(h1, 2, /^Blok D:/);
const blokDTestdataNode = findChild(blokDNode, 3, /^Testdata vooraf klaarzetten$/);
const blokDOpruimenNode = findChild(blokDNode, 3, /^Opruimen na afloop$/);
const blokDNietZelfstandigNode = findChild(blokDNode, 3, /^Niet zelfstandig/);

const scenariosK = parseScenarioBlock(blokKNode);
const scenariosT = parseScenarioBlock(blokTNode);
const scenariosA = parseScenarioBlock(blokANode);

interface RoleBlock {
  /** Tabbladnaam. */
  sheetName: string;
  /** Prefix van de genormaliseerde scenario-ID's, voor de zelfcontrole. */
  idPrefix: string;
  node: HeadingNode;
  scenarios: Scenario[];
}

const ROLE_BLOCKS: RoleBlock[] = [
  { sheetName: "Klant", idPrefix: "K-", node: blokKNode, scenarios: scenariosK },
  { sheetName: "Trainer", idPrefix: "T-", node: blokTNode, scenarios: scenariosT },
  { sheetName: "Admin", idPrefix: "A-", node: blokANode, scenarios: scenariosA },
];

for (const block of ROLE_BLOCKS) {
  const count = block.scenarios.length;
  if (count < 6 || count > 8) {
    throw new Error(
      `Blok "${block.node.title}" heeft ${count} scenario's; afgesproken is zes tot acht per rol.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Workbook opbouw
// ---------------------------------------------------------------------------

const COLOR = {
  headerBg: "FF0E0C0B",
  headerText: "FFF4EFE6",
};

const FONT_NAME = "Calibri";

const workbook = new ExcelJS.Workbook();
workbook.creator = "build-review-workbook.ts";
workbook.created = new Date(0); // vast, script mag niet van de systeemklok afhangen

const SCENARIO_COLUMNS = [
  { header: "ID", key: "id", width: 10 },
  { header: "Titel", key: "titel", width: 26 },
  { header: "Doel", key: "doel", width: 30 },
  { header: "Startpunt", key: "startpunt", width: 22 },
  { header: "Opdracht", key: "opdracht", width: 44 },
  { header: "Let op", key: "letop", width: 44 },
  { header: "Neveneffect", key: "neveneffect", width: 30 },
  { header: "Gelukt zonder hulp", key: "gelukt", width: 18 },
  { header: "Waar twijfelde je", key: "twijfel", width: 28 },
  { header: "Copy die niet klopt", key: "copy", width: 28 },
  { header: "Status", key: "status", width: 18 },
] as const;

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: FONT_NAME, bold: true, color: { argb: COLOR.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function addNarrativeRow(ws: ExcelJS.Worksheet, text: string, opts: { bold?: boolean; size?: number } = {}) {
  const row = ws.addRow([text]);
  const cell = row.getCell(1);
  cell.font = { name: FONT_NAME, bold: !!opts.bold, size: opts.size ?? 11 };
  cell.alignment = { vertical: "top", wrapText: true };
  return row;
}

function addScenarioRow(ws: ExcelJS.Worksheet, scenario: Scenario) {
  const letOpText = scenario.letOp.map((b) => `- ${b}`).join("\n");
  const row = ws.addRow({
    id: scenario.id,
    titel: scenario.title,
    doel: scenario.doel,
    startpunt: scenario.startpunt,
    opdracht: scenario.opdracht,
    letop: letOpText,
    neveneffect: scenario.neveneffect,
    gelukt: "",
    twijfel: "",
    copy: "",
    status: "Nog te doen",
  });

  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: FONT_NAME, size: 11 };
    cell.alignment = { vertical: "top", wrapText: true };
  });

  row.getCell("H").dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: ['"Ja,Nee,Deels"'],
  };
  row.getCell("K").dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Nog te doen,Klaar,Vraag voor Ilja"'],
  };
  return row;
}

function addRoleSheet(block: RoleBlock): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(block.sheetName);
  ws.columns = SCENARIO_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const headerRow = ws.addRow(SCENARIO_COLUMNS.map((c) => c.header));
  styleHeaderRow(headerRow);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const s of block.scenarios) addScenarioRow(ws, s);
  return ws;
}

// --- Tab 1: Start hier ------------------------------------------------------

const wsStart = workbook.addWorksheet("Start hier");
wsStart.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsStart, h1.title, { bold: true, size: 16 });
for (const p of paragraphsOf(introNode)) addNarrativeRow(wsStart, p);
addNarrativeRow(wsStart, feedbackNode.title, { bold: true, size: 13 });
for (const p of paragraphsOf(feedbackNode)) addNarrativeRow(wsStart, p);

// De blokintro's staan hier en niet als kopregel boven de roltabbladen,
// zodat elk roltabblad een schone tabel blijft met de kopregel op rij 1.
addNarrativeRow(wsStart, "De drie rollen", { bold: true, size: 13 });
for (const block of ROLE_BLOCKS) {
  addNarrativeRow(wsStart, `${block.node.title} (tabblad "${block.sheetName}")`, { bold: true });
  for (const p of paragraphsOf(block.node)) addNarrativeRow(wsStart, p);
}

// --- Tab 2 t/m 4: één per rol -----------------------------------------------

for (const block of ROLE_BLOCKS) addRoleSheet(block);

// --- Tab 5: Na 15 augustus ---------------------------------------------------

const wsC = workbook.addWorksheet("Na 15 augustus");
wsC.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsC, blokCNode.title, { bold: true, size: 16 });
for (const line of flowOf(blokCNode)) addNarrativeRow(wsC, line);

// --- Tab 6: Voor Ilja - niet invullen ----------------------------------------

const wsD = workbook.addWorksheet("Voor Ilja - niet invullen");
wsD.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsD, blokDNode.title, { bold: true, size: 16 });

for (const section of [blokDTestdataNode, blokDOpruimenNode, blokDNietZelfstandigNode]) {
  addNarrativeRow(wsD, section.title, { bold: true, size: 13 });
  for (const line of flowOf(section)) addNarrativeRow(wsD, line);
}

// ---------------------------------------------------------------------------
// Wegschrijven en direct terug inlezen ter controle
// ---------------------------------------------------------------------------

await workbook.xlsx.writeFile(OUT_PATH);

const check = new ExcelJS.Workbook();
await check.xlsx.readFile(OUT_PATH);

const expectedSheets = [
  "Start hier",
  "Klant",
  "Trainer",
  "Admin",
  "Na 15 augustus",
  "Voor Ilja - niet invullen",
];
for (const name of expectedSheets) {
  const sheet = check.getWorksheet(name);
  if (!sheet) throw new Error(`Tabblad "${name}" ontbreekt in het weggeschreven bestand.`);
}

function countScenarioIds(sheet: ExcelJS.Worksheet, prefix: string): number {
  let count = 0;
  sheet.eachRow((row) => {
    const v = row.getCell(1).value;
    if (typeof v === "string" && v.startsWith(prefix)) count++;
  });
  return count;
}

let total = 0;
for (const block of ROLE_BLOCKS) {
  const sheet = check.getWorksheet(block.sheetName)!;
  const found = countScenarioIds(sheet, block.idPrefix);
  if (found !== block.scenarios.length) {
    throw new Error(
      `Verwachtte ${block.scenarios.length} scenario's op tabblad "${block.sheetName}", vond ${found}.`,
    );
  }
  total += found;
}

console.log(`Geschreven: ${path.relative(REPO_ROOT, OUT_PATH)}`);
for (const block of ROLE_BLOCKS) {
  console.log(`${block.sheetName.padEnd(8)}: ${block.scenarios.length} scenario's`);
}
console.log(`Totaal: ${total} scenario's, alle tabbladen geverifieerd.`);
