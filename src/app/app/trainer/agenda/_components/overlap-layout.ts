import type { AgendaSessionBlockData } from "./types";

interface Interval {
  startMin: number;
  endMin: number;
}

/**
 * Wijst elke sessie een laan toe binnen de dagkolom zodat bewust
 * overlappende sessies (dubbelboekingen) naast elkaar zichtbaar blijven
 * in plaats van dat de een de ander bedekt. Zelfde aanpak als de
 * klassieke kalender-interval-clustering: sorteer op starttijd, groepeer
 * aaneengesloten overlappende sessies in een cluster, wijs binnen elk
 * cluster gulzig lanen toe (hergebruik een laan zodra de vorige sessie
 * daarin voorbij is).
 *
 * Overlap wordt bepaald op de kern-tijd (start/duur), niet op de
 * omkleedtijd-buffer uit get_pt_busy — de buffer is een losse visuele
 * strook, geen reden om lanen te splitsen.
 */
export function layoutDayOverlaps<T extends AgendaSessionBlockData>(
  sessions: T[],
): T[] {
  const withInterval = sessions.map((s) => ({
    session: s,
    interval: {
      startMin: s.startOffsetMin,
      endMin: s.startOffsetMin + s.durationMin,
    } as Interval,
  }));
  const sorted = [...withInterval].sort(
    (a, b) => a.interval.startMin - b.interval.startMin,
  );

  const result: T[] = [];
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEndTimes: number[] = [];
    const laneOf = new Map<string, number>();
    for (const item of cluster) {
      let lane = laneEndTimes.findIndex(
        (end) => end <= item.interval.startMin,
      );
      if (lane === -1) {
        lane = laneEndTimes.length;
        laneEndTimes.push(item.interval.endMin);
      } else {
        laneEndTimes[lane] = item.interval.endMin;
      }
      laneOf.set(item.session.id, lane);
    }
    const laneCount = laneEndTimes.length;
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
    if (item.interval.startMin >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.interval.endMin);
  }
  flushCluster();

  return result;
}
