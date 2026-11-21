import type { HpPageKey } from "../../src/lib/hormoonprofiel/slugs";
import type { HpPage } from "./types";
import { home } from "./home";
import { wat } from "./wat";
import { waarom } from "./waarom";
import { hoewerkt } from "./hoewerkt";
import { training } from "./training";
import { supplementen } from "./supplementen";
import { voeding } from "./voeding";
import { profielen } from "./profielen";
import { faq } from "./faq";
import { contact } from "./contact";

export const HP_PAGES: Readonly<Record<HpPageKey, HpPage>> = {
  home,
  wat,
  waarom,
  hoewerkt,
  training,
  supplementen,
  voeding,
  profielen,
  faq,
  contact,
};

export * from "./types";
export * from "./shared";
export { PROFILES, meetpuntText } from "./profielen-data";
export type { HpProfile } from "./profielen-data";
export { HOME_TRAJECT, HOME_WEL, HOME_NIET, HOME_META, HOME_FAQ, HOME_LEAD, HOME_PROFIELEN_INTRO, HOME_MARLON_INTRO } from "./home";
export { PROFIELEN_WARN_LEAD, PROFIELEN_WARN_REST } from "./profielen";
