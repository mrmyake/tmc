interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bg?: "default" | "elevated" | "subtle";
}

const bgColors = {
  default: "",
  elevated: "bg-bg-elevated",
  subtle: "bg-bg-subtle",
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
