interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="bg-bg-elevated p-8">
      <span className="tmc-eyebrow block mb-4">{label}</span>
      <p className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-none tracking-[-0.02em]">
        {value}
      </p>
      {hint && (
        <p className="mt-3 text-text-muted text-sm">{hint}</p>
      )}
    </div>
  );
}
