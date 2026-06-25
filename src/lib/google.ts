// Google OAuth (Arctic) for tmc. Creates/links an auth_user + profile inside tmc.
import { Google, generateState, generateCodeVerifier } from "arctic";
import { generateIdFromEntropySize } from "lucia";
import { pool } from "./db";

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID ?? "",
  process.env.GOOGLE_CLIENT_SECRET ?? "",
  `${process.env.NEXT_PUBLIC_SITE_URL}/login/google/callback`
);

export { generateState, generateCodeVerifier };

export async function upsertGoogleUser(
  googleSub: string,
  email: string,
  firstName = "",
  lastName = ""
): Promise<string> {
  email = email.trim().toLowerCase();
  const linked = await pool.query(
    "select user_id from auth_oauth_account where provider_id='google' and provider_user_id=$1",
    [googleSub]
  );
  if (linked.rows[0]) return linked.rows[0].user_id;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const byEmail = await client.query("select id from auth_user where lower(email)=lower($1)", [email]);
    let userId: string = byEmail.rows[0]?.id;
    if (!userId) {
      userId = generateIdFromEntropySize(16);
      await client.query("insert into auth_user (id, email, email_verified) values ($1,$2,true)", [userId, email]);
      await client.query(
        "insert into profiles (id, email, first_name, last_name) values ($1,$2,$3,$4) on conflict (id) do nothing",
        [userId, email, firstName.trim() || email.split("@")[0], lastName.trim()]
      );
    }
    await client.query(
      "insert into auth_oauth_account (provider_id, provider_user_id, user_id) values ('google',$1,$2) on conflict do nothing",
      [googleSub, userId]
    );
    await client.query("commit");
    return userId;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
