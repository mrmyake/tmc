// Direct Postgres pool for Lucia, pinned to the tmc schema.
// Env: DATABASE_URL (Supabase Session pooler URI), DB_SCHEMA=tmc
import { Pool } from "pg";

const schema = process.env.DB_SCHEMA ?? "tmc";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("connect", (client) => {
  client.query(`set search_path to ${schema}, extensions`);
});
