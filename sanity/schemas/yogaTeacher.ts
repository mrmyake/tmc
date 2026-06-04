import { defineType, defineField } from "sanity";

export default defineType({
  name: "yogaTeacher",
  title: "Yoga docenten",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Naam",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "URL slug",
      type: "slug",
      options: { source: "name" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "specialty",
      title: "Specialisatie (kort)",
      type: "string",
      description: 'Korte label, bijv. "Yin & Restorative".',
    }),
    defineField({
      name: "photo",
      title: "Portretfoto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "heroQuote",
      title: "Hero quote",
      description: "Korte quote boven de bio. Max 160 tekens.",
      type: "string",
      validation: (r) => r.max(160),
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "supabaseTrainerId",
      title: "Supabase Trainer ID (optioneel)",
      type: "string",
      description:
        "Optioneel: koppel deze docent aan een trainer in het rooster (Supabase). Laat leeg als niet van toepassing.",
    }),
    defineField({
      name: "isActive",
      title: "Live tonen?",
      description:
        "Uit = docent staat nog niet publiek (bijv. samenwerking nog te bevestigen).",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "internalNote",
      title: "Interne notitie",
      description:
        "Niet publiek. Bijv. 'Foto vervangen voor live' of 'Samenwerking bevestigen'.",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "order",
      title: "Volgorde op /yoga/docenten",
      type: "number",
      initialValue: 0,
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
    select: {
      title: "name",
      subtitle: "specialty",
      active: "isActive",
      media: "photo",
    },
    prepare({ title, subtitle, active, media }) {
      return {
        title: active === false ? `${title} (niet live)` : title,
        subtitle,
        media,
      };
    },
  },
});
