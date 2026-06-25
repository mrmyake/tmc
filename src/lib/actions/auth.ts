"use server";

import { redirect } from "next/navigation";
import { loginWithPassword, destroySession } from "@/lib/session";
import { pool } from "@/lib/db";

export async function signOut() {
  await destroySession();
  redirect("/login");
}

function roleRedirect(role: string | null | undefined): string {
  if (role === "admin") return "/app/admin";
  if (role === "trainer") return "/app/trainer/sessies";
  return "/app/rooster";
}

export type LoginState = { error: string | null };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Vul je e-mailadres en wachtwoord in." };
  }

  let target = "/app/rooster";
  try {
    await loginWithPassword(email, password);
    const { rows } = await pool.query("select role from profiles where lower(email) = lower($1)", [email]);
    target = roleRedirect(rows[0]?.role);
  } catch {
    return { error: "Ongeldige inloggegevens." };
  }
  redirect(target);
}
