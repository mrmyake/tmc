import { defineType, defineField } from "sanity";

export default defineType({
  name: "trainer",
  title: "Trainers",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Naam", type: "string" }),
    defineField({
      name: "role",
      title: "Rol",
      type: "string",
      description: "Bijv. Head Trainer & Oprichtster",
    }),
    defineField({
      name: "photo",
      title: "Portretfoto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "array",
      of: [{ type: "block" }],
      description: "Korte beschrijving voor de website",
    }),
    defineField({
      name: "quote",
      title: "Persoonlijke quote",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "certifications",
      title: "Certificeringen",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "order",
      title: "Volgorde",
      type: "number",
      description: "Lager = eerder getoond",
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
    select: { title: "name", subtitle: "role", media: "photo" },
  },
});
