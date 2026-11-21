import { test } from "node:test";
import assert from "node:assert/strict";
import { decideHormoonprofielRequest, decideTmcSection, HP_PATHS, HP_PAGE_KEYS, sectionPath } from "./load.mts";

type Mode = "standalone" | "redirect_temporary" | "redirect_permanent";
const MODES: Mode[] = ["standalone", "redirect_temporary", "redirect_permanent"];
const TMC = "https://www.themovementclub.nl";
const UTM = "?utm_source=hormoonprofiel&utm_medium=redirect";

function decide(mode: Mode, pathname: string, search = "", www = false) {
  return decideHormoonprofielRequest({ mode, pathname, search, www });
}
const status = (mode: Mode) => (mode === "redirect_temporary" ? 307 : 308);

// ---- De tien pagina's ------------------------------------------------------

for (const mode of MODES) {
  for (const key of HP_PAGE_KEYS) {
    const path = HP_PATHS[key];
    test(`${mode}: ${path} (${key})`, () => {
      const d = decide(mode, path);
      if (mode === "standalone") {
        assert.deepEqual(d, { kind: "rewrite", internalPath: path });
      } else {
        assert.deepEqual(d, {
          kind: "redirect",
          status: status(mode),
          location: `${TMC}${sectionPath(key)}${UTM}`,
        });
      }
    });
  }
}

test("standalone: pad met slash gaat in een hop naar de canonieke vorm", () => {
  assert.deepEqual(decide("standalone", "/wat-is-personal-hormonal-profiling/"), {
    kind: "redirect",
    status: 308,
    location: "https://hormoonprofiel.com/wat-is-personal-hormonal-profiling",
  });
  assert.equal(
    (decide("standalone", "/Voedingsrichtlijnen") as { location: string }).location,
    "https://hormoonprofiel.com/voedingsrichtlijnen",
  );
});

test("redirect-modi: pad met slash gaat direct naar TMC, nooit eerst een slash-hop", () => {
  for (const mode of ["redirect_temporary", "redirect_permanent"] as Mode[]) {
    const d = decide(mode, "/verschillende-hormoonprofielen/") as { status: number; location: string };
    assert.equal(d.status, status(mode));
    assert.equal(d.location, `${TMC}/hormoonprofiel/verschillende-hormoonprofielen${UTM}`);
  }
});

test("www: standalone gaat met 308 naar de apex, in een hop", () => {
  assert.deepEqual(decide("standalone", "/", "", true), {
    kind: "redirect",
    status: 308,
    location: "https://hormoonprofiel.com/",
  });
  assert.equal(
    (decide("standalone", "/veel-gestelde-vragen/", "", true) as { location: string }).location,
    "https://hormoonprofiel.com/veel-gestelde-vragen",
  );
  assert.equal(
    (decide("standalone", "/winkelwagen", "", true) as { location: string }).location,
    "https://hormoonprofiel.com/",
  );
});

test("www in een redirect-modus gaat direct naar TMC (een hop)", () => {
  const d = decide("redirect_permanent", "/", "", true) as { location: string };
  assert.equal(d.location, `${TMC}/hormoonprofiel${UTM}`);
});

// ---- Oude shop- en restpagina's -------------------------------------------

const TO_HOEWERKT = ["/product/hormonen-in-balans", "/hormonen-in-balans", "/product/hormonen-in-balans/"];
const TO_HOME = [
  "/winkelwagen", "/test-shop", "/payment-failed", "/payment-confirmation", "/shop-2",
  "/shop", "/afrekenen", "/mijn-account", "/product/iets-anders", "/product-categorie/x",
  "/product-categorie/x/y", "/product-tag/z",
];
const TO_TRAINING = ["/trainen-op-basis-van-hormoonprofiel"];
const GONE = [
  "/our-process", "/contact-sidebar", "/contact-minimal", "/contact-creative", "/contact-classic",
  "/pricing-classic", "/pricing-minimal", "/services-classic", "/services-3", "/portfolios",
  "/portfolios/masonry-minimal-portfolio-3-columns", "/wp-admin", "/wp-admin/admin-ajax.php",
  "/wp-login.php", "/wp-content/uploads/x.jpg", "/wp-includes/js/x.js", "/xmlrpc.php", "/feed",
  "/feed/", "/feed/atom", "/comments/feed", "/comments/feed/",
];

for (const mode of MODES) {
  for (const path of TO_HOEWERKT) {
    test(`${mode}: ${path} naar hoe-werkt`, () => {
      const d = decide(mode, path) as { status: number; location: string };
      assert.equal(d.status, mode === "standalone" ? 308 : status(mode));
      assert.equal(
        d.location,
        mode === "standalone"
          ? "/hoe-werkt-personal-hormonal-profiling"
          : `${TMC}/hormoonprofiel/hoe-werkt-personal-hormonal-profiling${UTM}`,
      );
    });
  }
  for (const path of TO_TRAINING) {
    test(`${mode}: ${path} naar training`, () => {
      const d = decide(mode, path) as { status: number; location: string };
      assert.equal(d.status, mode === "standalone" ? 308 : status(mode));
      assert.equal(
        d.location,
        mode === "standalone"
          ? "/het-belang-van-hormoontraining"
          : `${TMC}/hormoonprofiel/het-belang-van-hormoontraining${UTM}`,
      );
    });
  }
  for (const path of TO_HOME) {
    test(`${mode}: ${path} naar de home`, () => {
      const d = decide(mode, path) as { status: number; location: string };
      assert.equal(d.status, mode === "standalone" ? 308 : status(mode));
      assert.equal(d.location, mode === "standalone" ? "/" : `${TMC}/hormoonprofiel${UTM}`);
    });
  }
  for (const path of GONE) {
    test(`${mode}: ${path} is 410`, () => {
      assert.deepEqual(decide(mode, path), { kind: "gone" });
      assert.deepEqual(decide(mode, path, "", true), { kind: "gone" });
    });
  }
  for (const search of ["?add-to-cart=12", "?p=99", "?foo=1&add-to-cart=3"]) {
    test(`${mode}: ${search} gaat naar de home`, () => {
      const d = decide(mode, "/wat-is-personal-hormonal-profiling", search) as {
        status: number;
        location: string;
      };
      assert.equal(d.status, mode === "standalone" ? 308 : status(mode));
      assert.equal(d.location, mode === "standalone" ? "/" : `${TMC}/hormoonprofiel${UTM}`);
    });
  }
}

test("andere queryparameters blijven gewoon een pagina", () => {
  assert.equal(decide("standalone", "/veel-gestelde-vragen", "?utm_source=x").kind, "rewrite");
});

// ---- Onbekend, technisch, assets ------------------------------------------

test("standalone: onbekend pad geeft de eigen 404", () => {
  assert.deepEqual(decide("standalone", "/bestaat-niet"), { kind: "notfound", internalPath: "/bestaat-niet" });
  assert.equal(decide("standalone", "/hp-site/x").kind, "notfound");
});

test("redirect-modi: onbekend pad valt terug op de sectie-home", () => {
  for (const mode of ["redirect_temporary", "redirect_permanent"] as Mode[]) {
    assert.deepEqual(decide(mode, "/bestaat-niet"), {
      kind: "redirect",
      status: status(mode),
      location: `${TMC}/hormoonprofiel${UTM}`,
    });
  }
});

test("standalone: assets en de formulier-API gaan door", () => {
  for (const p of ["/_next/static/x.js", "/hp-assets/favicon.svg", "/api/leads/hormoonprofiel", "/.well-known/x"]) {
    assert.deepEqual(decide("standalone", p), { kind: "passthrough" }, p);
  }
});

test("technische bestanden: eigen route in standalone, TMC zonder UTM in redirect-modi", () => {
  assert.deepEqual(decide("standalone", "/robots.txt"), { kind: "rewrite", internalPath: "/robots.txt" });
  assert.deepEqual(decide("standalone", "/sitemap.xml"), { kind: "rewrite", internalPath: "/sitemap.xml" });
  assert.deepEqual(decide("standalone", "/wp-sitemap.xml"), { kind: "rewrite", internalPath: "/sitemap.xml" });
  assert.deepEqual(decide("redirect_permanent", "/sitemap.xml"), {
    kind: "redirect", status: 308, location: `${TMC}/sitemap.xml`,
  });
  assert.deepEqual(decide("redirect_temporary", "/robots.txt"), {
    kind: "redirect", status: 307, location: `${TMC}/robots.txt`,
  });
});

// ---- De sectie op TMC -------------------------------------------------------

test("TMC-sectie: standalone stuurt met 307 naar hormoonprofiel.com", () => {
  assert.deepEqual(decideTmcSection("standalone", "/hormoonprofiel"), {
    kind: "redirect", status: 307, location: "https://hormoonprofiel.com/",
  });
  assert.deepEqual(decideTmcSection("standalone", "/hormoonprofiel/voedingsrichtlijnen"), {
    kind: "redirect", status: 307, location: "https://hormoonprofiel.com/voedingsrichtlijnen",
  });
  assert.deepEqual(decideTmcSection("standalone", "/hormoonprofiel/voedingsrichtlijnen/"), {
    kind: "redirect", status: 307, location: "https://hormoonprofiel.com/voedingsrichtlijnen",
  });
});

test("TMC-sectie: redirect-modi tonen de sectie; slash gaat in een hop naar de canonieke vorm", () => {
  for (const mode of ["redirect_temporary", "redirect_permanent"] as Mode[]) {
    assert.deepEqual(decideTmcSection(mode, "/hormoonprofiel"), { kind: "serve" });
    assert.deepEqual(decideTmcSection(mode, "/hormoonprofiel/voedingsrichtlijnen"), { kind: "serve" });
    assert.deepEqual(decideTmcSection(mode, "/hormoonprofiel/voedingsrichtlijnen/"), {
      kind: "redirect", status: 308, location: `${TMC}/hormoonprofiel/voedingsrichtlijnen`,
    });
  }
});
