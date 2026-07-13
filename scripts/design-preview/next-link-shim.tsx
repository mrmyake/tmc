import * as React from "react";

interface ShimLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: React.ReactNode;
}

/**
 * Design-preview-only vervanging van next/link. De echte Link vereist
 * App Router-context die buiten de Next-runtime niet bestaat; voor een
 * statische, zelfstandige HTML-export is een gewone <a> visueel identiek
 * en functioneel voldoende (de href's wijzen toch naar auth-gated routes
 * die in deze preview niet hoeven te werken). Alleen gebruikt door het
 * export-script (via esbuild alias), nooit door de echte app.
 */
export default function Link({ href, children, ...rest }: ShimLinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
