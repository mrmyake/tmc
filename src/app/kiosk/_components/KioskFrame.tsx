import Link from "next/link";
import { KioskAutoRefresh } from "./KioskAutoRefresh";
import styles from "../kiosk.module.css";

export interface KioskSession {
  id: string;
  startAt: Date;
  endAt: Date;
  className: string;
  trainerName: string;
  bookedCount: number;
  checkedInCount: number;
}

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function sessionHref(id: string) {
  return `/app/trainer/sessies/${id}?from=kiosk`;
}

export function KioskFrame({
  now,
  sessions,
}: {
  now: Date;
  sessions: KioskSession[];
}) {
  const nowMs = now.getTime();
  const active = sessions.find(
    (s) => s.startAt.getTime() <= nowMs && nowMs < s.endAt.getTime(),
  );
  const next = active
    ? undefined
    : sessions.find((s) => s.startAt.getTime() > nowMs);
  const hero = active ?? next;

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.wordmark}>
          The Movement <span className={styles.wordmarkAccent}>Club</span>
        </div>
        <div className={styles.headerRight}>
          {/* COPY: confirm met Marlon */}
          <div className={styles.todayDate}>{dateFmt.format(now)}</div>
          <div className={styles.clock}>{timeFmt.format(now)}</div>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.now}>
          {hero ? (
            <HeroSession session={hero} isActive={hero === active} />
          ) : (
            <div className={styles.emptyState}>
              {/* COPY: confirm met Marlon */}
              <div className={styles.emptyTitle}>Geen les nu.</div>
              {/* COPY: confirm met Marlon */}
              <div className={styles.emptySubtitle}>
                Kijk in het rooster voor de rest van de dag.
              </div>
            </div>
          )}
        </section>

        <aside className={styles.day}>
          {/* COPY: confirm met Marlon */}
          <div className={styles.dayHeading}>Vandaag</div>

          {sessions.map((s) => (
            <ClassRow key={s.id} session={s} isNow={s === active} now={now} />
          ))}

          <div className={styles.dayFooter}>
            {/* COPY: confirm met Marlon */}
            <span>Kiosk entree</span>
            {/* COPY: confirm met Marlon */}
            <span>
              {sessions.length} {sessions.length === 1 ? "les" : "lessen"}{" "}
              vandaag
            </span>
          </div>
        </aside>
      </div>

      <KioskAutoRefresh />
    </div>
  );
}

function HeroSession({
  session,
  isActive,
}: {
  session: KioskSession;
  isActive: boolean;
}) {
  const pct =
    session.bookedCount > 0
      ? Math.round((session.checkedInCount / session.bookedCount) * 100)
      : 0;

  return (
    <>
      <div className={styles.nowFlag}>
        {isActive && <span className={styles.dot} aria-hidden />}
        {/* COPY: confirm met Marlon */}
        {isActive ? "Nu bezig" : "Straks"}
      </div>

      <div className={styles.nowTime}>
        {isActive ? (
          `${timeFmt.format(session.startAt)} tot ${timeFmt.format(session.endAt)}`
        ) : (
          <>
            {/* COPY: confirm met Marlon */}
            vanaf {timeFmt.format(session.startAt)}
          </>
        )}
      </div>
      <h1 className={styles.nowTitle}>{session.className}</h1>
      <div className={styles.nowTrainer}>{session.trainerName}</div>

      <div className={styles.progressBlock}>
        <div className={styles.progressFigure}>
          <div className={styles.progressCount}>
            {session.checkedInCount}
            <span className={styles.progressCountOf}>
              {" "}
              / {session.bookedCount}
            </span>
          </div>
          {/* COPY: confirm met Marlon */}
          <div className={styles.progressLabel}>ingecheckt</div>
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* COPY: confirm met Marlon */}
      <Link href={sessionHref(session.id)} className={styles.cta}>
        Deelnemers inchecken
      </Link>
    </>
  );
}

function ClassRow({
  session,
  isNow,
  now,
}: {
  session: KioskSession;
  isNow: boolean;
  now: Date;
}) {
  const isPast = session.endAt.getTime() <= now.getTime();
  const isComplete =
    session.bookedCount > 0 && session.checkedInCount >= session.bookedCount;

  const rowClass = [
    styles.classRow,
    isNow ? styles.classRowIsNow : "",
    isPast ? styles.classRowIsPast : "",
  ]
    .filter(Boolean)
    .join(" ");
  const countClass = [styles.rowCount, isComplete ? styles.rowCountComplete : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={sessionHref(session.id)} className={rowClass}>
      <div className={styles.rowTime}>{timeFmt.format(session.startAt)}</div>
      <div>
        <div className={styles.rowTitle}>{session.className}</div>
        <div className={styles.rowTrainer}>{session.trainerName}</div>
      </div>
      <div className={countClass}>
        {session.checkedInCount} / {session.bookedCount}
      </div>
    </Link>
  );
}
