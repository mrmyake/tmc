import { defineType, defineField } from "sanity";

export default defineType({
  name: "crowdfundingSettings",
  title: "Crowdfunding Instellingen",
  type: "document",
  fields: [
    defineField({
      name: "active",
      title: "Campagne actief",
      type: "boolean",
      initialValue: false,
      description: "Zet op true om de crowdfunding pagina live te zetten",
    }),
    defineField({
      name: "goal",
      title: "Doelbedrag (euro's)",
      type: "number",
      initialValue: 50000,
    }),
    defineField({ name: "startDate", title: "Startdatum", type: "date" }),
    defineField({ name: "endDate", title: "Einddatum", type: "date" }),
    defineField({
      name: "headline",
      title: "Headline",
      type: "string",
      initialValue: "Make A Move",
    }),
    defineField({
      name: "subline",
      title: "Subline",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "heroImage",
      title: "Hero afbeelding",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "story",
      title: "Het verhaal",
      type: "array",
      of: [{ type: "block" }],
      description: "De storytelling sectie onder de hero",
    }),
    defineField({
      name: "budgetItems",
      title: "Waar gaat het geld naartoe",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "label", title: "Omschrijving", type: "string" }),
            defineField({ name: "amount", title: "Bedrag", type: "number" }),
          ],
        },
      ],
    }),
    defineField({
      name: "whatsappShareText",
      title: "WhatsApp deeltekst",
      type: "string",
      initialValue:
        "Ik heb mijn move gemaakt. Jij ook? 💪 Word founding member van The Movement Club in Loosdrecht:",
    }),
    defineField({
      name: "thankYouTitle",
      title: "Bedankpagina titel",
      type: "string",
      initialValue: "Welkom bij The Movement Club!",
    }),
    defineField({
      name: "thankYouText",
      title: "Bedankpagina tekst",
      type: "text",
      rows: 3,
    }),
  ],
});
