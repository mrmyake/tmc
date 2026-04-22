"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  createPtBookingFromCredits,
  createPtBookingWithPayment,
} from "@/lib/member/pt-booking-actions";
import {
  calculatePtPriceCents,
  qualifiesForIntakeDiscount,
} from "@/lib/member/pt-pricing";
import { PtStepper } from "./_components/PtStepper";
import {
  TrainerStep,
  type TrainerOption,
} from "./_components/TrainerStep";
import {
  PaymentStep,
  type PtPaymentMethod,
} from "./_components/PaymentStep";
import { SlotStep, type SlotOption } from "./_components/SlotStep";
import { ConfirmStep } from "./_components/ConfirmStep";

interface Slot extends SlotOption {
  trainerId: string;
}

interface PtBookingFlowProps {
  trainers: TrainerOption[];
  slots: Slot[];
  hasIntakeDiscountAvailable: boolean;
  creditsRemaining: number | null;
  hasActiveNonPtMembership: boolean;
}

const STEPS = [
  { id: "trainer", label: "Trainer" },
  { id: "payment", label: "Betaling" },
  { id: "slot", label: "Moment" },
  { id: "confirm", label: "Bevestigen" },
];

export function PtBookingFlow({
  trainers,
  slots,
  hasIntakeDiscountAvailable,
  creditsRemaining,
  hasActiveNonPtMembership,
}: PtBookingFlowProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PtPaymentMethod | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedTrainer = useMemo(
    () => trainers.find((t) => t.id === trainerId) ?? null,
    [trainers, trainerId],
  );
  const trainerSlots = useMemo(
    () => slots.filter((s) => s.trainerId === trainerId),
    [slots, trainerId],
  );
  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === slotId) ?? null,
    [slots, slotId],
  );

  const isIntake = selectedTrainer
    ? qualifiesForIntakeDiscount({
        hasUsedIntakeDiscount: !hasIntakeDiscountAvailable,
        trainerTier: selectedTrainer.tier,
        format: "one_on_one",
        purchaseType: "single",
      })
    : false;

  const priceCents = selectedTrainer
    ? calculatePtPriceCents({
        tier: selectedTrainer.tier,
        format: "one_on_one",
        purchaseType: "single",
        memberHasActiveSub: hasActiveNonPtMembership,
        isIntakeSession: isIntake,
      })
    : 0;

  function goNext() {
    setError(null);
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }
  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleTrainerSelect(id: string) {
    setTrainerId(id);
    setSlotId(null);
    // If this trainer has no credits path available, skip straight to slot.
    if (creditsRemaining && creditsRemaining > 0) {
      goNext();
    } else {
      setPaymentMethod("pay");
      goNext();
    }
  }
  function handlePaymentSelect(method: PtPaymentMethod) {
    setPaymentMethod(method);
    goNext();
  }
  function handleSlotSelect(id: string) {
    setSlotId(id);
    goNext();
  }

  function handleConfirm() {
    if (!selectedSlot || !paymentMethod) return;
    setError(null);
    startTransition(async () => {
      const res =
        paymentMethod === "credits"
          ? await createPtBookingFromCredits(selectedSlot.id)
          : await createPtBookingWithPayment(selectedSlot.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (res.action === "redirect") {
        window.location.href = res.url;
      } else {
        router.push(`/app/pt/bedankt?booking=${res.bookingId}`);
      }
    });
  }

  return (
    <>
      <PtStepper steps={STEPS} currentIndex={stepIndex} />

      <div className="min-h-[22rem]">
        {stepIndex === 0 && (
          <TrainerStep
            trainers={trainers}
            hasIntakeDiscountAvailable={hasIntakeDiscountAvailable}
            selectedId={trainerId}
            onSelect={handleTrainerSelect}
          />
        )}
        {stepIndex === 1 && selectedTrainer && (
          <PaymentStep
            priceCents={priceCents}
            creditsRemaining={creditsRemaining}
            selected={paymentMethod}
            onSelect={handlePaymentSelect}
          />
        )}
        {stepIndex === 2 && selectedTrainer && (
          <SlotStep
            slots={trainerSlots}
            selectedId={slotId}
            onSelect={handleSlotSelect}
          />
        )}
        {stepIndex === 3 && selectedTrainer && selectedSlot && paymentMethod && (
          <ConfirmStep
            trainerName={selectedTrainer.displayName}
            slotStart={selectedSlot.startAt}
            slotEnd={selectedSlot.endAt}
            paymentMethod={paymentMethod}
            priceCents={priceCents}
            isIntakeDiscount={isIntake}
            creditsRemaining={creditsRemaining}
            pending={pending}
            error={error}
            onConfirm={handleConfirm}
            onBack={goBack}
          />
        )}
      </div>

      {/* Back affordance for steps 1-2 (step 3 has its own back button) */}
      {stepIndex > 0 && stepIndex < 3 && (
        <div className="mt-10 pt-6 border-t border-[color:var(--ink-500)]/60">
          <Button variant="ghost" onClick={goBack}>
            Vorige stap
          </Button>
        </div>
      )}
    </>
  );
}
