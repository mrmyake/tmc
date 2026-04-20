import { defineType, defineField } from "sanity";

/**
 * Concreet lestype binnen een pijler (bijv. "Vinyasa Yoga", "Kettlebell
 * Fundamentals"). Gesyncht naar Supabase `class_types` voor booking-runtime.
 */
export default defineType({
  name: "classType",
  title: "Class Type",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Naam",
      type: "string",
      description: "Publieke naam van het lestype. Bijv. 'Vinyasa Yoga'.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "pillar",
      title: "Pijler",
      type: "reference",
      to: [{ type: "classPillar" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "ageCategory",
      title: "Leeftijdscategorie",
      type: "string",
      options: {
        list: [
          { title: "Volwassenen", value: "adult" },
          { title: "Kids", value: "kids" },
          { title: "Senior 65+", value: "senior" },
        ],
      },
      initialValue: "adult",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "defaultCapacity",
      title: "Standaard capaciteit",
      type: "number",
      description: "Kan overschreven worden per scheduleTemplate.",
      validation: (r) => r.required().min(1).max(100),
    }),
    defineField({
      name: "defaultDurationMinutes",
      title: "Standaard duur (minuten)",
      type: "number",
      initialValue: 60,
      validation: (r) => r.required().min(15).max(240),
    }),
    defineField({
      name: "description",
      title: "Beschrijving",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "heroImage",
      title: "Hero afbeelding",
      type: "image",
      options: { hotspot: true },
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
      title: "name",
      subtitle: "pillar.nameNl",
      media: "heroImage",
    },
  },
});
