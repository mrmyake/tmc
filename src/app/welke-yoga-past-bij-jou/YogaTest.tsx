"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import {
  trackYogaTestBookClick,
  trackYogaTestComplete,
  trackYogaTestEmailSubmit,
  trackYogaTestStart,
} from "@/lib/analytics";
import type { AttributionParams } from "@/lib/attribution/params";
import {
  CARE_QUESTION_INDEX,
  QUESTION_COUNT,
  mailThanks,
  outcomes,
  questions,
  resultCopy,
  yogaQuiz,
  type OutcomeKey,
} from "@/lib/yoga-test/config";
import { callPath, codeBookingPath, paidBookingPath } from "@/lib/yoga-test/links";
import {
  chosenBucket,
  formatSlot,
  formatSlotShort,
  rankOutcomes,
  slotBucket,
  sortSlots,
  wantsCareNote,
  type ScheduleByOutcome,
} from "@/lib/yoga-test/scoring";

/**
 * De quiz "Welke yoga past bij jou?" (spec-yoga-test.md): drie views op een
 * pagina (start, vraag, uitslag). Alle inhoud komt uit
 * src/lib/yoga-test/config.ts; de puntentelling uit src/lib/yoga-test/scoring.ts.
 * Alle Nederlandse tekst: COPY: confirm met Marlon.
 *
 * Mobiel eerst. Een antwoord tikken gaat automatisch door. De boekknoppen
 * zijn gewone <a>-links (geen prefetch): de startroute zet een cookie en mag
 * nooit door prefetching worden aangeroepen.
 */

type View = "start" | "question" | "result";

const ADVANCE_DELAY_MS = 180;

const primaryLink =
  "inline-flex w-full items-center justify-center px-7 py-4 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] transition-all duration-500 sm:w-auto";
const secondaryLink =
  "inline-flex w-full items-center justify-center px-7 py-4 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent active:scale-[0.99] transition-all duration-500 sm:w-auto";
const primaryButton = primaryLink.replace("sm:w-auto", "sm:w-auto cursor-pointer");

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-6">
      <span aria-hidden className="w-10 h-px bg-accent" />
      {children}
    </span>
  );
}

export function YogaTest({
  schedule,
  codeActive,
  attribution,
}: {
  schedule: ScheduleByOutcome;
  codeActive: boolean;
  attribution: AttributionParams;
}) {
  const [view, setView] = useState<View>("start");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  // De bezoeker kan op de uitslag wisselen naar de nummer 2 ("Bekijk").
  const [shownKey, setShownKey] = useState<OutcomeKey | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start" });
  }, [view, index]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const ranking = useMemo(
    () => (view === "result" ? rankOutcomes(answers, schedule) : []),
    [view, answers, schedule],
  );

  function start() {
    trackYogaTestStart();
    setAnswers([]);
    setIndex(0);
    setShownKey(null);
    setView("question");
  }

  function restart() {
    setAnswers([]);
    setIndex(0);
    setShownKey(null);
    setView("start");
  }

  function previous() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (index === 0) {
      setView("start");
      return;
    }
    setIndex(index - 1);
  }

  function choose(optionIndex: number) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const next = [...answers.slice(0, index), optionIndex];
    setAnswers(next);
    advanceTimer.current = setTimeout(() => {
      if (index + 1 < QUESTION_COUNT) {
        setIndex(index + 1);
        return;
      }
      const ranked = rankOutcomes(next, schedule);
      if (ranked[0]) trackYogaTestComplete(ranked[0].key);
      setView("result");
    }, ADVANCE_DELAY_MS);
  }

  return (
    <Section className="pt-28 md:pt-36 min-h-[85vh]">
      <Container className="max-w-3xl">
        <div ref={topRef} className="scroll-mt-24" />
        {view === "start" && <StartView onStart={start} />}
        {view === "question" && (
          <QuestionView
            index={index}
            selected={answers[index]}
            onChoose={choose}
            onPrevious={previous}
          />
        )}
        {view === "result" && (
          <ResultView
            answers={answers}
            ranking={ranking.map((r) => r.key)}
            shownKey={shownKey}
            onShow={setShownKey}
            schedule={schedule}
            codeActive={codeActive}
            attribution={attribution}
            onRestart={restart}
          />
        )}
      </Container>
    </Section>
  );
}

function StartView({ onStart }: { onStart: () => void }) {
  const { start } = yogaQuiz;
  return (
    <div>
      <Eyebrow>{/* COPY: confirm met Marlon */ start.eyebrow}</Eyebrow>
      <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
        {/* COPY: confirm met Marlon */}
        {start.title}
      </h1>
      <p className="text-text-muted text-lg leading-relaxed mb-8 max-w-xl">
        {/* COPY: confirm met Marlon */}
        {start.lead}
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 mb-10 text-sm text-text">
        {start.facts.map((fact) => (
          <li key={fact} className="flex items-center gap-3">
            <span aria-hidden className="w-1.5 h-1.5 bg-accent" />
            {/* COPY: confirm met Marlon */}
            {fact}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onStart} className={primaryButton}>
        {/* COPY: confirm met Marlon */}
        {start.button}
      </button>
      <p className="text-text-muted text-sm mt-4">
        {/* COPY: confirm met Marlon */}
        {start.note}
      </p>
    </div>
  );
}

function QuestionView({
  index,
  selected,
  onChoose,
  onPrevious,
}: {
  index: number;
  selected: number | undefined;
  onChoose: (optionIndex: number) => void;
  onPrevious: () => void;
}) {
  const question = questions[index];
  const progress = ((index + 1) / QUESTION_COUNT) * 100;
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-[0.18em] text-text-muted">
          <span aria-live="polite">
            {/* COPY: confirm met Marlon */}
            Vraag {index + 1} van {QUESTION_COUNT}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={QUESTION_COUNT}
          aria-valuenow={index + 1}
          className="h-px w-full bg-text-muted/20"
        >
          <div
            className="h-px bg-accent transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3 leading-[1.15] tracking-[-0.01em]">
        {/* COPY: confirm met Marlon */}
        {question.text}
      </h2>
      {question.hint ? (
        <p className="text-text-muted text-sm mb-6">
          {/* COPY: confirm met Marlon */}
          {question.hint}
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <div role="group" aria-label={question.text} className="space-y-3">
        {question.options.map((option, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={option.text}
              type="button"
              onClick={() => onChoose(i)}
              aria-pressed={isSelected}
              className={`w-full min-h-14 text-left px-5 py-4 text-base leading-snug border rounded-[4px] transition-colors duration-300 cursor-pointer ${
                isSelected
                  ? "border-accent text-text bg-bg-elevated"
                  : "border-text-muted/25 text-text hover:border-accent/70 hover:bg-bg-elevated"
              }`}
            >
              {/* COPY: confirm met Marlon */}
              {option.text}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onPrevious}
        className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        {resultCopy.previous}
      </button>
    </div>
  );
}

function ResultView({
  answers,
  ranking,
  shownKey,
  onShow,
  schedule,
  codeActive,
  attribution,
  onRestart,
}: {
  answers: number[];
  ranking: OutcomeKey[];
  shownKey: OutcomeKey | null;
  onShow: (key: OutcomeKey | null) => void;
  schedule: ScheduleByOutcome;
  codeActive: boolean;
  attribution: AttributionParams;
  onRestart: () => void;
}) {
  if (ranking.length === 0) {
    return (
      <div>
        <Eyebrow>{yogaQuiz.start.eyebrow}</Eyebrow>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-text mb-4 leading-[1.1]">
          {/* COPY: confirm met Marlon */}
          {resultCopy.noScheduleTitle}
        </h1>
        <p className="text-text-muted text-lg mb-8 max-w-xl">
          {/* COPY: confirm met Marlon */}
          {resultCopy.noScheduleBody}
        </p>
        <a href="/proefles" className={primaryLink}>
          {/* COPY: confirm met Marlon */}
          {resultCopy.noScheduleButton}
        </a>
      </div>
    );
  }

  const bucket = chosenBucket(answers);
  const topKey = ranking[0];
  const key = shownKey && ranking.includes(shownKey) ? shownKey : topKey;
  const outcome = outcomes[key];
  // "Ook iets voor jou": de nummer 2, of na het wisselen de oorspronkelijke nummer 1.
  const alsoKey = key === topKey ? ranking[1] : topKey;
  const also = alsoKey ? outcomes[alsoKey] : null;
  const slots = sortSlots(schedule[key]);
  const alsoSlots = alsoKey ? sortSlots(schedule[alsoKey]) : [];

  const bookHref = codeActive
    ? codeBookingPath(outcome.classTypeId, bucket, attribution)
    : paidBookingPath(outcome.classTypeId, bucket, attribution);

  return (
    <div className="space-y-10">
      <div className="bg-bg-elevated p-7 md:p-10 relative rounded-[8px]">
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          {/* COPY: confirm met Marlon */}
          {outcome.eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {outcome.name}
        </h1>
        <p className="text-text text-lg leading-relaxed mb-4">
          {/* COPY: confirm met Marlon */}
          {outcome.why}
        </p>
        <p className="text-text-muted leading-relaxed">
          {/* COPY: confirm met Marlon */}
          {outcome.what}
        </p>

        <div className="mt-8">
          <span className="tmc-eyebrow block mb-3">
            {/* COPY: confirm met Marlon */}
            {resultCopy.onSchedule}
          </span>
          <ul className="space-y-1">
            {slots.map((slot) => {
              const inBucket = bucket !== null && slotBucket(slot) === bucket;
              return (
                <li
                  key={`${slot.day}-${slot.time}`}
                  className={`border-l-2 pl-3 text-text ${
                    inBucket ? "border-accent" : "border-transparent"
                  }`}
                >
                  {formatSlot(slot)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {wantsCareNote(answers) && (
        <p className="text-text-muted leading-relaxed border-l-2 border-accent/60 pl-4">
          {/* COPY: confirm met Marlon */}
          {yogaQuiz.careNoteText}
        </p>
      )}

      {codeActive && (
        <div className="border border-dashed border-accent/70 p-6 text-center rounded-[8px]">
          <p className="text-text-muted text-sm mb-2">
            {/* COPY: confirm met Marlon */}
            {resultCopy.codeLead}
          </p>
          <p className="font-[family-name:var(--font-playfair)] text-3xl tracking-[0.14em] text-accent">
            {yogaQuiz.trialCode}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href={bookHref}
          onClick={() => trackYogaTestBookClick(key, codeActive ? "code" : "betaald")}
          className={primaryLink}
        >
          {/* COPY: confirm met Marlon */}
          {codeActive ? resultCopy.bookFree : resultCopy.bookPaid}
        </a>
        <a
          href={callPath(attribution)}
          onClick={() => trackYogaTestBookClick(key, "bellen")}
          className={secondaryLink}
        >
          {/* COPY: confirm met Marlon */}
          {resultCopy.callFirst}
        </a>
      </div>

      {also && (
        <div className="border-t border-bg-subtle pt-8">
          <span className="tmc-eyebrow block mb-3">
            {/* COPY: confirm met Marlon */}
            {resultCopy.alsoTitle}
          </span>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-text text-xl font-medium">{also.name}</p>
              <p className="text-text-muted text-sm mt-1">
                {alsoSlots.map(formatSlotShort).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onShow(alsoKey === topKey ? null : alsoKey)}
              className="shrink-0 text-xs font-medium uppercase tracking-[0.18em] text-accent hover:underline cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {resultCopy.alsoButton}
            </button>
          </div>
        </div>
      )}

      <MailBlock
        answers={answers}
        resultKey={key}
        lessonName={outcome.name}
        attribution={attribution}
      />

      <button
        type="button"
        onClick={onRestart}
        className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        {resultCopy.restart}
      </button>
    </div>
  );
}

function MailBlock({
  answers,
  resultKey,
  lessonName,
  attribution,
}: {
  answers: number[];
  resultKey: OutcomeKey;
  lessonName: string;
  attribution: AttributionParams;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneName, setDoneName] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    trackYogaTestEmailSubmit(resultKey, optIn);
    try {
      const res = await fetch("/api/yoga-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // De zorgvraag blijft in de browser; de server rekent de uitslag zelf uit.
          answers: answers.slice(0, CARE_QUESTION_INDEX),
          show: resultKey,
          name,
          email,
          optIn,
          attribution,
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? resultCopy.mailRateLimited : resultCopy.mailError);
        setBusy(false);
        return;
      }
      setDoneName(name);
    } catch {
      setError(resultCopy.mailError);
    }
    setBusy(false);
  }

  return (
    <div className="bg-bg-elevated p-7 md:p-8 rounded-[8px]">
      <h2 className="text-2xl font-medium text-text mb-2 tracking-[-0.01em]">
        {/* COPY: confirm met Marlon */}
        {resultCopy.mailTitle}
      </h2>
      {doneName !== null ? (
        <p role="status" className="text-text leading-relaxed">
          {/* COPY: confirm met Marlon */}
          {mailThanks(doneName, lessonName)}
        </p>
      ) : (
        <>
          <p className="text-text-muted text-sm leading-relaxed mb-6">
            {/* COPY: confirm met Marlon */}
            {resultCopy.mailLead}
          </p>
          <form onSubmit={submit} className="space-y-5">
            <Field label={resultCopy.mailNameLabel} htmlFor="yoga-test-name">
              <input
                id="yoga-test-name"
                type="text"
                name="name"
                autoComplete="given-name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldInputClasses}
              />
            </Field>
            <Field label={resultCopy.mailEmailLabel} htmlFor="yoga-test-email">
              <input
                id="yoga-test-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldInputClasses}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm text-text-muted leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              {/* COPY: confirm met Marlon */}
              <span>{resultCopy.mailOptIn}</span>
            </label>
            {error && (
              <p role="alert" className="text-[color:var(--danger)] text-sm">
                {/* COPY: confirm met Marlon */}
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className={`${primaryButton} disabled:opacity-60`}>
              {/* COPY: confirm met Marlon */}
              {busy ? resultCopy.mailSending : resultCopy.mailButton}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
