interface SectionHeadingProps {
  label?: string;
  heading: string;
  subtext?: string;
  align?: "left" | "center";
}

export function SectionHeading({
  label,
  heading,
  subtext,
  align = "center",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center" : "text-left";

  return (
    <div className={`${alignment} mb-12 md:mb-16`}>
      {label && (
        <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
          {label}
        </span>
      )}
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-4">
        {heading}
      </h2>
      {subtext && (
        <p className="text-text-muted text-lg max-w-2xl mx-auto">{subtext}</p>
      )}
    </div>
  );
}
