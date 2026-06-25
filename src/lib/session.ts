// Lucia session + email/password for the App Router (tmc). Server-only.
// auth_user.id == profiles.id (uuid as text), so user.id maps straight to a profile.
import { cookies } from "next/headers";
import { cache } from "react";
import { generateIdFromEntropySize } from "lucia";
import type { Session, User } from "lucia";
import { lucia } from "./lucia";
import { pool } from "./db";
import { hashPassword, verifyPassword } from "./password";

export const validateRequest = cache(
  async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
    const store = await cookies();
    const sessionId = store.get(lucia.sessionCookieName)?.value ?? null;
    if (!sessionId) return { user: null, session: null };
    const result = await lucia.validateSession(sessionId);
    try {
      if (result.session?.fresh) {
        const c = lucia.createSessionCookie(result.session.id);
        store.set(c.name, c.value, c.attributes);
      }
      if (!result.session) {
        const c = lucia.createBlankSessionCookie();
        store.set(c.name, c.value, c.attributes);
      }
    } catch {}
    return result;
  }
);

async function startSession(userId: string) {
  const session = await lucia.createSession(userId, {});
  const c = lucia.createSessionCookie(session.id);
  (await cookies()).set(c.name, c.value, c.attributes);
}

export async function loginWithPassword(email: string, password: string): Promise<void> {
  email = email.trim().toLowerCase();
  const { rows } = await pool.query<{ user_id: string; hashed_password: string | null }>(
    "select user_id, hashed_password from auth_key where id = $1",
    [`email:${email}`]
  );
  const key = rows[0];
  if (!key?.hashed_password) throw new Error("INVALID_CREDENTIALS");
  if (!(await verifyPassword(key.hashed_password, password))) throw new Error("INVALID_CREDENTIALS");
  await startSession(key.user_id);
}

export async function signUpWithPassword(
  email: string,
  password: string,
  firstName: string,
  lastName = ""
): Promise<string> {
  email = email.trim().toLowerCase();
  const userId = generateIdFromEntropySize(16);
  const hashed = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query("select 1 from auth_user where lower(email)=lower($1)", [email]);
    if (existing.rowCount) throw new Error("EMAIL_TAKEN");
    await client.query("insert into auth_user (id, email, email_verified) values ($1,$2,false)", [userId, email]);
    await client.query("insert into auth_key (id, user_id, hashed_password) values ($1,$2,$3)", [
      `email:${email}`, userId, hashed,
    ]);
    // member profile (member_code auto-assigned by the tmc.assign_member_code trigger)
    await client.query(
      "insert into profiles (id, email, first_name, last_name) values ($1,$2,$3,$4) on conflict (id) do nothing",
      [userId, email, firstName.trim() || email.split("@")[0], lastName.trim()]
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  await startSession(userId);
  return userId;
}

export async function destroySession(): Promise<void> {
  const { session } = await validateRequest();
  if (session) await lucia.invalidateSession(session.id);
  const c = lucia.createBlankSessionCookie();
  (await cookies()).set(c.name, c.value, c.attributes);
}
