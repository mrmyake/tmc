import { defineType, defineField } from "sanity";

export default defineType({
  name: "yogaStyle",
  title: "Yoga vormen",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Naam",
      type: "string",
      description: 'Bijv. "Yin Yoga".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "URL slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "intensity",
      title: "Intensiteit (rust naar actief)",
      description:
        "1 = meest rustig, 5 = meest actief. Bepaalt de volgorde op de vergelijkingsas.",
      type: "number",
      validation: (r) => r.required().min(1).max(5),
    }),
    defineField({
      name: "definition",
      title: "Definitiezin (citatie-klaar)",
      description:
        'Eerste alinea begint hiermee. Begin met de naam, bijv. "Yin Yoga is ...". Geen em dashes.',
      type: "text",
      rows: 3,
      validation: (r) => r.required(),
    }),
    defineField({
      name: "shortDescription",
      title: "Korte propositie",
      description: "Eén krachtige zin voor de hub en de vergelijkingstabel.",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "forWho",
      title: "Voor wie",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "benefits",
      title: "Wat het je brengt",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "body",
      title: "Uitgebreide tekst",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "image",
      title: "Foto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "teachers",
      title: "Docenten",
      description: "Wie geeft deze vorm? Verwijst naar yoga docenten.",
      type: "array",
      of: [{ type: "reference", to: [{ type: "yogaTeacher" }] }],
    }),
    defineField({
      name: "faqs",
      title: "Veelgestelde vragen",
      description: "Voedt het FAQPage JSON-LD op de vormpagina.",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "question", title: "Vraag", type: "string" },
            { name: "answer", title: "Antwoord", type: "text", rows: 3 },
          ],
          preview: { select: { title: "question" } },
        },
      ],
    }),
    defineField({
      name: "seoTitle",
      title: "SEO title (optioneel)",
      type: "string",
      description: "Overschrijft de standaard title. Max 60 tekens.",
      validation: (r) => r.max(70),
    }),
    defineField({
      name: "seoDescription",
      title: "SEO description (optioneel)",
      type: "text",
      rows: 2,
      description: "Overschrijft de standaard description. Max 160 tekens.",
      validation: (r) => r.max(180),
    }),
    defineField({
      name: "order",
      title: "Volgorde",
      type: "number",
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: "Intensiteit (rust → actief)",
      name: "intensityAsc",
      by: [{ field: "intensity", direction: "asc" }],
    },
    {
      title: "Volgorde",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "shortDescription", media: "image" },
  },
});
