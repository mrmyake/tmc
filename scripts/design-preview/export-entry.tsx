import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";

import { Container } from "@/components/layout/Container";
import { DashboardGreeting } from "@/app/app/_components/DashboardGreeting";
import { DashboardOnboarding } from "@/app/app/_components/DashboardOnboarding";
import { DashboardNextClass } from "@/app/app/_components/DashboardNextClass";
import { DashboardCredits } from "@/app/app/_components/DashboardCredits";
import { DashboardSchema } from "@/app/app/_components/DashboardSchema";
import { DashboardEntitlements } from "@/app/app/_components/DashboardEntitlements";

import { LightGreeting } from "@/app/app/preview-licht/_components/LightGreeting";
import { LightOnboarding } from "@/app/app/preview-licht/_components/LightOnboarding";
import { LightNextClass } from "@/app/app/preview-licht/_components/LightNextClass";
import { LightCredits } from "@/app/app/preview-licht/_components/LightCredits";
import { LightSchema } from "@/app/app/preview-licht/_components/LightSchema";
import { LightEntitlements } from "@/app/app/preview-licht/_components/LightEntitlements";

import { PREVIEW_STATES } from "./fake-data";
import type { DashboardData } from "@/app/app/_lib/dashboard-data";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "public", "preview");
const COMPILED_CSS_SOURCE = path.join(
  REPO_ROOT,
  ".next",
  "static",
  "chunks",
  "0y.902plpu~3f.css",
);

/** Mirrort src/app/app/page.tsx 1:1 — zelfde componentvolgorde, zelfde props. */
function renderDarkTree(data: DashboardData): React.ReactElement {
  if (data.kind === "onboarding") {
    return (
      <Container className="py-16 md:py-20">
        <DashboardOnboarding
          firstName={data.firstName}
          intakeDone={data.intakeDone}
        />
      </Container>
    );
  }
  return (
    <Container className="py-16 md:py-20">
      <DashboardGreeting
        salutation={data.greeting.salutation}
        firstName={data.greeting.firstName}
        initials={data.greeting.initials}
        subline={data.greeting.subline}
        planBadge={data.planBadge}
        statusLine={data.statusLine}
      />
      <DashboardNextClass session={data.nextSession} />
      <DashboardCredits credits={data.credits} />
      {data.schemaTeaser && <DashboardSchema {...data.schemaTeaser} />}
      <DashboardEntitlements
        rows={data.entitlements.rows}
        upsell={data.entitlements.upsell}
      />
    </Container>
  );
}

/** Mirrort src/app/app/preview-licht/page.tsx 1:1 — zelfde componentvolgorde, zelfde props. */
function renderLightTree(data: DashboardData): React.ReactElement {
  return (
    <div className="bg-[#F4EFE6] min-h-screen">
      <div className="mx-auto max-w-2xl lg:max-w-3xl px-5 md:px-10 py-12 md:py-16">
        {data.kind === "onboarding" ? (
          <LightOnboarding
            firstName={data.firstName}
            intakeDone={data.intakeDone}
          />
        ) : (
          <div className="flex flex-col gap-8 md:gap-10">
            <LightGreeting
              salutation={data.greeting.salutation}
              firstName={data.greeting.firstName}
              initials={data.greeting.initials}
              subline={data.greeting.subline}
              planBadge={data.planBadge}
              statusLine={data.statusLine}
            />
            <LightNextClass session={data.nextSession} />
            <LightCredits credits={data.credits} />
            {data.schemaTeaser && <LightSchema {...data.schemaTeaser} />}
            <LightEntitlements
              rows={data.entitlements.rows}
              upsell={data.entitlements.upsell}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SWITCHER_SCRIPT = `
(function () {
  var buttons = document.querySelectorAll("[data-preview-btn]");
  var panels = document.querySelectorAll("[data-preview-panel]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-preview-btn");
      buttons.forEach(function (b) { b.classList.remove("is-active"); });
      panels.forEach(function (p) { p.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var panel = document.querySelector('[data-preview-panel="' + target + '"]');
      if (panel) panel.classList.add("is-active");
    });
  });
})();
`.trim();

function buildDocument(opts: {
  title: string;
  variantLabel: string;
  bannerBg: string;
  bannerFg: string;
  bannerAccent: string;
  bodyBg: string;
  panelsHtml: { key: string; label: string; html: string }[];
}): string {
  const { title, variantLabel, bannerBg, bannerFg, bannerAccent, bodyBg, panelsHtml } = opts;

  const switcherButtons = panelsHtml
    .map(
      (p, i) => `<button type="button" data-preview-btn="${p.key}" class="preview-switcher__btn${i === 0 ? " is-active" : ""}">${escapeHtml(p.label)}</button>`,
    )
    .join("\n        ");

  const panels = panelsHtml
    .map(
      (p, i) =>
        `<div data-preview-panel="${p.key}" class="preview-panel${i === 0 ? " is-active" : ""}">\n${p.html}\n</div>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="nl" class="antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./design-preview.css">
<style>
  /*
    Font-koppeling: de echte app zet --font-playfair / --font-dm-sans via
    next/font (self-hosted .woff2, buiten bereik van deze losse export).
    Hier gekoppeld aan dezelfde Google Fonts-substitutie als de rest van
    de codebase (zie docs/design-system/DESIGN-SYSTEM.md en
    next-upgrade-migratie MIGRATION.md 1.3): omdat de Tailwind-classes
    letterlijk var(--font-playfair) aanroepen, is dit de enige regel die
    nodig is om dezelfde typografie te tonen.
  */
  :root {
    --font-playfair: 'Fraunces', "Canela", "GT Super", "Didot", "Bodoni 72", "Noto Serif", Georgia, serif;
    --font-dm-sans: 'Inter', "Söhne", "Söhne Buch", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  }

  /* ---- Preview-only chrome hieronder: GEEN onderdeel van het ontwerp zelf ---- */
  body { background: ${bodyBg}; margin: 0; }
  .preview-banner {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 20px;
    background: ${bannerBg};
    color: ${bannerFg};
    font-family: 'Inter', system-ui, sans-serif;
    border-bottom: 1px solid rgba(128,128,128,0.25);
  }
  .preview-banner__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    opacity: 0.7;
  }
  .preview-switcher {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .preview-switcher__btn {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid rgba(128,128,128,0.35);
    background: transparent;
    color: ${bannerFg};
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }
  .preview-switcher__btn:hover { border-color: ${bannerAccent}; }
  .preview-switcher__btn.is-active {
    background: ${bannerAccent};
    border-color: ${bannerAccent};
    color: ${bannerBg};
  }
  .preview-panel { display: none; }
  .preview-panel.is-active { display: block; }
</style>
</head>
<body>
  <div class="preview-banner">
    <span class="preview-banner__label">Designpreview met voorbeelddata &middot; ${escapeHtml(variantLabel)} &middot; geen echte ledeninformatie</span>
    <div class="preview-switcher" role="tablist">
        ${switcherButtons}
    </div>
  </div>
  ${panels}
  <script>${SWITCHER_SCRIPT}</script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cssContent = fs.readFileSync(COMPILED_CSS_SOURCE, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "design-preview.css"), cssContent, "utf8");

  const darkPanels = PREVIEW_STATES.map((s) => ({
    key: s.key,
    label: s.label,
    html: renderToStaticMarkup(renderDarkTree(s.data)),
  }));
  const lightPanels = PREVIEW_STATES.map((s) => ({
    key: s.key,
    label: s.label,
    html: renderToStaticMarkup(renderLightTree(s.data)),
  }));

  const darkHtml = buildDocument({
    title: "Designpreview — Leden-landing (donker) — The Movement Club",
    variantLabel: "Variant A, donker",
    bannerBg: "#17140F",
    bannerFg: "#F4EFE6",
    bannerAccent: "#B9986A",
    bodyBg: "#0E0C0B",
    panelsHtml: darkPanels,
  });

  const lightHtml = buildDocument({
    title: "Designpreview — Leden-landing (licht) — The Movement Club",
    variantLabel: "Variant B, licht",
    bannerBg: "#0E0C0B",
    bannerFg: "#F4EFE6",
    bannerAccent: "#B9986A",
    bodyBg: "#F4EFE6",
    panelsHtml: lightPanels,
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "leden-landing-donker.html"),
    darkHtml,
    "utf8",
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "leden-landing-licht.html"),
    lightHtml,
    "utf8",
  );

  console.log("Geschreven:");
  console.log(" -", path.join(OUT_DIR, "leden-landing-donker.html"));
  console.log(" -", path.join(OUT_DIR, "leden-landing-licht.html"));
  console.log(" -", path.join(OUT_DIR, "design-preview.css"));
}

main();
