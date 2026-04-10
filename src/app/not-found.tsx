import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="min-h-[80vh] flex items-center justify-center pt-20">
      <Container className="text-center">
        <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
          404
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-4">
          Pagina niet gevonden
        </h1>
        <p className="text-text-muted text-lg mb-8 max-w-md mx-auto">
          De pagina die je zoekt bestaat niet of is verplaatst.
        </p>
        <Button href="/">Terug naar home</Button>
      </Container>
    </section>
  );
}
