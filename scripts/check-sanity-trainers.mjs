#!/usr/bin/env node
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "hn9lkvte",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2024-01-01",
  useCdn: false,
});

const trainers = await client.fetch(`
  *[_type == "trainer" && !(_id in path("drafts.**"))]{
    _id, name, role, bio, active
  } | order(order asc)
`);

console.log(`\nSanity trainers (${trainers.length}):`);
for (const t of trainers) {
  console.log(
    `  · ${t.name} — ${t.role || "-"} — active: ${t.active ?? "n/a"}`,
  );
  console.log(`    _id: ${t._id}`);
}
