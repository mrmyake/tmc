import { defineType, defineField } from "sanity";

export default defineType({
  name: "siteSettings",
  title: "Website Instellingen",
  type: "document",
  fields: [
    defineField({
      name: "studioName",
      title: "Studio naam",
      type: "string",
      initialValue: "The Movement Club",
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      description: "Korte beschrijving onder de naam",
    }),
    defineField({
      name: "phone",
      title: "Telefoonnummer",
      type: "string",
    }),
    defineField({
      name: "email",
      title: "E-mailadres",
      type: "string",
    }),
    defineField({
      name: "whatsappNumber",
      title: "WhatsApp nummer (internationaal formaat)",
      type: "string",
      description: "Bijv. 31612345678 (zonder + of spaties)",
    }),
    defineField({
      name: "address",
      title: "Adres",
      type: "object",
      fields: [
        defineField({ name: "street", title: "Straat + nummer", type: "string" }),
        defineField({ name: "postalCode", title: "Postcode", type: "string" }),
        defineField({ name: "city", title: "Plaats", type: "string" }),
      ],
    }),
    defineField({
      name: "kvkNumber",
      title: "KvK nummer",
      type: "string",
    }),
    defineField({
      name: "btwNumber",
      title: "BTW nummer",
      type: "string",
    }),
    defineField({
      name: "instagramUrl",
      title: "Instagram URL",
      type: "url",
    }),
    defineField({
      name: "googleMapsUrl",
      title: "Google Maps link",
      type: "url",
    }),
  ],
});
