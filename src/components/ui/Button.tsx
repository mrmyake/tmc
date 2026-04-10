import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  href?: string;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent-hover",
  secondary:
    "border border-accent text-accent hover:bg-accent hover:text-bg",
  ghost:
    "text-text-muted hover:text-text",
};

export function Button({
  children,
  variant = "primary",
  href,
  className = "",
  type = "button",
  onClick,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center px-8 py-3 text-sm font-medium uppercase tracking-[0.15em] transition-colors duration-300 cursor-pointer";
  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
