"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { uploadAvatar, removeAvatar } from "@/lib/actions/profile";

interface Props {
  avatarUrl: string | null;
  initials: string;
}

export function AvatarUpload({ avatarUrl, initials }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("avatar", file);
    startTransition(async () => {
      const res = await uploadAvatar(formData);
      if (!res.ok) setError(res.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeAvatar();
      if (!res.ok) setError(res.error);
    });
  }

  const buttonBase =
    "inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-8">
      <div className="relative w-28 h-28 overflow-hidden bg-bg flex items-center justify-center flex-shrink-0">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Profielfoto"
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <span className="font-[family-name:var(--font-playfair)] text-4xl text-accent leading-none">
            {initials}
          </span>
        )}
      </div>

      <div className="flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          id="avatar-input"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="avatar-input"
            className={`${buttonBase} border-text-muted/30 text-text hover:border-accent hover:text-accent ${
              pending ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {pending ? "Bezig" : avatarUrl ? "Vervangen" : "Uploaden"}
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-[color:var(--danger)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              Verwijderen
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted mt-3">
          JPG, PNG of WebP. Max 3 MB.
        </p>
        {error && (
          <p role="alert" className="text-xs text-[color:var(--danger)] mt-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
