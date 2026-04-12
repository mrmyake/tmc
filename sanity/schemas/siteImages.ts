import { defineType, defineField } from "sanity";

export default defineType({
  name: "siteImages",
  title: "Website Afbeeldingen",
  type: "document",
  fields: [
    // Hero
    defineField({
      name: "hero",
      title: "Hero achtergrond",
      type: "image",
      options: { hotspot: true },
      description:
        "Fullscreen achtergrondafbeelding voor de homepage. Donkere, sfeervolle gymfoto. Minimaal 1920×1080px, liefst 2560×1440px. Landscape formaat. De foto krijgt een donkere overlay, dus kies een beeld met contrast.",
    }),

    // Studio
    defineField({
      name: "studio",
      title: "Studio interieur",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto van het studio interieur voor de homepage. Toon de apparatuur, sfeer en ruimte. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),

    // Aanbod fotos
    defineField({
      name: "offeringPersonalTraining",
      title: "Foto: Personal Training",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto bij Personal Training op de aanbod-pagina. Eén-op-één training in actie. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),
    defineField({
      name: "offeringSmallGroup",
      title: "Foto: Small Group Training",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto bij Small Group Training. Kleine groep (2-6 personen) in actie. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),
    defineField({
      name: "offeringMobility",
      title: "Foto: Mobility Sessions",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto bij Mobility Sessions. Stretching, mobiliteitswerk, foam rolling. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),
    defineField({
      name: "offeringStrength",
      title: "Foto: Strength Programs",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto bij Strength Programs. Krachttraining, barbell, compound lifts. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),

    // Over pagina
    defineField({
      name: "overMarlon",
      title: "Marlon — Over pagina",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto van Marlon voor de 'Over ons' pagina. In de studio, actie of portret. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),
    defineField({
      name: "hormoonprofiel",
      title: "Hormoonprofiel sectie",
      type: "image",
      options: { hotspot: true },
      description:
        "Foto voor de Hormoonprofiel cross-link sectie. Marlon in consult, holistisch beeld. 1200×900px (4:3 verhouding). Landscape formaat.",
    }),

    // Studio galerij
    defineField({
      name: "gallery",
      title: "Studio galerij (Over pagina)",
      type: "array",
      description:
        "6 foto's voor de studio galerij op de Over pagina. Vierkant formaat, minimaal 800×800px. Upload ze in de gewenste volgorde.",
      of: [
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "caption",
              title: "Bijschrift",
              type: "string",
              description:
                "Korte beschrijving, bijv. 'Studio overzicht' of 'Premium apparatuur'",
            }),
          ],
        },
      ],
      validation: (Rule) => Rule.max(6),
    }),

    // Lead magnet
    defineField({
      name: "beweegBeterCover",
      title: "Beweeg Beter guide cover",
      type: "image",
      options: { hotspot: true },
      description:
        "Cover/mockup van de Beweeg Beter PDF guide. 600×800px (3:4 verhouding). Portrait formaat.",
    }),
    defineField({
      name: "mobilityResetThumb",
      title: "Mobility Reset video thumbnail",
      type: "image",
      options: { hotspot: true },
      description:
        "Thumbnail voor de Mobility Reset video preview. 1280×720px (16:9 verhouding). Landscape formaat.",
    }),

    // Social sharing
    defineField({
      name: "ogImage",
      title: "Social sharing afbeelding (OG image)",
      type: "image",
      description:
        "Afbeelding die verschijnt als de website gedeeld wordt op social media. Exact 1200×630px. Toon logo + sfeerbeeld. Tekst moet leesbaar zijn op klein formaat.",
    }),
  ],
});
