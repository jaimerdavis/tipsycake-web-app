export const INTERNAL_ROLES = [
  "admin",
  "manager",
  "kitchen",
  "dispatcher",
  "driver",
  "customer",
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];
