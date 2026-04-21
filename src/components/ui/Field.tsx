interface FieldProps {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  htmlFor?: string;
}

export function Field({ label, children, error, hint, htmlFor }: FieldProps) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="tmc-eyebrow block mb-2">{label}</span>
      {children}
      {hint && !error && (
        <span className="text-text-muted text-xs mt-2 block">{hint}</span>
      )}
      {error && (
        <span className="text-[color:var(--danger)] text-xs mt-2 block">
          {error}
        </span>
      )}
    </label>
  );
}

export const fieldInputClasses =
  "w-full bg-transparent border-b border-text-muted/30 focus:border-accent px-0 py-3 text-text text-base placeholder:text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] outline-none";
