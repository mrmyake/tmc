import "server-only";
import * as React from "react";
import OrderConfirmation from "@/emails/order_confirmation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
import { getCancellationNoticeDays, formatNoticePeriod } from "@/lib/cancellation-notice";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { formatEuroCents } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import {
  CONFIRMATION_EVENT_TYPE,
  sendOrderConfirmationOnce,
  type ConfirmationOrderRow,
  type SendOnceDeps,
  type SendOnceResult,
} from "./order-confirmation-core";

const ORDER_COLUMNS =
  "id, profile_id, kind, catalogue_slug, first_charge_cents, recurring_cents, signup_fee_cents, signup_fee_waiver, billing_cycle_weeks, vat_amount_cents, pricing_snapshot, profile:profiles!orders_profile_id_fkey(email, first_name)";

function longDateNl(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildDeps(): SendOnceDeps {
  const admin = createAdminClient();
  return {
    hasConfirmationEvent: async (orderId) => {
      const { data, error } = await admin
        .from("events")
        .select("id")
        .eq("type", CONFIRMATION_EVENT_TYPE)
        .eq("subject_type", "order")
        .eq("subject_id", orderId)
        .limit(1)
        .maybeSingle();
      if (error) {
        // Bij twijfel niet versturen: liever een gemiste mail (zichtbaar in
        // de log en via ntfy) dan een dubbele.
        console.error("[order-confirmation] events lookup failed", error);
        return true;
      }
      return data !== null;
    },
    loadOrder: async (orderId) => {
      const { data, error } = await admin
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (error) {
        console.error("[order-confirmation] order lookup failed", error);
        return null;
      }
      if (!data) return null;
      const row = data as unknown as Omit<ConfirmationOrderRow, "profile"> & {
        profile: ConfirmationOrderRow["profile"] | ConfirmationOrderRow["profile"][];
      };
      // PostgREST geeft een to-one-join soms als array terug.
      const profile = Array.isArray(row.profile) ? (row.profile[0] ?? null) : row.profile;
      return { ...row, profile };
    },
    loadCatalogue: async (slug) => {
      const catalogue = await getCatalogue();
      const row = catalogue.get(slug);
      if (!row) return null;
      return {
        display_name: row.display_name,
        credits: row.credits,
        validity_months: row.validity_months,
        vat_rate_bp: row.vat_rate_bp,
      };
    },
    cancellationNoticeDays: () => getCancellationNoticeDays(),
    send: ({ to, toName, props }) =>
      sendEmail({
        to,
        toName,
        // COPY: confirm met Marlon
        subject:
          props.kind === "subscription"
            ? "Je abonnement bij The Movement Club is actief"
            : "Je betaling bij The Movement Club is ontvangen",
        react: React.createElement(OrderConfirmation, props),
      }),
    emitSent: async (orderId, payload) => {
      await emitEvent({
        type: CONFIRMATION_EVENT_TYPE,
        actorType: "system",
        subjectType: "order",
        subjectId: orderId,
        payload,
      });
    },
    siteUrl: siteUrl(),
    now: () => new Date(),
    fmt: {
      euroCents: formatEuroCents,
      noticePeriod: formatNoticePeriod,
      longDate: longDateNl,
    },
  };
}

/**
 * Bevestigingsmail na een geslaagde betaling, exact één keer per order
 * (poort: tmc.events, type order.confirmation_sent). Throwt nooit.
 */
export function sendOrderConfirmation(orderId: string): Promise<SendOnceResult> {
  return sendOrderConfirmationOnce(buildDeps(), orderId);
}
