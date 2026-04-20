import { defineType, defineField } from "sanity";

export default defineType({
  name: "crowdfundingTier",
  title: "Crowdfunding Tier",
  type: "document",
  fields: [
    defineField({
      name: "tierId",
      title: "Tier ID",
      type: "string",
      description:
        "Unieke slug, bijv. 'all-in'. Wordt gebruikt voor Supabase koppeling.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "name",
      title: "Naam",
      type: "string",
      description: "Bijv. 'ALL IN'",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      description: "Bijv. 'All in. No excuses.'",
    }),
    defineField({
      name: "description",
      title: "Beschrijving",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "price",
      title: "Prijs (in euro's)",
      type: "number",
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "normalPrice",
      title: "Normale prijs (doorgestreept)",
      type: "number",
      description: "Leeg laten als er geen korting is",
    }),
    defineField({
      name: "maxSlots",
      title: "Max beschikbaar",
      type: "number",
      description: "Leeg laten voor onbeperkt",
    }),
    defineField({
      name: "includes",
      title: "Wat zit erin",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "badge",
      title: "Badge",
      type: "string",
      description:
        "Bijv. 'EARLY BIRD', 'POPULAIR', 'LIFETIME', '3 BESCHIKBAAR'. Leeg = geen badge.",
    }),
    defineField({
      name: "highlighted",
      title: "Uitgelicht",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "active",
      title: "Actief",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "order",
      title: "Volgorde",
      type: "number",
    }),
  ],
  orderings: [
    {
      title: "Volgorde",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "tagline", price: "price" },
    prepare({ title, subtitle, price }) {
      return { title: `${title} — €${price}`, subtitle: subtitle || "" };
    },
  },
});
