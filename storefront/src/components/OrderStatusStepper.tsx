"use client";

import { Check, Circle, Package, Truck } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getStepperSteps,
  type StatusStep,
  type StepColorVariant,
} from "@/lib/orderStatusConfig";

const COLOR_CLASSES: Record<StepColorVariant, string> = {
  completed: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/20",
  progress:
    "border-amber-300 bg-amber-100/90 dark:bg-amber-950/30 dark:border-amber-800",
  delivery: "border-blue-300 bg-blue-100/90 dark:bg-blue-950/30 dark:border-blue-800",
  ready: "border-emerald-300 bg-emerald-100/90 dark:bg-emerald-950/30 dark:border-emerald-800",
  upcoming: "border-muted bg-muted/50",
  canceled: "border-red-200 bg-red-50/80 dark:bg-red-950/30 dark:border-red-900",
};

const TEXT_CLASSES: Record<StepColorVariant, string> = {
  completed: "text-emerald-800 dark:text-emerald-200",
  progress: "text-amber-900 dark:text-amber-100",
  delivery: "text-blue-900 dark:text-blue-100",
  ready: "text-emerald-900 dark:text-emerald-100",
  upcoming: "text-muted-foreground",
  canceled: "text-red-800 dark:text-red-200",
};

interface StatusCardProps {
  step: StatusStep;
  index: number;
  fillPercent: number;
}

function StatusCard({ step, index, fillPercent }: StatusCardProps) {
  const showFill = step.completed || step.current;
  const cardClasses = cn(
    "relative min-h-[56px] overflow-hidden rounded-2xl border p-4 transition-all duration-300",
    COLOR_CLASSES[step.colorVariant],
    step.current && "animate-status-glow ring-2 ring-amber-400/50 ring-offset-2 dark:ring-offset-background"
  );
  const textClasses = TEXT_CLASSES[step.colorVariant];

  const subtext = step.completed
    ? step.timestamp
      ? new Date(step.timestamp).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Done"
    : step.current
      ? "In progress"
      : "Coming up";

  return (
    <div
      className={cn(
        "animate-fade-in-up",
        `stagger-${Math.min(index + 1, 6)}`
      )}
    >
      <div className={cardClasses}>
        {/* Progressive fill bar (left edge) - fills as step completes */}
        {showFill && (
          <div
            className="absolute inset-y-0 left-0 bg-emerald-400/30 dark:bg-emerald-500/20 transition-all duration-500 ease-out rounded-l-2xl"
            style={{ width: `${fillPercent}%` }}
            aria-hidden
          />
        )}
        <div className="relative flex flex-row items-center gap-4">
          <div className={cn("flex-shrink-0", textClasses)}>
            {step.completed ? (
              <Check className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
            ) : step.current ? (
              step.status === "out_for_delivery" ||
              step.status === "ready_for_delivery" ? (
                <Truck className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
              ) : step.status === "shipped" ? (
                <Package className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
              ) : (
                <Circle
                  className="h-6 w-6 fill-current sm:h-7 sm:w-7"
                  aria-hidden
                />
              )
            ) : (
              <Circle
                className="h-6 w-6 stroke-[1.5] opacity-50 sm:h-7 sm:w-7"
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-lg font-semibold sm:text-xl",
                textClasses
              )}
            >
              {step.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm",
                step.colorVariant === "upcoming"
                  ? "text-muted-foreground"
                  : "opacity-85"
              )}
            >
              {subtext}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface OrderStatusStepperProps {
  order: {
    status: string;
    fulfillmentMode: "pickup" | "delivery" | "shipping";
    events: { _id: string; status: string; createdAt: number }[];
  };
}

export function OrderStatusStepper({ order }: OrderStatusStepperProps) {
  const steps = getStepperSteps(order);
  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const overallProgress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Overall progressive fill bar */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(overallProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${overallProgress}%` }}
        />
      </div>
      {steps.map((step, i) => {
        const stepFillPercent = step.completed || step.current ? 100 : 0;
        return (
          <StatusCard
            key={step.id}
            step={step}
            index={i}
            fillPercent={stepFillPercent}
          />
        );
      })}
    </div>
  );
}
