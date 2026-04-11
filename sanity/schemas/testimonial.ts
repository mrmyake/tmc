import { defineType, defineField } from "sanity";

export default defineType({
  name: "testimonial",
  title: "Testimonials",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Naam klant", type: "string" }),
    defineField({ name: "quote", title: "Quote", type: "text", rows: 4 }),
    defineField({
      name: "photo",
      title: "Foto (optioneel)",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "rating",
      title: "Sterren (1-5)",
      type: "number",
      validation: (Rule) => Rule.min(1).max(5),
    }),
    defineField({
      name: "trainingType",
      title: "Type training",
      type: "string",
      options: {
        list: ["Personal Training", "Small Group", "Mobility", "Strength"],
      },
    }),
    defineField({
      name: "active",
      title: "Tonen op website",
      type: "boolean",
      initialValue: true,
    }),
    defineField({ name: "order", title: "Volgorde", type: "number" }),
  ],
  preview: {
    select: { title: "name", subtitle: "quote", media: "photo" },
  },
});
