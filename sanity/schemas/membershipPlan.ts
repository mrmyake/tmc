import { defineType, defineField } from "sanity";

/**
 * Marketing-variant van een membership. Spiegelt Supabase
 * `membership_plan_catalogue` (gesyncht via `planVariant` als unieke key)
 * en levert de content voor de publieke tarievenpagina.
 */
export default defineType({
  name: "membershipPlan",
  title: "Membership Plan",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Naam",
      type: "string",
      description: "Bijv. 'All Inclusive Onbeperkt'.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "planType",
      title: "Plan type",
      type: "string",
      description: "Matcht Supabase memberships.plan_type enum.",
      options: {
        list: [
          { title: "Vrij Trainen", value: "vrij_trainen" },
          { title: "Yoga & Mobility", value: "yoga_mobility" },
          { title: "Kettlebell", value: "kettlebell" },
          { title: "All Inclusive", value: "all_inclusive" },
          { title: "Kids", value: "kids" },
          { title: "Senior", value: "senior" },
          { title: "10-rittenkaart", value: "ten_ride_card" },
          { title: "PT-pakket", value: "pt_package" },
          { title: "12-weken programma", value: "twelve_week_program" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "planVariant",
      title: "Plan variant",
      type: "string",
      description:
        "Unieke sleutel die matcht met Supabase membership_plan_catalogue.plan_variant. Bijv. 'all_inclusive_unl'.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "frequencyCap",
      title: "Frequency cap (per week)",
      type: "number",
      description:
        "1, 2, 3 etc. Leeg laten voor onbeperkt binnen de pijler.",
    }),
    defineField({
      name: "ageCategory",
      title: "Leeftijdscategorie",
      type: "string",
      options: {
        list: [
          { title: "Volwassenen", value: "adult" },
          { title: "Kids", value: "kids" },
          { title: "Senior 65+", value: "senior" },
        ],
      },
      initialValue: "adult",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "pricePerCycleCents",
      title: "Prijs per cyclus (cent)",
      type: "number",
      description:
        "In centen. Bijv. 14900 voor €149,-. Periodiek per billingCycleWeeks.",
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: "billingCycleWeeks",
      title: "Facturatiecyclus (weken)",
      type: "number",
      initialValue: 4,
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: "commitMonths",
      title: "Commitment (maanden)",
      type: "number",
      initialValue: 12,
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: "includes",
      title: "Wat zit erin",
      type: "array",
      of: [{ type: "string" }],
      description: "Bullet-punten voor de pricing card.",
    }),
    defineField({
      name: "highlighted",
      title: "Uitgelicht",
      type: "boolean",
      description: "Toont 'Populair' badge op de card.",
      initialValue: false,
    }),
    defineField({
      name: "displayOrder",
      title: "Volgorde",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "isActive",
      title: "Actief",
      type: "boolean",
      initialValue: true,
    }),
  ],
  orderings: [
    {
      title: "Volgorde",
      name: "orderAsc",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      title: "name",
      variant: "planVariant",
      price: "pricePerCycleCents",
      weeks: "billingCycleWeeks",
      active: "isActive",
    },
    prepare({ title, variant, price, weeks, active }) {
      const euro =
        typeof price === "number"
          ? `€${(price / 100).toLocaleString("nl-NL")},-`
          : "";
      const suffix = weeks ? ` / ${weeks}wk` : "";
      const status = active === false ? " (inactief)" : "";
      return {
        title: `${title}${status}`,
        subtitle: `${variant || ""} · ${euro}${suffix}`,
      };
    },
  },
});
