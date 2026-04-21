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
    "bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99]",
  secondary:
    "border border-text-muted/30 text-text hover:border-accent hover:text-accent active:scale-[0.99]",
  ghost:
    "text-text-muted hover:text-accent",
};

const base =
  "inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer";

export function Button({
  children,
  variant = "primary",
  href,
  className = "",
  type = "button",
  onClick,
}: ButtonProps) {
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
