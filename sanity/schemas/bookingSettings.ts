import { defineType, defineField } from "sanity";

/**
 * Singleton. Eén document met document-id 'bookingSettings' dat de
 * booking-engine configuratie bevat. Spiegelt Supabase
 * `booking_settings` voor de velden die via CMS configureerbaar moeten
 * zijn (financiële drop-in/rittenkaart-prijzen blijven in Supabase).
 */
export default defineType({
  name: "bookingSettings",
  title: "Booking Instellingen",
  type: "document",
  fields: [
    defineField({
      name: "cancellationWindowHours",
      title: "Annulering-venster (uur)",
      type: "number",
      description:
        "Binnen X uur voor aanvang kosteloos annuleren. Daarna no-show strike.",
      initialValue: 6,
      validation: (r) => r.required().min(0).max(72),
    }),
    defineField({
      name: "bookingWindowDays",
      title: "Boek-venster (dagen vooruit)",
      type: "number",
      initialValue: 14,
      validation: (r) => r.required().min(1).max(90),
    }),
    defineField({
      name: "fairUseDailyMax",
      title: "Max boekingen per dag",
      type: "number",
      description: "Fair-use: voorkomt capaciteit-hoarding bij onbeperkt-abo.",
      initialValue: 2,
      validation: (r) => r.required().min(1).max(10),
    }),
    defineField({
      name: "waitlistConfirmationMinutes",
      title: "Wachtlijst-bevestigingsvenster (min)",
      type: "number",
      description:
        "Hoe lang heeft een lid om een auto-promotie te bevestigen.",
      initialValue: 30,
      validation: (r) => r.required().min(5).max(180),
    }),
    defineField({
      name: "noShowStrikeWindowDays",
      title: "Strike-venster (dagen)",
      type: "number",
      description:
        "Strikes binnen dit venster tellen mee voor de threshold.",
      initialValue: 30,
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: "noShowStrikeThreshold",
      title: "Strike-drempel",
      type: "number",
      description: "Aantal strikes voordat block ingaat.",
      initialValue: 3,
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: "noShowBlockDays",
      title: "Block-duur (dagen)",
      type: "number",
      description:
        "Hoe lang een lid niet kan boeken na het halen van de drempel.",
      initialValue: 7,
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: "registrationFeeCents",
      title: "Inschrijfkosten (cent)",
      type: "number",
      description:
        "Eenmalig bij nieuwe inschrijving. Kwijtgescholden bij jaar-/2-jaarscontract en Founding Members.",
      initialValue: 3900,
      validation: (r) => r.required().min(0),
    }),
  ],
  preview: {
    select: {
      cancel: "cancellationWindowHours",
      window: "bookingWindowDays",
    },
    prepare({ cancel, window: bookWin }) {
      return {
        title: "Booking Instellingen",
        subtitle: `Cancel ${cancel}u · Boeken ${bookWin} dagen vooruit`,
      };
    },
  },
});
