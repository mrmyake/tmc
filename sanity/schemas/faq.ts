import { defineType, defineField } from "sanity";

export default defineType({
  name: "faq",
  title: "Veelgestelde vragen",
  type: "document",
  fields: [
    defineField({ name: "question", title: "Vraag", type: "string" }),
    defineField({
      name: "answer",
      title: "Antwoord",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "page",
      title: "Tonen op pagina",
      type: "string",
      options: {
        list: [
          { title: "Aanbod", value: "aanbod" },
          { title: "Mobility Check", value: "mobility-check" },
          { title: "Crowdfunding", value: "crowdfunding" },
          { title: "Algemeen", value: "algemeen" },
        ],
      },
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
    select: { title: "question", subtitle: "page" },
  },
});
