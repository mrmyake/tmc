import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const profielen: HpPage = {
  key: "profielen",
  topic: "De 6 hormoonprofielen",
  metaDescription:
    "Insuline, cortisol, oestrogeen, groeihormoon, schildklier en testosteron: wat elk hormoon doet, waar mensen mee komen en wat je zelf kunt doen.",
  h1: "De 6 hormoonprofielen",
  eyebrow: "Profielen",
  inHetKort:
    "Personal Hormonal Profiling werkt met zes profielen: insuline, cortisol, oestrogeen, groeihormoon, schildklier en testosteron. Je profiel laat zien waar je plan de meeste winst geeft. Per profiel lees je wat het hormoon doet, waar mensen mee komen en wat je zelf kunt doen.",
  blocks: [],
  related: ["hoewerkt", "training", "voeding"],
  dateModified: DATE_MODIFIED,
};

export const PROFIELEN_WARN_LEAD = "Herken je jezelf hieronder?";
export const PROFIELEN_WARN_REST =
  "Dat zegt nog niets over je gezondheid. De signalen zijn voorbeelden, geen symptomen. Heb je klachten, ga dan naar je huisarts.";
