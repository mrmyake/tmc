"use client";

import { useState } from "react";
import { NieuwLidDialog } from "./NieuwLidDialog";

export function NieuwLidKnop() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer shrink-0"
      >
        {/* COPY: confirm met Marlon */}
        Nieuw lid
      </button>
      <NieuwLidDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
