import { formatDateLong } from "@/lib/format-date";
import {
  creditDots,
  initialsOf,
  resolveStatusLine,
  resolveStatusLineDisplay,
} from "@/app/app/_lib/dashboard";
import { CREDIT_TYPE_LABELS } from "@/app/app/producten/lib";
import type {
  DashboardCreditCard,
  DashboardData,
} from "@/app/app/_lib/dashboard-data";

/**
 * Vijf ledenstaten met gedeelde, vaste voorbeelddata (fictieve persoon
 * "Fleur de Boer", geen echt lid) voor de design-preview export. Beide
 * varianten (donker/licht) consumeren exact deze array, zodat de
 * vergelijking eerlijk is. Waar mogelijk hergebruikt dit de echte
 * copy-derivatie uit _lib/dashboard.ts (resolveStatusLine,
 * resolveStatusLineDisplay, creditDots) in plaats van tekst te
 * herschrijven, zodat de preview niet kan afwijken van de echte copy.
 */

const FIRST_NAME = "Fleur";
const LAST_NAME = "de Boer";
const INITIALS = initialsOf(FIRST_NAME, LAST_NAME);

// Vaste datum/tijd (geen "vandaag"-afhankelijkheid): DashboardNextClass
// toont alleen dag/maand/tijd, geen relatieve labels, dus een vaste
// datum blijft voor altijd correct leesbaar.
const NEXT_SESSION_START = new Date("2026-07-14T07:00:00.000Z"); // 09:00 Amsterdam (zomertijd)
const NEXT_SESSION_END = new Date("2026-07-14T07:45:00.000Z"); // 09:45 Amsterdam

export interface PreviewState {
  key: string;
  label: string;
  data: DashboardData;
}

const volledigCredits: DashboardCreditCard[] = [
  {
    id: "preview-pt",
    typeName: CREDIT_TYPE_LABELS.pt.name,
    typeSub: CREDIT_TYPE_LABELS.pt.sub,
    remaining: 6,
    total: 10,
    dots: creditDots(6, 10),
    nudgeText: null,
    buttonLabel: "Extra sessies kopen",
    validityText: "Geen vervaldatum",
  },
];

const saldo0Credits: DashboardCreditCard[] = [
  {
    id: "preview-strippenkaart",
    typeName: CREDIT_TYPE_LABELS.strippenkaart.name,
    typeSub: CREDIT_TYPE_LABELS.strippenkaart.sub,
    remaining: 0,
    total: 10,
    dots: creditDots(0, 10),
    // Zelfde tekst als de (niet-geëxporteerde) nudgeText() in
    // _lib/dashboard-data.ts voor remaining === 0. // COPY: akkoord Marlon 2026-07-12
    nudgeText: "Je tegoed is op. Koop een nieuwe kaart om weer te boeken.",
    buttonLabel: "Nieuwe kaart kopen",
    validityText: `Geldig tot ${formatDateLong(new Date("2026-11-12T00:00:00"))}`,
  },
];

export const PREVIEW_STATES: PreviewState[] = [
  {
    key: "volledig",
    label: "Volledig",
    data: {
      kind: "dashboard",
      greeting: {
        salutation: "Goeiemiddag",
        firstName: FIRST_NAME,
        initials: INITIALS,
        subline: "Klaar voor je volgende sessie.",
      },
      planBadge: "All Access Onbeperkt + Personal Training",
      statusLine: resolveStatusLineDisplay(
        resolveStatusLine({
          status: "active",
          billing_cycle_weeks: 4,
          commit_end_date: "2028-01-01",
          pause_effective_date: null,
          cancellation_effective_date: null,
        }),
      ),
      nextSession: {
        startAt: NEXT_SESSION_START,
        endAt: NEXT_SESSION_END,
        className: "Kettlebell Flow",
        trainerName: "Marlon",
      },
      credits: volledigCredits,
      schemaTeaser: {
        title: "Kracht & Mobiliteit",
        nextWorkoutLabel: "Dag B - Onderlichaam",
        exerciseCount: 5,
        lastLoggedText: "2 dagen geleden",
      },
      entitlements: {
        rows: [
          {
            title: "Groepslessen",
            description: "Yoga, mobility en kettlebell",
            value: "Onbeperkt",
          },
          {
            title: "Vrij Trainen",
            description: "Altijd inbegrepen",
            value: "Onbeperkt",
          },
          {
            title: "Verlengde toegang",
            description: "Ook buiten openingstijden naar binnen",
            value: "06:00 tot 23:00",
          },
          {
            title: "Personal Training",
            description: "1-op-1 met Marlon",
            value: "Actief",
          },
          {
            title: "Trainingsschema",
            description: "Jouw persoonlijke protocol",
            value: "Actief",
          },
        ],
        upsell: {
          title: "Duo Training",
          description: "Samen trainen. Jij neemt iemand mee.",
          cta: "Bekijk",
          href: "/app/producten",
        },
      },
    },
  },
  {
    key: "onboarding",
    label: "Onboarding",
    data: {
      kind: "onboarding",
      firstName: FIRST_NAME,
      intakeDone: false,
    },
  },
  {
    key: "betaling-mislukt",
    label: "Betaling mislukt",
    data: {
      kind: "dashboard",
      greeting: {
        salutation: "Goeiemiddag",
        firstName: FIRST_NAME,
        initials: INITIALS,
        subline: "Fijn dat je er weer bent.",
      },
      planBadge: "Groepslessen 3x per week",
      statusLine: resolveStatusLineDisplay(
        resolveStatusLine({
          status: "payment_failed",
          billing_cycle_weeks: 4,
          commit_end_date: null,
          pause_effective_date: null,
          cancellation_effective_date: null,
        }),
      ),
      nextSession: null,
      credits: [],
      schemaTeaser: null,
      entitlements: {
        rows: [
          {
            title: "Groepslessen",
            description: "Yoga, mobility en kettlebell",
            value: "3x per week",
          },
        ],
        upsell: {
          title: "Duo Training",
          description: "Samen trainen. Jij neemt iemand mee.",
          cta: "Bekijk",
          href: "/app/producten",
        },
      },
    },
  },
  {
    key: "saldo-0",
    label: "Saldo 0",
    data: {
      kind: "dashboard",
      greeting: {
        salutation: "Goeiemiddag",
        firstName: FIRST_NAME,
        initials: INITIALS,
        subline: "Fijn dat je er weer bent.",
      },
      planBadge: null,
      statusLine: null,
      nextSession: null,
      credits: saldo0Credits,
      schemaTeaser: null,
      entitlements: { rows: [], upsell: null },
    },
  },
  {
    key: "gepauzeerd",
    label: "Gepauzeerd",
    data: {
      kind: "dashboard",
      greeting: {
        salutation: "Goeiemiddag",
        firstName: FIRST_NAME,
        initials: INITIALS,
        subline: "Fijn dat je er weer bent.",
      },
      planBadge: "All Access 3x per week",
      statusLine: resolveStatusLineDisplay(
        resolveStatusLine({
          status: "paused",
          billing_cycle_weeks: 4,
          commit_end_date: null,
          pause_effective_date: "2026-06-15",
          cancellation_effective_date: null,
        }),
      ),
      nextSession: null,
      credits: [],
      schemaTeaser: null,
      entitlements: {
        rows: [
          {
            title: "Groepslessen",
            description: "Yoga, mobility en kettlebell",
            value: "3x per week",
          },
          {
            title: "Vrij Trainen",
            description: "Altijd inbegrepen",
            value: "3x per week",
          },
        ],
        upsell: null,
      },
    },
  },
];
