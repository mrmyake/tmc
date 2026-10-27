import type * as React from "react";
import AccountDeleted from "./account_deleted";
import BookingCancelled from "./booking_cancelled";
import BookingConfirmation from "./booking_confirmation";
import BookingReminder from "./booking_reminder";
import GuestConfirmation from "./guest_confirmation";
import GuestSessionCancelled from "./guest_session_cancelled";
import IntakeConfirmation from "./intake_confirmation";
import IntakeReminder from "./intake_reminder";
import InvoiceReady from "./invoice_ready";
import OrderConfirmation from "./order_confirmation";
import PaymentFailed from "./payment_failed";
import PaymentRequest from "./payment_request";
import PtCancellationOutcome from "./pt_cancellation_outcome";
import PtCancellationRequest from "./pt_cancellation_request";
import PtTrainerChange from "./pt_trainer_change";
import SessionCancelledByAdmin from "./session_cancelled_by_admin";
import SessionRescheduled from "./session_rescheduled";
import TrialBookingCancelledByStudio from "./trial_booking_cancelled_by_studio";
import TrialCodeAbuseAlert from "./trial_code_abuse_alert";
import TrialCodeConfirmation from "./trial_code_confirmation";
import VisitorSessionRescheduled from "./visitor_session_rescheduled";
import WaitlistPromoted from "./waitlist_promoted";

/**
 * Centrale lijst van alle mailtemplates in src/emails/. De test en
 * `scripts/check-emails.mts` renderen elke entry met zijn fixture en toetsen
 * de HTML aan de linkregels (lint.ts). Ze falen ook als er een
 * `src/emails/*.tsx` is (behalve bestanden die met `_` beginnen) zonder entry
 * hier: een nieuwe template voeg je dus altijd hier toe.
 *
 * `id` is de bestandsnaam zonder extensie. Heeft een template varianten die
 * andere HTML opleveren (andere knop, andere tekst), registreer dan één entry
 * per variant met dezelfde `id` en een `variant`-label.
 *
 * `staff: true` markeert mails die naar staf gaan en bewust zonder reply-to
 * verzonden worden (`replyTo: null` bij de aanroep).
 */
export interface EmailRegistryEntry {
  id: string;
  variant?: string;
  /** Onderwerp zoals het bij de aanroep wordt gebruikt; voor send-test-emails. */
  subject: string;
  staff?: boolean;
  render: () => React.ReactElement;
}

const SITE = "https://www.themovementclub.nl";
const WHEN = "woensdag 23 april · 06:30 – 07:30";

function entry<P extends object>(
  id: string,
  subject: string,
  component: (props: P) => React.ReactElement,
  fixture: P,
  extra: { variant?: string; staff?: boolean } = {},
): EmailRegistryEntry {
  return { id, subject, ...extra, render: () => component(fixture) };
}

const orderCommon = {
  firstName: "Anna",
  productName: "Strength Club",
  paidEuro: "€79,00",
  paidVatEuro: "€6,52",
  vatRateLabel: "9%",
  siteUrl: SITE,
};

export const emailRegistry: EmailRegistryEntry[] = [
  entry("account_deleted", "Je account bij The Movement Club is verwijderd", AccountDeleted, {
    siteUrl: SITE,
  }),
  entry("booking_cancelled", "Geannuleerd: Strength Club", BookingCancelled, {
    firstName: "Anna",
    className: "Strength Club",
    whenLabel: WHEN,
    withinWindow: true,
    lateMessage: "Het tegoed is niet teruggezet.",
    siteUrl: SITE,
  }, { variant: "binnen venster" }),
  entry("booking_cancelled", "Geannuleerd: Strength Club", BookingCancelled, {
    firstName: "Anna",
    className: "Strength Club",
    whenLabel: WHEN,
    withinWindow: false,
    lateMessage: "Het tegoed is niet teruggezet.",
    siteUrl: SITE,
  }, { variant: "op tijd" }),
  entry("booking_confirmation", "Bevestigd: Strength Club woensdag", BookingConfirmation, {
    firstName: "Anna",
    className: "Strength Club",
    trainerName: "Marlon",
    whenLabel: WHEN,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    siteUrl: SITE,
  }),
  entry("booking_reminder", "Morgen: Strength Club", BookingReminder, {
    firstName: "Anna",
    className: "Strength Club",
    trainerName: "Marlon",
    whenLabel: WHEN,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    siteUrl: SITE,
  }),
  entry("guest_confirmation", "Je staat op de lijst: Strength Club bij The Movement Club", GuestConfirmation, {
    guestFirstName: "Sanne",
    memberFirstName: "Anna",
    className: "Strength Club",
    trainerName: "Marlon",
    whenLabel: WHEN,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    siteUrl: SITE,
  }),
  entry("guest_session_cancelled", "Strength Club geannuleerd: woensdag 23 april", GuestSessionCancelled, {
    recipient: "guest",
    firstName: "Sanne",
    guestName: "Sanne",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    siteUrl: SITE,
  }, { variant: "gast" }),
  entry("guest_session_cancelled", "Strength Club geannuleerd, ook voor je gast", GuestSessionCancelled, {
    recipient: "host",
    firstName: "Anna",
    guestName: "Sanne",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    siteUrl: SITE,
  }, { variant: "host" }),
  entry("intake_confirmation", "Je intake bij The Movement Club staat gepland", IntakeConfirmation, {
    prospectName: "Anna",
    trainerName: "Marlon",
    whenLabel: WHEN,
    durationLabel: "45 minuten",
    locationLabel: "Industrieweg 14P, Loosdrecht",
    siteUrl: SITE,
  }),
  entry("intake_reminder", "Morgen: je intake bij The Movement Club", IntakeReminder, {
    prospectName: "Anna",
    trainerName: "Marlon",
    whenLabel: WHEN,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    siteUrl: SITE,
  }),
  entry("invoice_ready", "Factuur 2026-0042", InvoiceReady, {
    firstName: "Anna",
    invoiceNumber: "2026-0042",
    amountEuro: "€79,00",
    isCreditNote: false,
    portalUrl: `${SITE}/app/facturen`,
  }, { variant: "factuur" }),
  entry("invoice_ready", "Creditnota 2026-0043", InvoiceReady, {
    firstName: "Anna",
    invoiceNumber: "2026-0043",
    amountEuro: "€79,00",
    isCreditNote: true,
    portalUrl: `${SITE}/app/facturen`,
  }, { variant: "creditnota" }),
  entry("order_confirmation", "Je abonnement bij The Movement Club is actief", OrderConfirmation, {
    ...orderCommon,
    kind: "subscription",
    recurringEuro: "€79,00",
    recurringVatEuro: "€6,52",
    intervalLabel: "per maand",
    nextChargeDate: "1 november 2026",
    signupFee: { charged: true, amountEuro: "€25,00" },
    noticePeriodLabel: "één maand",
  }, { variant: "abonnement" }),
  entry("order_confirmation", "Je betaling bij The Movement Club is ontvangen", OrderConfirmation, {
    ...orderCommon,
    kind: "product",
    credits: 10,
    validityMonths: 6,
  }, { variant: "product" }),
  entry("payment_failed", "Incasso niet gelukt", PaymentFailed, {
    firstName: "Anna",
    amountEuro: "€69,00",
    planLabel: "Strength Club",
    siteUrl: SITE,
  }),
  entry("payment_request", "Je betaalverzoek van The Movement Club", PaymentRequest, {
    firstName: "Anna",
    itemLabel: "PT-pakket, 10 sessies",
    amountEuro: "€650,00",
    recurringEuro: null,
    payUrl: `${SITE}/betaal/tokenvoorbeeld`,
    expiresAtLabel: "30 oktober 2026",
  }),
  entry("pt_cancellation_outcome", "Je annuleringsverzoek is goedgekeurd", PtCancellationOutcome, {
    firstName: "Anna",
    variant: "approved_refund",
    sessionLabel: "PT-sessie",
    whenLabel: WHEN,
    creditLabel: "1 PT-tegoed",
    note: null,
    siteUrl: SITE,
  }, { variant: "goedgekeurd met tegoed" }),
  entry("pt_cancellation_outcome", "Je annuleringsverzoek is goedgekeurd", PtCancellationOutcome, {
    firstName: "Anna",
    variant: "approved_no_refund",
    sessionLabel: "PT-sessie",
    whenLabel: WHEN,
    creditLabel: "1 PT-tegoed",
    note: "Te laat geannuleerd.",
    siteUrl: SITE,
  }, { variant: "goedgekeurd zonder tegoed" }),
  entry("pt_cancellation_outcome", "Je annuleringsverzoek is afgewezen", PtCancellationOutcome, {
    firstName: "Anna",
    variant: "rejected",
    sessionLabel: "PT-sessie",
    whenLabel: WHEN,
    creditLabel: "1 PT-tegoed",
    note: "De sessie begint over minder dan 24 uur.",
    siteUrl: SITE,
  }, { variant: "afgewezen" }),
  entry("pt_cancellation_request", "Annulering aangevraagd voor een PT-sessie", PtCancellationRequest, {
    trainerName: "Marlon",
    memberLabel: "Anna de Vries",
    sessionLabel: "PT-sessie",
    whenLabel: WHEN,
    reason: "Ziek",
    siteUrl: SITE,
  }, { staff: true }),
  entry("pt_trainer_change", "PT-sessie geannuleerd", PtTrainerChange, {
    trainerName: "Marlon",
    memberLabel: "Anna de Vries",
    kind: "cancelled",
    whenLabel: WHEN,
    siteUrl: SITE,
  }, { variant: "geannuleerd", staff: true }),
  entry("pt_trainer_change", "PT-sessie verzet", PtTrainerChange, {
    trainerName: "Marlon",
    memberLabel: "Anna de Vries",
    kind: "rescheduled",
    whenLabel: WHEN,
    newWhenLabel: "donderdag 24 april · 07:30 – 08:30",
    siteUrl: SITE,
  }, { variant: "verzet", staff: true }),
  entry("session_cancelled_by_admin", "Strength Club geannuleerd: woensdag 23 april", SessionCancelledByAdmin, {
    firstName: "Anna",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    creditRestored: true,
    siteUrl: SITE,
  }, { variant: "boeking" }),
  entry("session_cancelled_by_admin", "Strength Club geannuleerd: woensdag 23 april", SessionCancelledByAdmin, {
    firstName: "Anna",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    creditRestored: false,
    siteUrl: SITE,
    audience: "waitlist",
  }, { variant: "wachtlijst" }),
  entry("session_rescheduled", "Nieuwe tijd voor Strength Club: donderdag 07:30", SessionRescheduled, {
    firstName: "Anna",
    className: "Strength Club",
    oldWhenLabel: WHEN,
    newWhenLabel: "donderdag 24 april · 07:30 – 08:30",
    siteUrl: SITE,
  }),
  entry("trial_booking_cancelled_by_studio", "Proefles geannuleerd: Strength Club", TrialBookingCancelledByStudio, {
    firstName: "Sanne",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    refundAmountLabel: "17,00",
    codeReusable: false,
    siteUrl: SITE,
  }, { variant: "betaald" }),
  entry("trial_booking_cancelled_by_studio", "Proefles geannuleerd: Strength Club", TrialBookingCancelledByStudio, {
    firstName: "Sanne",
    className: "Strength Club",
    whenLabel: WHEN,
    reason: "ziekte van de trainer",
    refundAmountLabel: null,
    codeReusable: true,
    siteUrl: SITE,
  }, { variant: "proefcode" }),
  entry("trial_code_abuse_alert", "Herhaalde gratis proefles: lid@themovementclub.nl", TrialCodeAbuseAlert, {
    name: "Sanne Jansen",
    email: "lid@themovementclub.nl",
    phone: "+31 6 12 34 56 78",
    code: "PROEF-1234",
    className: "Strength Club",
    whenLabel: WHEN,
    prior: [
      {
        code: "PROEF-0001",
        className: "Mobility",
        whenLabel: "maandag 7 april · 19:00",
        redeemedAtLabel: "1 april 2026",
        cancelled: true,
      },
    ],
    adminUrl: `${SITE}/app/admin/proefcodes/voorbeeld`,
  }, { staff: true }),
  entry("trial_code_confirmation", "Je proefles staat vast: Strength Club", TrialCodeConfirmation, {
    firstName: "Sanne",
    className: "Strength Club",
    trainerName: "Marlon",
    whenLabel: WHEN,
    cancelUrl: `${SITE}/proefles/annuleren/tokenvoorbeeld`,
    cancellationWindowHours: 24,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    priceLabel: null,
  }, { variant: "groep" }),
  entry("trial_code_confirmation", "Je proefles staat vast: Vrij trainen", TrialCodeConfirmation, {
    firstName: "Sanne",
    className: "Vrij trainen",
    trainerName: "Marlon",
    whenLabel: WHEN,
    cancelUrl: `${SITE}/proefles/annuleren/tokenvoorbeeld`,
    cancellationWindowHours: 24,
    locationLabel: "Industrieweg 14P, Loosdrecht",
    priceLabel: "€17,00",
    variant: "vrij_trainen",
  }, { variant: "vrij trainen" }),
  entry("visitor_session_rescheduled", "Nieuwe tijd voor je proefles: donderdag 07:30", VisitorSessionRescheduled, {
    recipient: "trial",
    trialKind: "paid",
    firstName: "Sanne",
    className: "Strength Club",
    oldWhenLabel: WHEN,
    newWhenLabel: "donderdag 24 april · 07:30 – 08:30",
    cancelUrl: `${SITE}/proefles/annuleren/tokenvoorbeeld`,
  }, { variant: "proefles betaald" }),
  entry("visitor_session_rescheduled", "Nieuwe tijd voor je proefles: donderdag 07:30", VisitorSessionRescheduled, {
    recipient: "trial",
    trialKind: "code",
    firstName: "Sanne",
    className: "Strength Club",
    oldWhenLabel: WHEN,
    newWhenLabel: "donderdag 24 april · 07:30 – 08:30",
    cancelUrl: `${SITE}/proefles/annuleren/tokenvoorbeeld`,
  }, { variant: "proefles code" }),
  entry("visitor_session_rescheduled", "Nieuwe tijd voor Strength Club: donderdag 07:30", VisitorSessionRescheduled, {
    recipient: "guest",
    firstName: "Sanne",
    hostFirstName: "Anna",
    className: "Strength Club",
    oldWhenLabel: WHEN,
    newWhenLabel: "donderdag 24 april · 07:30 – 08:30",
  }, { variant: "gast" }),
  entry("waitlist_promoted", "Plek vrij: Strength Club woensdag", WaitlistPromoted, {
    firstName: "Anna",
    className: "Strength Club",
    whenLabel: WHEN,
    deadlineLabel: "vandaag 18:00",
    siteUrl: SITE,
  }),
];
