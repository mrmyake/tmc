import type { Coordinaat } from "@/content/lokaal";

export interface KaartPunt extends Coordinaat {
  naam: string;
  uitgelicht?: boolean;
  /** Korte regel onder de naam, bv. "12 min". */
  badge?: string;
}

interface RegioKaartProps {
  studio: Coordinaat;
  punten: readonly KaartPunt[];
  /** regio: rechte lijnen naar elke plaats. route: een gebogen route naar één plaats. */
  variant: "regio" | "route";
  className?: string;
}

const MAATEN = {
  regio: { w: 560, h: 440, padL: 40, padR: 70, padT: 56, padB: 40 },
  route: { w: 400, h: 220, padL: 40, padR: 40, padT: 40, padB: 36 },
} as const;

/**
 * Schematische kaart als SVG uit lat en lon in de content. Geen Google
 * Maps-embed: geen extra laadtijd en geen cookies. De posities zijn een
 * gelijkhoekige projectie (lengtegraad geschaald met de cosinus van de
 * breedtegraad), bedoeld als schets en niet als navigatie.
 */
export function RegioKaart({ studio, punten, variant, className = "" }: RegioKaartProps) {
  const m = MAATEN[variant];
  const alle = [studio, ...punten];
  const lats = alle.map((p) => p.lat);
  const lons = alle.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const kosinus = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);

  const breedte = Math.max((maxLon - minLon) * kosinus, 1e-6);
  const hoogte = Math.max(maxLat - minLat, 1e-6);
  const vrijeBreedte = m.w - m.padL - m.padR;
  const vrijeHoogte = m.h - m.padT - m.padB;
  const schaal = Math.min(vrijeBreedte / breedte, vrijeHoogte / hoogte);
  const offsetX = m.padL + (vrijeBreedte - breedte * schaal) / 2;
  const offsetY = m.padT + (vrijeHoogte - hoogte * schaal) / 2;

  const naarXY = (p: Coordinaat) => ({
    x: offsetX + (p.lon - minLon) * kosinus * schaal,
    y: offsetY + (maxLat - p.lat) * schaal,
  });

  const s = naarXY(studio);

  return (
    <svg
      viewBox={`0 0 ${m.w} ${m.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full ${className}`}
    >
      {punten.map((p) => {
        const xy = naarXY(p);
        const sterk = variant === "route" || p.uitgelicht;
        const stroke = sterk ? "rgba(185,152,106,0.75)" : "rgba(244,239,230,0.14)";
        if (variant === "route") {
          const cx1 = s.x + (xy.x - s.x) * 0.35;
          const cy1 = s.y;
          const cx2 = s.x + (xy.x - s.x) * 0.65;
          const cy2 = xy.y;
          return (
            <path
              key={`l-${p.naam}`}
              d={`M${s.x} ${s.y} C${cx1} ${cy1} ${cx2} ${cy2} ${xy.x} ${xy.y}`}
              stroke={stroke}
              strokeWidth={2.5}
              fill="none"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          );
        }
        return (
          <line
            key={`l-${p.naam}`}
            x1={s.x}
            y1={s.y}
            x2={xy.x}
            y2={xy.y}
            stroke={stroke}
            strokeWidth={sterk ? 2 : 1}
            strokeDasharray={sterk ? "6 6" : "3 5"}
          />
        );
      })}

      {punten.map((p) => {
        const xy = naarXY(p);
        const sterk = variant === "route" || p.uitgelicht;
        const fontSize = sterk ? (variant === "route" ? 13 : 24) : 15;
        // Houd het label binnen het kader: ankers links of rechts bij de rand.
        const anker = xy.x > m.w - 90 ? "end" : xy.x < 70 ? "start" : "middle";
        return (
          <g key={`p-${p.naam}`}>
            <circle
              cx={xy.x}
              cy={xy.y}
              r={sterk ? 6 : 4}
              fill={sterk ? "#F4EFE6" : "rgba(244,239,230,0.45)"}
            />
            <text
              x={xy.x}
              y={xy.y - 14}
              textAnchor={anker}
              fontSize={fontSize}
              fontFamily={sterk ? "var(--font-playfair), serif" : "var(--font-dm-sans), sans-serif"}
              fill={sterk ? "#F4EFE6" : "rgba(244,239,230,0.6)"}
            >
              {p.naam}
            </text>
            {p.badge && (
              <text
                x={xy.x}
                y={xy.y + 30}
                textAnchor={anker}
                fontSize={15}
                fontFamily="var(--font-dm-sans), sans-serif"
                fill="#B9986A"
              >
                {p.badge}
              </text>
            )}
          </g>
        );
      })}

      <circle cx={s.x} cy={s.y} r={variant === "route" ? 9 : 10} fill="#B9986A" />
      <circle
        cx={s.x}
        cy={s.y}
        r={variant === "route" ? 16 : 20}
        fill="none"
        stroke="rgba(185,152,106,0.4)"
      />
      <text
        x={s.x + 26}
        y={s.y + 5}
        fontSize={variant === "route" ? 13 : 16}
        fontWeight={600}
        fontFamily="var(--font-dm-sans), sans-serif"
        fill="#F4EFE6"
      >
        {variant === "route" ? "The Movement Club" : "The Movement Club, Loosdrecht"}
      </text>
    </svg>
  );
}
