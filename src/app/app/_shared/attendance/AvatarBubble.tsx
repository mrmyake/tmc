import Image from "next/image";

interface AvatarBubbleProps {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  size?: 32 | 40 | 48;
}

function initialsOf(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

export function AvatarBubble({
  firstName,
  lastName,
  avatarUrl,
  size = 40,
}: AvatarBubbleProps) {
  const label = `${firstName} ${lastName}`.trim() || "Lid";
  const initials = initialsOf(firstName, lastName);
  const px = `${size}px`;

  if (avatarUrl) {
    return (
      <span
        aria-label={label}
        className="relative inline-flex overflow-hidden bg-bg-elevated border border-[color:var(--ink-500)]"
        style={{ width: px, height: px, borderRadius: "50%" }}
      >
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      </span>
    );
  }

  return (
    <span
      aria-label={label}
      className="inline-flex items-center justify-center bg-bg-elevated border border-accent/40 text-text text-[11px] font-medium uppercase tracking-[0.12em] font-[family-name:var(--font-playfair)]"
      style={{ width: px, height: px, borderRadius: "50%" }}
    >
      {initials}
    </span>
  );
}
