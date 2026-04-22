export default function TrainersLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <div
        aria-hidden
        className="h-12 bg-bg-elevated mb-10 animate-pulse"
      />
      <div className="flex flex-col border-t border-[color:var(--ink-500)]/60">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="h-20 border-b border-[color:var(--ink-500)]/40 bg-bg-elevated/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
