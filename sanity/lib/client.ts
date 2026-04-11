import { createClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";
export const client = createClient({
  projectId: "hn9lkvte",
  dataset: "production",
  apiVersion: "2026-04-01",
  useCdn: true,
});

const builder = imageUrlBuilder(client);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const urlFor = (source: any) => builder.image(source);
