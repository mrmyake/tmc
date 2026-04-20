import { Container } from "@/components/layout/Container";

interface Props {
  label: string;
  heading: string;
  body: string;
}

export function Placeholder({ label, heading, body }: Props) {
  return (
    <Container className="py-12">
      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        {label}
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        {heading}
      </h1>
      <p className="text-text-muted max-w-xl">{body}</p>
    </Container>
  );
}
