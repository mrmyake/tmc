import { defineType, defineField } from "sanity";

export default defineType({
  name: "blogPost",
  title: "Blog",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Titel", type: "string" }),
    defineField({
      name: "slug",
      title: "URL",
      type: "slug",
      options: { source: "title" },
    }),
    defineField({
      name: "coverImage",
      title: "Omslagfoto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "excerpt",
      title: "Samenvatting",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "body",
      title: "Inhoud",
      type: "array",
      of: [
        { type: "block" },
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({ name: "alt", title: "Alt tekst", type: "string" }),
            defineField({
              name: "caption",
              title: "Bijschrift",
              type: "string",
            }),
          ],
        },
      ],
    }),
    defineField({
      name: "publishedAt",
      title: "Publicatiedatum",
      type: "datetime",
    }),
    defineField({
      name: "author",
      title: "Auteur",
      type: "reference",
      to: [{ type: "trainer" }],
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "publishedAt", media: "coverImage" },
  },
});
