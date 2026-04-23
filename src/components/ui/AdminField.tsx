import * as React from "react";

/**
 * Shared admin form primitives. The admin surfaces use a utility-style
 * input (border-box, compact padding) instead of the editorial
 * underlined `<Field>` used on member-facing forms. Before this, the
 * same class-string was repeated 40+ times across 12 files.
 *
 * All three inputs share the same base className so they line up
 * visually. Focus ring + disabled state live here, not in callers.
 */

const baseInputClass =
  "bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent disabled:opacity-50";

export interface AdminFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  /** Horizontal (grid-row) vs vertical (stacked) label layout. */
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/** Wrapper that renders the eyebrow label + optional hint/error below. */
export function AdminField({
  label,
  hint,
  error,
  children,
  orientation = "vertical",
  className = "",
}: AdminFieldProps) {
  if (orientation === "horizontal") {
    return (
      <label
        className={`grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-6 pb-5 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0 ${className}`}
      >
        {label && <span className="tmc-eyebrow pt-3">{label}</span>}
        <div className="flex flex-col gap-2">
          {children}
          {hint && !error && (
            <span className="text-text-muted text-xs">{hint}</span>
          )}
          {error && (
            <span className="text-[color:var(--danger)] text-xs">{error}</span>
          )}
        </div>
      </label>
    );
  }
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      {label && <span className="tmc-eyebrow">{label}</span>}
      {children}
      {hint && !error && (
        <span className="text-text-muted text-xs">{hint}</span>
      )}
      {error && (
        <span className="text-[color:var(--danger)] text-xs">{error}</span>
      )}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Admin input with design-system border + focus state pre-applied. */
export const AdminInput = React.forwardRef<HTMLInputElement, InputProps>(
  function AdminInput({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={`${baseInputClass} ${className}`}
      />
    );
  },
);

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const AdminSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  function AdminSelect({ className = "", children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        {...rest}
        className={`${baseInputClass} cursor-pointer ${className}`}
      >
        {children}
      </select>
    );
  },
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const AdminTextarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(function AdminTextarea({ className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`${baseInputClass} resize-none ${className}`}
    />
  );
});
