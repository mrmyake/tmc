interface JsonLdProps {
  data: object | object[];
}

/**
 * Rendert één of meer JSON-LD blokken als <script type="application/ld+json">.
 * Server-component; bedoeld om in de page body te plaatsen.
 */
export function JsonLd({ data }: JsonLdProps) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
