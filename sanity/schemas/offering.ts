import { defineType, defineField } from "sanity";

export default defineType({
  name: "offering",
  title: "Trainingsaanbod",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Naam", type: "string" }),
    defineField({
      name: "slug",
      title: "URL slug",
      type: "slug",
      options: { source: "title" },
    }),
    defineField({
      name: "subtitle",
      title: "Ondertitel",
      type: "string",
      description: 'Bijv. "Eén-op-één, volledig op maat"',
    }),
    defineField({
      name: "image",
      title: "Foto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "description",
      title: "Beschrijving",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "targetAudience",
      title: "Voor wie",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "features",
      title: "Wat kun je verwachten",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "frequency",
      title: "Frequentie",
      type: "string",
      description: 'Bijv. "1-4x per week"',
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
    select: { title: "title", subtitle: "subtitle", media: "image" },
  },
});
