import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./sanity/schemas";

export default defineConfig({
  name: "the-movement-club",
  title: "The Movement Club",
  projectId: "hn9lkvte",
  dataset: "production",
  basePath: "/studio",
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem()
              .title("Website Instellingen")
              .child(
                S.document()
                  .schemaType("siteSettings")
                  .documentId("siteSettings")
              ),
            S.listItem()
              .title("Openingstijden")
              .child(
                S.document()
                  .schemaType("openingHours")
                  .documentId("openingHours")
              ),
            S.divider(),
            S.documentTypeListItem("trainer").title("Trainers"),
            S.documentTypeListItem("offering").title("Trainingsaanbod"),
            S.documentTypeListItem("pricingTier").title("Lidmaatschap"),
            S.documentTypeListItem("testimonial").title("Testimonials"),
            S.documentTypeListItem("faq").title("FAQ"),
            S.divider(),
            S.documentTypeListItem("blogPost").title("Blog"),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
