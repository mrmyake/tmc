export default function MemberDetailLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 pt-8 pb-14">
      <div
        aria-hidden
        className="h-5 w-32 bg-bg-elevated mb-8 animate-pulse"
      />
      <div
        aria-hidden
        className="h-28 bg-bg-elevated border border-[color:var(--ink-500)]/60 mb-10 animate-pulse"
      />
      <div
        aria-hidden
        className="h-10 bg-bg-elevated mb-8 animate-pulse"
      />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="h-16 bg-bg-elevated border border-[color:var(--ink-500)]/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
