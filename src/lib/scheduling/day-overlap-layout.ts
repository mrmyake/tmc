/**
 * Minimale vorm van een blok in een dagkolom van een tijdraster
 * (admin-rooster en trainer-agenda). Offsets zijn minuten na het begin van
 * het raster.
 */
export interface OverlapItem {
  id: string;
  startOffsetMin: number;
  durationMin: number;
}

export interface LaneInfo {
  lane: number;
  laneCount: number;
  overlapping: boolean;
}

/**
 * Wijst elke sessie een laan toe binnen de dagkolom zodat overlappende
 * sessies naast elkaar zichtbaar blijven in plaats van dat de een de ander
 * bedekt. Klassieke kalender-interval-clustering: sorteer op starttijd,
 * groepeer aaneengesloten overlappende sessies in een cluster, wijs binnen
 * elk cluster gulzig lanen toe (hergebruik een laan zodra de sessie
 * daarin past).
 *
 * Zonder `compare` is het gedrag identiek aan de oorspronkelijke
 * trainer-agenda-versie: stabiele volgorde op starttijd. Met `compare`
 * worden de sessies binnen een cluster eerst in die volgorde gelegd (het
 * admin-rooster zet geplande lessen vóór geannuleerde, zodat die de eerste
 * lanen krijgen). Een laan is vrij als er geen enkele sessie in overlapt,
 * dus de uitkomst is ook zonder starttijd-volgorde overlap-vrij.
 *
 * Overlap wordt bepaald op de kern-tijd (start/duur), niet op een buffer.
 */
export function layoutDayOverlaps<T extends OverlapItem>(
  sessions: T[],
  compare?: (a: T, b: T) => number,
): (T & LaneInfo)[] {
  const sorted = sessions
    .map((session) => ({
      session,
      startMin: session.startOffsetMin,
      endMin: session.startOffsetMin + session.durationMin,
    }))
    .sort((a, b) => a.startMin - b.startMin);

  const result: (T & LaneInfo)[] = [];
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const ordered = compare
      ? [...cluster].sort(
          (a, b) =>
            compare(a.session, b.session) ||
            a.startMin - b.startMin,
        )
      : cluster;
    const lanes: { startMin: number; endMin: number }[][] = [];
    const laneOf = new Map<string, number>();
    for (const item of ordered) {
      let lane = lanes.findIndex((taken) =>
        taken.every((t) => t.endMin <= item.startMin || t.startMin >= item.endMin),
      );
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(item);
      laneOf.set(item.session.id, lane);
    }
    const laneCount = lanes.length;
    const overlapping = cluster.length > 1;
    for (const item of cluster) {
      result.push({
        ...item.session,
        lane: laneOf.get(item.session.id) ?? 0,
        laneCount,
        overlapping,
      });
    }
    cluster = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flushCluster();

  return result;
}
