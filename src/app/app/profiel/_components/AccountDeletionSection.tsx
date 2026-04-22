"use client";

import { useRef } from "react";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function AccountDeletionSection() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="pt-10 text-center">
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted/70 transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-[color:var(--danger)] cursor-pointer"
      >
        Account verwijderen
      </button>
      <p className="text-text-muted/60 text-xs mt-3 max-w-prose mx-auto">
        Verwijdering binnen dertig dagen. Eventuele lopende abonnementen lopen
        via het opzegproces.
      </p>
      <DeleteAccountDialog
        ref={dialogRef}
        onDone={() => dialogRef.current?.close()}
      />
    </div>
  );
}
