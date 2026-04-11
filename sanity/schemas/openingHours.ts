import { defineType, defineField } from "sanity";

export default defineType({
  name: "openingHours",
  title: "Openingstijden",
  type: "document",
  fields: [
    defineField({
      name: "schedule",
      title: "Weekschema",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "day",
              title: "Dag",
              type: "string",
              options: {
                list: [
                  "Maandag",
                  "Dinsdag",
                  "Woensdag",
                  "Donderdag",
                  "Vrijdag",
                  "Zaterdag",
                  "Zondag",
                ],
              },
            }),
            defineField({
              name: "open",
              title: "Open",
              type: "string",
              description: "Bijv. 07:00",
            }),
            defineField({
              name: "close",
              title: "Sluit",
              type: "string",
              description: "Bijv. 21:00",
            }),
            defineField({
              name: "closed",
              title: "Gesloten",
              type: "boolean",
              initialValue: false,
            }),
          ],
          preview: {
            select: {
              day: "day",
              open: "open",
              close: "close",
              closed: "closed",
            },
            prepare({ day, open, close, closed }) {
              return {
                title: String(day || ""),
                subtitle: closed ? "Gesloten" : `${open || ""} – ${close || ""}`,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: "note",
      title: "Extra opmerking",
      type: "string",
      description: 'Bijv. "Op feestdagen gesloten"',
    }),
  ],
});
