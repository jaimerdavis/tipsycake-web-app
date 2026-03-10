/**
 * Order status configuration for customer-facing display.
 * Maps technical statuses to friendly labels and defines fulfillment-aware step order.
 */

/** Admin dropdown options: value = technical status, label = friendly display. */
export const ADMIN_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "paid_confirmed", label: "Order Received" },
  { value: "order_accepted", label: "Order Accepted" },
  { value: "in_production", label: "Cake Planning and Prep" },
  { value: "ready_for_pickup", label: "Cake Ready for Pickup" },
  { value: "ready_for_delivery", label: "Ready for Delivery (Final Prep)" },
  { value: "out_for_delivery", label: "On Its Way" },
  { value: "delivered", label: "Cake Delivered" },
  { value: "shipped", label: "Cake Shipped" },
  { value: "completed", label: "Order Complete" },
  { value: "canceled", label: "Order Canceled" },
];

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  paid_confirmed: "Order Received",
  order_accepted: "Order Accepted",
  in_production: "Cake Planning and Prep",
  ready_for_pickup: "Cake Ready for Pickup",
  ready_for_delivery: "Final Prep and Boxing",
  out_for_delivery: "On Its Way",
  delivered: "Cake Delivered",
  shipped: "Cake Shipped",
  completed: "Order Complete",
  canceled: "Order Canceled",
  failed: "Order Failed",
};

export type StepColorVariant =
  | "completed"
  | "progress"
  | "delivery"
  | "ready"
  | "upcoming"
  | "canceled";

export interface StatusStep {
  id: string;
  status: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: number;
  colorVariant: StepColorVariant;
}

type FulfillmentMode = "pickup" | "delivery" | "shipping";

const PICKUP_STEP_ORDER: string[] = [
  "paid_confirmed",
  "order_accepted",
  "in_production",
  "ready_for_pickup",
  "completed",
];

const DELIVERY_STEP_ORDER: string[] = [
  "paid_confirmed",
  "order_accepted",
  "in_production",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
];

const SHIPPING_STEP_ORDER: string[] = [
  "paid_confirmed",
  "order_accepted",
  "in_production",
  "shipped",
];

function getStepOrder(mode: FulfillmentMode): string[] {
  switch (mode) {
    case "pickup":
      return PICKUP_STEP_ORDER;
    case "delivery":
      return DELIVERY_STEP_ORDER;
    case "shipping":
      return SHIPPING_STEP_ORDER;
    default:
      return PICKUP_STEP_ORDER;
  }
}

function getTimestampForStatus(
  events: { status: string; createdAt: number }[],
  status: string
): number | undefined {
  const event = events.find((e) => e.status === status);
  return event?.createdAt;
}

function getColorVariant(
  stepStatus: string,
  completed: boolean,
  current: boolean
): StepColorVariant {
  if (stepStatus === "canceled" || stepStatus === "failed") return "canceled";
  if (completed) return "completed";
  if (current) {
    if (
      stepStatus === "out_for_delivery" ||
      stepStatus === "ready_for_delivery"
    )
      return "delivery";
    if (
      stepStatus === "ready_for_pickup" ||
      stepStatus === "delivered" ||
      stepStatus === "shipped" ||
      stepStatus === "completed"
    )
      return "ready";
    return "progress";
  }
  return "upcoming";
}

export interface OrderForStepper {
  status: string;
  fulfillmentMode: FulfillmentMode;
  events: { _id: string; status: string; createdAt: number }[];
}

export function getStepperSteps(order: OrderForStepper): StatusStep[] {
  const { status, fulfillmentMode, events } = order;
  const stepOrder = getStepOrder(fulfillmentMode);

  // Canceled/failed: single card
  if (status === "canceled" || status === "failed") {
    const timestamp = getTimestampForStatus(events, status);
    return [
      {
        id: status,
        status,
        label: CUSTOMER_STATUS_LABELS[status] ?? status.replace(/_/g, " "),
        completed: true,
        current: true,
        timestamp,
        colorVariant: "canceled",
      },
    ];
  }

  // Terminal states: show steps up to and including final
  const terminalStatuses = new Set(["completed", "delivered", "shipped"]);
  const isTerminal = terminalStatuses.has(status);
  const stepsToShow =
    isTerminal && stepOrder.includes(status)
      ? stepOrder.slice(0, stepOrder.indexOf(status) + 1)
      : stepOrder;

  return stepsToShow.map((stepStatus) => {
    const stepIndex = stepOrder.indexOf(stepStatus);
    const statusIndex = stepOrder.indexOf(status);
    const completed = statusIndex >= stepIndex;
    const current = statusIndex === stepIndex;
    const timestamp = getTimestampForStatus(events, stepStatus);

    return {
      id: stepStatus,
      status: stepStatus,
      label: CUSTOMER_STATUS_LABELS[stepStatus] ?? stepStatus.replace(/_/g, " "),
      completed,
      current,
      timestamp,
      colorVariant: getColorVariant(stepStatus, completed, current),
    };
  });
}
