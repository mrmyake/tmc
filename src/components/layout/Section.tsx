interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bg?: "default" | "elevated" | "subtle" | "stone";
}

const bgColors = {
  default: "",
  elevated: "bg-bg-elevated",
  subtle: "bg-bg-subtle",
  // Light/stone surface — first section on the site to break from the
  // all-dark palette (12-weken-programma's "sec-light"). Aliases the
  // surface-light / on-light theme tokens added in globals.css so any
  // future light section can reuse the same pairing.
  stone: "bg-surface-light text-on-light",
};

export function Section({
  children,
  className = "",
  id,
  bg = "default",
}: SectionProps) {
  return (
    <section
      id={id}
      className={`py-20 md:py-28 lg:py-32 ${bgColors[bg]} ${className}`}
    >
      {children}
    </section>
  );
}
