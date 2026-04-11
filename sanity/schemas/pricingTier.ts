import { defineType, defineField } from "sanity";

export default defineType({
  name: "pricingTier",
  title: "Lidmaatschap",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Naam", type: "string" }),
    defineField({
      name: "subtitle",
      title: "Ondertitel",
      type: "string",
      description: 'Bijv. "2x per week groepstraining"',
    }),
    defineField({
      name: "features",
      title: "Kenmerken",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "price",
      title: "Prijs",
      type: "string",
      description: 'Leeg laten als je "Vraag tarieven aan" wilt tonen',
    }),
    defineField({
      name: "ctaText",
      title: "Button tekst",
      type: "string",
      initialValue: "Vraag tarieven aan",
    }),
    defineField({
      name: "ctaLink",
      title: "Button link",
      type: "string",
      initialValue: "/contact",
    }),
    defineField({
      name: "highlighted",
      title: "Uitgelicht (populair)",
      type: "boolean",
      initialValue: false,
    }),
    defineField({ name: "order", title: "Volgorde", type: "number" }),
  ],
  orderings: [
    {
      title: "Volgorde",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "subtitle" },
  },
});
