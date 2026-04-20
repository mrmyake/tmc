"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Trash2 } from "lucide-react";
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

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-bg-subtle border border-bg-subtle flex items-center justify-center flex-shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-[family-name:var(--font-playfair)] text-3xl text-accent">
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
        <div className="flex flex-wrap gap-3">
          <label
            htmlFor="avatar-input"
            className={`inline-flex items-center gap-2 border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-2 text-xs font-medium uppercase tracking-[0.15em] transition-colors cursor-pointer ${
              pending ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <Upload size={14} />
            {pending ? "Bezig..." : avatarUrl ? "Vervangen" : "Uploaden"}
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-red-400 transition-colors cursor-pointer px-2"
            >
              <Trash2 size={14} />
              Verwijderen
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted mt-2">
          JPG, PNG of WebP. Max 3 MB.
        </p>
        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}
      </div>
    </div>
  );
}
