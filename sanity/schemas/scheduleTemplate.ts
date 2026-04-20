import { defineType, defineField } from "sanity";

/**
 * Wekelijks terugkerend lespatroon. Cron `/api/cron/generate-sessions`
 * genereert hier 4 weken vooruit concrete `class_sessions` uit in Supabase.
 */
export default defineType({
  name: "scheduleTemplate",
  title: "Schedule Template",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Label (admin)",
      type: "string",
      description:
        "Intern label, bijv. 'Maandag 07:00 Kettlebell'. Niet publiek.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "classType",
      title: "Lestype",
      type: "reference",
      to: [{ type: "classType" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "trainer",
      title: "Trainer",
      type: "reference",
      to: [{ type: "trainer" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "dayOfWeek",
      title: "Dag",
      type: "number",
      options: {
        list: [
          { title: "Maandag", value: 1 },
          { title: "Dinsdag", value: 2 },
          { title: "Woensdag", value: 3 },
          { title: "Donderdag", value: 4 },
          { title: "Vrijdag", value: 5 },
          { title: "Zaterdag", value: 6 },
          { title: "Zondag", value: 0 },
        ],
        layout: "dropdown",
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "startTime",
      title: "Starttijd (HH:MM)",
      type: "string",
      description: "24-uurs formaat, bijv. '07:00' of '19:30'.",
      validation: (r) =>
        r
          .required()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
            name: "HH:MM",
            invert: false,
          }),
    }),
    defineField({
      name: "durationMinutes",
      title: "Duur (minuten)",
      type: "number",
      initialValue: 60,
      validation: (r) => r.required().min(15).max(240),
    }),
    defineField({
      name: "capacity",
      title: "Capaciteit",
      type: "number",
      description:
        "Override van de default capaciteit van het lestype (optioneel).",
      validation: (r) => r.required().min(1).max(100),
    }),
    defineField({
      name: "validFrom",
      title: "Geldig vanaf",
      type: "date",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "validUntil",
      title: "Geldig tot",
      type: "date",
      description: "Leeg laten voor onbepaalde tijd.",
    }),
    defineField({
      name: "isActive",
      title: "Actief",
      type: "boolean",
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      label: "name",
      className: "classType.name",
      trainerName: "trainer.name",
      day: "dayOfWeek",
      time: "startTime",
      active: "isActive",
    },
    prepare({ label, className, trainerName, day, time, active }) {
      const dayMap: Record<number, string> = {
        0: "Zo",
        1: "Ma",
        2: "Di",
        3: "Wo",
        4: "Do",
        5: "Vr",
        6: "Za",
      };
      const dayLabel = typeof day === "number" ? dayMap[day] : "?";
      const title = label || `${dayLabel} ${time || ""} ${className || ""}`;
      const subtitle = [trainerName, active === false ? "⏸ inactief" : null]
        .filter(Boolean)
        .join(" · ");
      return { title, subtitle };
    },
  },
});
