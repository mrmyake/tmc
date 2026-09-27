"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { controlRoom } from "@/lib/room-control/actions";
import type { RoomControlResult } from "@/lib/room-control/core";
import {
  COPY,
  NOTICE_MS,
  ROOM_LABEL,
  STATUS_INTERVAL_MS,
  VOLUME_DEBOUNCE_MS,
  VOLUME_STEP,
  connectionText,
  createVolumeDebouncer,
  initialState,
  inputFor,
  isActionDisabled,
  isPlayPauseDisabled,
  reduce,
  redirectFor,
  scenesFor,
  statusInput,
  type Busy,
  type Room,
} from "../_lib/controller";
import styles from "../bediening.module.css";

const ROOMS: readonly Room[] = ["yoga", "kracht"];

/**
 * Dunne React-schil om controller.ts: state via useReducer, één lopende
 * actie tegelijk, status bij openen, tabwissel, na elke actie en elke 15 s
 * zolang de tab zichtbaar is. Alle knoppen zijn minimaal 56 px en werken
 * zonder hover.
 */
export function RoomControlPanel({ initialRoom }: { initialRoom: Room }) {
  const [state, dispatch] = useReducer(reduce, initialRoom, initialState);
  // Refs voor de asynchrone paden (antwoord van een oude zaal negeren, de
  // getoonde volumewaarde bij een tik); bijgewerkt na elke render, nooit
  // tijdens de render zelf.
  const roomRef = useRef<Room>(initialRoom);
  const volumeRef = useRef(0);
  useEffect(() => {
    roomRef.current = state.room;
    volumeRef.current = state.volume;
  }, [state.room, state.volume]);
  const debouncer = useRef<ReturnType<typeof createVolumeDebouncer> | null>(null);
  const runActionRef = useRef<(busy: Busy) => Promise<void>>(async () => {});

  const handleResult = useCallback((result: RoomControlResult) => {
    const to = redirectFor(result);
    if (to) window.location.assign(to);
  }, []);

  const refreshStatus = useCallback(async () => {
    const room = roomRef.current;
    const result = await controlRoom(statusInput(room));
    // Een tabwissel tijdens het wachten: dit antwoord hoort bij de oude zaal.
    if (roomRef.current !== room) return;
    handleResult(result);
    dispatch({
      type: "status_result",
      result,
      preserveVolume: debouncer.current?.isPending() ?? false,
    });
  }, [handleResult]);

  const runAction = useCallback(
    async (busy: Busy) => {
      const room = roomRef.current;
      dispatch({ type: "action_start", busy });
      const result = await controlRoom(inputFor(room, busy));
      handleResult(result);
      if (roomRef.current !== room) return;
      dispatch({ type: "action_result", busy, result });
      await refreshStatus();
    },
    [handleResult, refreshStatus],
  );

  useEffect(() => {
    runActionRef.current = runAction;
  }, [runAction]);

  // Volume: snelle tikken verzamelen, na 400 ms één verzoek met de eindwaarde.
  // Aangemaakt bij mount; onFlush gaat via de ref zodat hij nooit een oude
  // runAction vasthoudt.
  useEffect(() => {
    const d = createVolumeDebouncer({
      delayMs: VOLUME_DEBOUNCE_MS,
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: (h) => window.clearTimeout(h as number),
      onFlush: (level) => {
        void runActionRef.current({ kind: "volume", level });
      },
    });
    debouncer.current = d;
    return () => {
      d.dispose();
      debouncer.current = null;
    };
  }, []);

  function tapVolume(delta: number) {
    const d = debouncer.current;
    if (!d) return;
    const shown = d.tap(volumeRef.current, delta);
    dispatch({ type: "volume_preview", volume: shown });
  }

  // Status bij openen en bij tabwissel.
  useEffect(() => {
    void refreshStatus();
  }, [state.room, refreshStatus]);

  // Elke 15 s zolang de tab zichtbaar is.
  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(() => void refreshStatus(), STATUS_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshStatus();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshStatus]);

  // Meldingen verdwijnen vanzelf.
  useEffect(() => {
    if (!state.notice) return;
    const t = window.setTimeout(() => dispatch({ type: "clear_notice" }), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [state.notice]);

  const scenes = scenesFor(state.room);
  const disabled = isActionDisabled(state);
  const playDisabled = isPlayPauseDisabled(state);
  const label = ROOM_LABEL[state.room];
  const offline = state.connection === "unavailable";

  return (
    <section className={styles.screen} aria-labelledby="bediening-title">
      <div className={styles.top}>
        <Link href="/kiosk" className={styles.back}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {COPY.back}
        </Link>
        <h1 id="bediening-title" className={styles.srOnly}>
          {COPY.screenTitle}
        </h1>
        <div className={styles.tabs} role="tablist">
          {ROOMS.map((room) => (
            <button
              key={room}
              type="button"
              role="tab"
              aria-selected={room === state.room}
              className={room === state.room ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => {
                debouncer.current?.flush();
                dispatch({ type: "switch_room", room });
              }}
            >
              {ROOM_LABEL[room]}
            </button>
          ))}
        </div>
        <div className={styles.haStatus} role="status">
          <span className={offline ? `${styles.dot} ${styles.dotOff}` : styles.dot} aria-hidden />
          <span>{connectionText(state)}</span>
        </div>
      </div>

      {offline && <div className={styles.haDown}>{COPY.unavailableBar}</div>}

      <div className={styles.ctl}>
        <div>
          <div className={styles.sectionLabel}>{COPY.lightLabel}</div>
          {scenes.length === 0 ? (
            <div className={styles.noLight}>{COPY.noLight}</div>
          ) : (
            <div className={styles.scenes}>
              {scenes.map((s) => {
                const busyHere = state.busy?.kind === "scene" && state.busy.scene === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={busyHere ? `${styles.scene} ${styles.sceneBusy}` : styles.scene}
                    disabled={disabled}
                    onClick={() => void runAction({ kind: "scene", scene: s.id })}
                  >
                    <div className={styles.sceneName}>{s.name}</div>
                    <div className={styles.sceneDesc}>{s.description}</div>
                    <div className={styles.sceneState}>{busyHere ? COPY.busy : ""}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.musicColumn}>
          <div className={styles.sectionLabel}>{COPY.musicLabel}</div>
          <div className={styles.music}>
            <div className={styles.mHead}>
              <div className={styles.mName}>{COPY.sonosName(label)}</div>
              <div className={state.playing ? styles.mState : `${styles.mState} ${styles.mStatePaused}`}>
                {state.playing ? COPY.playing : COPY.paused}
              </div>
            </div>
            <div className={styles.mPlay}>
              <button
                type="button"
                className={styles.playBtn}
                aria-label={COPY.playPauseAria}
                disabled={playDisabled}
                onClick={() => void runAction({ kind: "play_pause" })}
              >
                {state.playing ? (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M8 5l12 7-12 7z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <div className={styles.mHint}>{COPY.hint}</div>
            </div>
            <div className={styles.volLabel}>
              <span>{COPY.volume}</span>
              <strong>{state.volume}</strong>
            </div>
            <div className={styles.vol}>
              <button
                type="button"
                className={styles.vBtn}
                aria-label={COPY.softer}
                disabled={disabled}
                onClick={() => tapVolume(-VOLUME_STEP)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M5 12h14" />
                </svg>
              </button>
              <div className={styles.bar}>
                <div className={styles.barFill} style={{ width: `${state.volume}%` }} />
              </div>
              <button
                type="button"
                className={styles.vBtn}
                aria-label={COPY.louder}
                disabled={disabled}
                onClick={() => tapVolume(VOLUME_STEP)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
          <button
            type="button"
            className={styles.allOff}
            disabled={disabled}
            onClick={() => void runAction({ kind: "all_off" })}
          >
            {state.busy?.kind === "all_off" ? COPY.busy : COPY.allOff(label)}
          </button>
        </div>
      </div>

      <div
        className={
          state.notice
            ? `${styles.toast} ${styles.toastShow}${state.notice.tone === "error" ? ` ${styles.toastError}` : ""}`
            : styles.toast
        }
        role="status"
        aria-live="polite"
      >
        {state.notice?.text ?? ""}
      </div>
    </section>
  );
}
