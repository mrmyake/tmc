import { Lucia, TimeSpan } from "lucia";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";
import { pool } from "./db";

const adapter = new NodePostgresAdapter(pool, {
  user: "auth_user",
  session: "auth_session",
});

export const lucia = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(30, "d"),
  sessionCookie: {
    name: "tmc_session",
    attributes: { secure: process.env.NODE_ENV === "production" },
  },
  getUserAttributes: (attr) => ({
    email: attr.email,
    emailVerified: attr.email_verified,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: { email: string; email_verified: boolean };
  }
}
