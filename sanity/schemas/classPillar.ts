import { defineType, defineField } from "sanity";

/**
 * Classpillar = een van de 5 kernpijlers van TMC.
 * Vijf vaste codes, matcht Supabase `class_pillars.code` enum.
 * Beheerd als losse documents (één per pijler) zodat Marlon per pijler
 * NL-naam, omschrijving, hero-image en default capacity kan beheren.
 */
export default defineType({
  name: "classPillar",
  title: "Class Pillar",
  type: "document",
  fields: [
    defineField({
      name: "code",
      title: "Code",
      type: "string",
      description:
        "Matcht Supabase class_pillars.code. Kies uit de vijf vaste waardes.",
      options: {
        list: [
          { title: "Vrij Trainen", value: "vrij_trainen" },
          { title: "Yoga & Mobility", value: "yoga_mobility" },
          { title: "Kettlebell Club", value: "kettlebell" },
          { title: "Kids", value: "kids" },
          { title: "Senior 65+", value: "senior" },
        ],
        layout: "radio",
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "nameNl",
      title: "Naam (NL)",
      type: "string",
      description: "Publieke naam, bijv. 'Yoga & Mobility'.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "descriptionNl",
      title: "Omschrijving",
      type: "text",
      rows: 3,
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
      name: "icon",
      title: "Icoon",
      type: "string",
      description:
        "Lucide icon-naam of emoji. Bijv. 'dumbbell', 'flower-2', '🏋️'.",
    }),
    defineField({
      name: "heroImage",
      title: "Hero afbeelding",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "defaultCapacity",
      title: "Standaard capaciteit",
      type: "number",
      description: "Default aantal plekken per les binnen deze pijler.",
      validation: (r) => r.required().min(1).max(100),
    }),
    defineField({
      name: "displayOrder",
      title: "Volgorde",
      type: "number",
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: "Volgorde",
      name: "orderAsc",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      title: "nameNl",
      subtitle: "code",
      media: "heroImage",
    },
  },
});
