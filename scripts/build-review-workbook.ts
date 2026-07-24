#!/usr/bin/env node
/**
 * Leest review-scenarios-marlon.md en genereert review-scenarios-marlon.xlsx.
 * De markdown blijft de enige bron voor scenariotekst; de xlsx is een
 * wegwerp-artefact, opnieuw te bouwen met `npm run build:review-workbook`.
 * Doelplatform is Google Sheets: geen beveiligde bereiken, geen notities,
 * geen macro's, geen exotische formules.
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

function normalizeId(rawId: string, context: string): string {
  let m = rawId.match(/^A0\.(\d+)$/);
  if (m) return `A0-${m[1]}`;
  m = rawId.match(/^A(\d+)$/);
  if (m) return `A-${m[1]}`;
  m = rawId.match(/^B(\d+)$/);
  if (m) return `B-${m[1]}`;
  throw new Error(`Onbekend scenario-ID formaat "${rawId}" bij "${context}". Pas de md aan.`);
}

function parseScenario(node: HeadingNode): Scenario {
  const m = node.title.match(/^([A-Za-z0-9.]+):\s*(.+)$/);
  if (!m) {
    throw new Error(
      `Kan scenario-heading niet parsen: "#### ${node.title}". Verwacht formaat "ID: Titel".`,
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

function bulletsOf(node: HeadingNode): string[] {
  return node.body
    .filter((l) => /^-\s+/.test(l))
    .map((l) => stripMd(l.replace(/^-\s+/, "")));
}

interface PrepItem {
  text: string;
  subItems: string[];
}

function numberedWithSubBullets(node: HeadingNode): PrepItem[] {
  const items: PrepItem[] = [];
  for (const line of node.body) {
    const top = line.match(/^\d+\.\s+(.*)$/);
    const sub = line.match(/^\s{2,}-\s+(.*)$/);
    if (top) {
      items.push({ text: stripMd(top[1]), subItems: [] });
    } else if (sub) {
      if (items.length === 0) {
        throw new Error(`Sub-bullet zonder bovenliggend genummerd item: "${line}".`);
      }
      items[items.length - 1].subItems.push(stripMd(sub[1]));
    }
  }
  if (items.length === 0) {
    throw new Error(`Geen genummerde items gevonden onder "${node.title}".`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Markdown inlezen en structuur valideren
// ---------------------------------------------------------------------------

const markdown = fs.readFileSync(MD_PATH, "utf8");
const root = parseHeadingTree(markdown);
const h1 = findChild(root, 1, /^Review met Marlon/);

const introNode = findChild(h1, 2, /^Voor jij begint$/);
const feedbackNode = findChild(introNode, 3, /^Hoe je feedback geeft$/);

const sessie1Node = findChild(h1, 2, /^Sessie 1:/);
const blokA0Node = findChild(sessie1Node, 3, /^Blok A0:/);
const blokANode = findChild(sessie1Node, 3, /^Blok A:/);

const sessie2Node = findChild(h1, 2, /^Sessie 2:/);
const blokBNode = findChild(sessie2Node, 3, /^Blok B:/);

const blokCNode = findChild(h1, 2, /^Blok C:/);

const blokDNode = findChild(h1, 2, /^Blok D:/);
const blokDTestdataNode = findChild(blokDNode, 3, /^Testdata vooraf klaarzetten$/);
const blokDOpruimenNode = findChild(blokDNode, 3, /^Opruimen na afloop$/);
const blokDNietZelfstandigNode = findChild(blokDNode, 3, /^Niet zelfstandig/);

const scenariosA0 = parseScenarioBlock(blokA0Node);
const scenariosA = parseScenarioBlock(blokANode);
const scenariosB = parseScenarioBlock(blokBNode);

// ---------------------------------------------------------------------------
// Workbook opbouw
// ---------------------------------------------------------------------------

const COLOR = {
  headerBg: "FF0E0C0B",
  headerText: "FFF4EFE6",
  blockBg: "FFB9986A",
  blockText: "FF000000",
  answerBg: "FFFBF7EF",
  doneRowBg: "FFE0E0E0",
  safeGreen: "FFD9EAD3",
  reversibleAmber: "FFFCE8B2",
  irreversibleRed: "FFF4C7C3",
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

function estimateRowHeight(fields: string[], colWidths: number[]): number {
  let maxLines = 1;
  fields.forEach((text, i) => {
    const width = colWidths[i] || 30;
    const lines = text
      .split("\n")
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / width)), 0);
    maxLines = Math.max(maxLines, lines);
  });
  return Math.min(320, Math.max(30, maxLines * 15 + 8));
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: FONT_NAME, bold: true, color: { argb: COLOR.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 26;
}

function addBlockHeaderRow(ws: ExcelJS.Worksheet, title: string, lastCol: string) {
  const row = ws.addRow([title]);
  ws.mergeCells(`A${row.number}:${lastCol}${row.number}`);
  const cell = row.getCell(1);
  cell.font = { name: FONT_NAME, bold: true, color: { argb: COLOR.blockText }, size: 12 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.blockBg } };
  cell.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
  row.height = 22;
  return row;
}

function addNarrativeRow(ws: ExcelJS.Worksheet, text: string, opts: { bold?: boolean } = {}) {
  const row = ws.addRow([text]);
  const cell = row.getCell(1);
  cell.font = { name: FONT_NAME, bold: !!opts.bold, size: 11 };
  cell.alignment = { vertical: "top", wrapText: true };
  row.height = estimateRowHeight([text], [100]);
  return row;
}

function addScenarioRow(ws: ExcelJS.Worksheet, scenario: Scenario, isA0: boolean) {
  const letOpText = scenario.letOp.map((b) => `- ${b}`).join("\n");
  const copyValue = isA0 ? "→ via Vercel Comments" : "";
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
    copy: copyValue,
    status: "Nog te doen",
  });

  const colWidths = SCENARIO_COLUMNS.map((c) => c.width);
  row.height = estimateRowHeight(
    [scenario.doel, scenario.startpunt, scenario.opdracht, letOpText, scenario.neveneffect],
    [colWidths[2], colWidths[3], colWidths[4], colWidths[5], colWidths[6]],
  );

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: FONT_NAME, size: 11 };
    cell.alignment = { vertical: "top", wrapText: true };
    if (colNumber >= 8) {
      // H t/m K: antwoordkolommen
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.answerBg } };
    }
  });

  const rn = row.number;
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
  void rn;
  return row;
}

function setupScenarioSheet(ws: ExcelJS.Worksheet) {
  ws.columns = SCENARIO_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const headerRow = ws.addRow(SCENARIO_COLUMNS.map((c) => c.header));
  styleHeaderRow(headerRow);
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addConditionalFormattingToScenarioSheet(ws: ExcelJS.Worksheet, lastRow: number) {
  const ref = `A2:K${lastRow}`;

  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "expression",
        formulae: ['LEFT($G2,6)="veilig"'],
        priority: 1,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.safeGreen } } },
      },
      {
        type: "expression",
        formulae: ['LEFT($G2,17)="terug te draaien"'],
        priority: 2,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.reversibleAmber } },
        },
      },
      {
        type: "expression",
        formulae: ['LEFT($G2,12)="onomkeerbaar"'],
        priority: 3,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.irreversibleRed } } },
      },
    ],
  });

  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "expression",
        formulae: ['$K2="Klaar"'],
        priority: 4,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.doneRowBg } } },
      },
    ],
  });

  ws.addConditionalFormatting({
    ref: `B2:B${lastRow}`,
    rules: [
      {
        type: "expression",
        formulae: ['$K2="Klaar"'],
        priority: 5,
        style: { font: { name: FONT_NAME, strike: true } },
      },
    ],
  });
}

// --- Tab 1: Start hier ------------------------------------------------------

const wsStart = workbook.addWorksheet("Start hier");
wsStart.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsStart, h1.title, { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 16,
};
for (const p of paragraphsOf(introNode)) addNarrativeRow(wsStart, p);
addNarrativeRow(wsStart, feedbackNode.title, { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 13,
};
for (const p of paragraphsOf(feedbackNode)) addNarrativeRow(wsStart, p);

addNarrativeRow(wsStart, "De twee sessies", { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 13,
};
addNarrativeRow(wsStart, sessie1Node.title, { bold: true });
for (const p of paragraphsOf(sessie1Node)) addNarrativeRow(wsStart, p);
addNarrativeRow(wsStart, sessie2Node.title, { bold: true });
for (const p of paragraphsOf(blokBNode)) addNarrativeRow(wsStart, p);

// --- Tab 2: Sessie 1 - alleen ----------------------------------------------

const wsSessie1 = workbook.addWorksheet("Sessie 1 - alleen");
setupScenarioSheet(wsSessie1);
addBlockHeaderRow(wsSessie1, `Blok A0: ${blokA0Node.title.replace(/^Blok A0:\s*/, "")}`, "K");
for (const p of paragraphsOf(blokA0Node)) addNarrativeRow(wsSessie1, p);
for (const s of scenariosA0) addScenarioRow(wsSessie1, s, true);
addBlockHeaderRow(wsSessie1, `Blok A: ${blokANode.title.replace(/^Blok A:\s*/, "")}`, "K");
for (const p of paragraphsOf(blokANode)) addNarrativeRow(wsSessie1, p);
for (const s of scenariosA) addScenarioRow(wsSessie1, s, false);
addConditionalFormattingToScenarioSheet(wsSessie1, wsSessie1.rowCount);

// --- Tab 3: Sessie 2 - samen -------------------------------------------------

const wsSessie2 = workbook.addWorksheet("Sessie 2 - samen");
setupScenarioSheet(wsSessie2);
addBlockHeaderRow(wsSessie2, `Blok B: ${blokBNode.title.replace(/^Blok B:\s*/, "")}`, "K");
const waarschuwing = addNarrativeRow(wsSessie2, paragraphsOf(blokBNode).join("\n\n"), {
  bold: true,
});
waarschuwing.font = { name: FONT_NAME, bold: true, size: 11, color: { argb: "FF7A1F13" } };
for (const s of scenariosB) addScenarioRow(wsSessie2, s, false);
addConditionalFormattingToScenarioSheet(wsSessie2, wsSessie2.rowCount);

// --- Tab 4: Na 15 augustus ---------------------------------------------------

const wsC = workbook.addWorksheet("Na 15 augustus");
wsC.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsC, blokCNode.title, { bold: true }).font = { name: FONT_NAME, bold: true, size: 16 };
const blokCParagraphs = paragraphsOf(blokCNode);
const blokCBullets = bulletsOf(blokCNode);
// Eerste blok tekst = alles vóór de bullets, laatste paragraaf = alles erna.
// paragraphsOf voegt aaneengesloten bullet-regels samen tot één blok, dus
// we splitsen dat blok hier expliciet in losse regels.
for (const p of blokCParagraphs) {
  if (blokCBullets.every((b) => p.includes(b))) {
    for (const b of blokCBullets) addNarrativeRow(wsC, `- ${b}`);
  } else {
    addNarrativeRow(wsC, p);
  }
}

// --- Tab 5: Voor Ilja - niet invullen ----------------------------------------

const wsD = workbook.addWorksheet("Voor Ilja - niet invullen");
wsD.columns = [{ key: "text", width: 100 }];
addNarrativeRow(wsD, blokDNode.title, { bold: true }).font = { name: FONT_NAME, bold: true, size: 16 };

addNarrativeRow(wsD, blokDTestdataNode.title, { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 13,
};
for (const item of numberedWithSubBullets(blokDTestdataNode)) {
  addNarrativeRow(wsD, item.text, { bold: false });
  for (const sub of item.subItems) addNarrativeRow(wsD, `    - ${sub}`);
}

addNarrativeRow(wsD, blokDOpruimenNode.title, { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 13,
};
for (const b of bulletsOf(blokDOpruimenNode)) addNarrativeRow(wsD, `- ${b}`);

addNarrativeRow(wsD, blokDNietZelfstandigNode.title, { bold: true }).font = {
  name: FONT_NAME,
  bold: true,
  size: 13,
};
for (const b of bulletsOf(blokDNietZelfstandigNode)) addNarrativeRow(wsD, `- ${b}`);

// ---------------------------------------------------------------------------
// Wegschrijven en direct terug inlezen ter controle
// ---------------------------------------------------------------------------

await workbook.xlsx.writeFile(OUT_PATH);

const check = new ExcelJS.Workbook();
await check.xlsx.readFile(OUT_PATH);

const expectedSheets = [
  "Start hier",
  "Sessie 1 - alleen",
  "Sessie 2 - samen",
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

const sheetSessie1 = check.getWorksheet("Sessie 1 - alleen")!;
const sheetSessie2 = check.getWorksheet("Sessie 2 - samen")!;
const foundA0 = countScenarioIds(sheetSessie1, "A0-");
const foundA = countScenarioIds(sheetSessie1, "A-");
const foundB = countScenarioIds(sheetSessie2, "B-");

if (foundA0 !== scenariosA0.length) {
  throw new Error(`Verwachtte ${scenariosA0.length} A0-scenario's in de xlsx, vond ${foundA0}.`);
}
if (foundA !== scenariosA.length) {
  throw new Error(`Verwachtte ${scenariosA.length} A-scenario's in de xlsx, vond ${foundA}.`);
}
if (foundB !== scenariosB.length) {
  throw new Error(`Verwachtte ${scenariosB.length} B-scenario's in de xlsx, vond ${foundB}.`);
}

console.log(`Geschreven: ${path.relative(REPO_ROOT, OUT_PATH)}`);
console.log(`Blok A0 (Sessie 1 - alleen): ${foundA0} scenario's`);
console.log(`Blok A  (Sessie 1 - alleen): ${foundA} scenario's`);
console.log(`Blok B  (Sessie 2 - samen):  ${foundB} scenario's`);
console.log(`Totaal: ${foundA0 + foundA + foundB} scenario's, alle tabbladen geverifieerd.`);
