export default function LedenLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Leden.
        </h1>
      </header>

      <div
        aria-hidden
        className="h-14 bg-bg-elevated border border-[color:var(--ink-500)]/60 mb-8 animate-pulse"
      />

      <div className="flex flex-col gap-0 border-t border-[color:var(--ink-500)]/60">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="h-16 border-b border-[color:var(--ink-500)]/40 bg-bg-elevated/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
