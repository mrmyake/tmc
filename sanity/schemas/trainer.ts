import { defineType, defineField } from "sanity";

export default defineType({
  name: "trainer",
  title: "Trainers",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Naam",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "supabaseTrainerId",
      title: "Supabase Trainer ID",
      type: "string",
      description: "Auto-gevuld bij aanmaken, niet handmatig wijzigen.",
      readOnly: true,
    }),
    defineField({
      name: "role",
      title: "Rol",
      type: "string",
      options: {
        list: [
          { title: "Head Trainer", value: "head_trainer" },
          { title: "Personal Trainer", value: "personal_trainer" },
          { title: "Yoga & Mobility", value: "yoga_mobility" },
          { title: "Kids Coach", value: "kids" },
          { title: "Senior Coach", value: "senior" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "pillarSpecialties",
      title: "Pijler-specialisaties",
      description: "Welke lestypes geeft deze trainer?",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Vrij Trainen", value: "vrij_trainen" },
          { title: "Yoga & Mobility", value: "yoga_mobility" },
          { title: "Kettlebell Club", value: "kettlebell" },
          { title: "Kids", value: "kids" },
          { title: "Senior 65+", value: "senior" },
        ],
      },
    }),
    defineField({
      name: "isPtAvailable",
      title: "Beschikbaar voor Personal Training?",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "ptTier",
      title: "PT Tier",
      type: "string",
      description:
        "Premium = Marlon-tarief, Standaard = standaard PT-tarief.",
      options: {
        list: [
          { title: "Premium (Marlon)", value: "premium" },
          { title: "Standaard", value: "standard" },
        ],
      },
      hidden: ({ parent }) => !parent?.isPtAvailable,
    }),
    defineField({
      name: "photo",
      title: "Portretfoto",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "heroQuote",
      title: "Hero quote",
      description:
        "Korte, krachtige quote boven de bio op de trainer-detailpagina. Max 120 tekens.",
      type: "string",
      validation: (r) => r.max(120),
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "quote",
      title: "Persoonlijke quote (oud, deprecated)",
      type: "text",
      rows: 3,
      description:
        "Legacy veld. Gebruik 'Hero quote' voor nieuwe content.",
      hidden: ({ parent }) => !parent?.quote,
    }),
    defineField({
      name: "certifications",
      title: "Certificeringen",
      description:
        "Een per regel. Bijv. 'Kettlebell Master — StrongFirst SFG II'.",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "yearsOfExperience",
      title: "Jaren ervaring",
      type: "number",
      validation: (r) => r.min(0).max(60),
    }),
    defineField({
      name: "languages",
      title: "Lestalen",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Nederlands", value: "nl" },
          { title: "Engels", value: "en" },
        ],
      },
      initialValue: ["nl"],
    }),
    defineField({
      name: "availabilityNotes",
      title: "Beschikbaarheid (intern)",
      type: "text",
      description:
        "Niet publiek. Voor admin-planning. Bijv. 'Dinsdag en donderdag niet beschikbaar.'",
      rows: 3,
    }),
    defineField({
      name: "displayOrder",
      title: "Volgorde op /trainers pagina",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "isActive",
      title: "Actief",
      description: "Uitzetten als trainer tijdelijk of permanent weg is.",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "order",
      title: "Volgorde (oud, deprecated)",
      type: "number",
      description:
        "Legacy veld. Gebruik 'Volgorde op /trainers pagina' voor nieuwe content.",
      hidden: ({ parent }) => parent?.order === undefined,
    }),
  ],
  orderings: [
    {
      title: "Volgorde",
      name: "displayOrderAsc",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "role",
      active: "isActive",
      media: "photo",
    },
    prepare({ title, subtitle, active, media }) {
      const ROLE_LABELS: Record<string, string> = {
        head_trainer: "Head Trainer",
        personal_trainer: "Personal Trainer",
        yoga_mobility: "Yoga & Mobility",
        kids: "Kids Coach",
        senior: "Senior Coach",
      };
      const roleLabel = subtitle ? ROLE_LABELS[subtitle] ?? subtitle : "";
      return {
        title: active === false ? `${title} (inactief)` : title,
        subtitle: roleLabel,
        media,
      };
    },
  },
});
