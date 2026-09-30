"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { loginWithWelcomeToken } from "./actions";

/**
 * De knop "Inloggen" van scherm 8. De GET van de pagina verbruikt niets;
 * pas deze POST (server action) verbruikt het inlogtoken en zet de sessie.
 * Bij succes redirect de action zelf. Bij een mislukking is het token op
 * of ongeldig; een refresh laat de pagina scherm 9 renderen (inlogcode).
 */
export function WelcomeLoginForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleLogin() {
    setFailed(false);
    startTransition(async () => {
      const result = await loginWithWelcomeToken(token);
      // Alleen bij een mislukking komt hier iets terug (succes is een redirect).
      if (result && !result.ok) {
        setFailed(true);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <Button
        type="button"
        onClick={handleLogin}
        className={`w-full ${pending ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* COPY: confirm met Marlon */}
        {pending ? "Bezig..." : "Inloggen"}
      </Button>
      {failed && (
        <p role="alert" className="mt-4 text-sm text-[color:var(--danger)]">
          {/* COPY: confirm met Marlon */}
          Inloggen met deze link lukte niet. Vraag hieronder een inlogcode aan.
        </p>
      )}
    </div>
  );
}
