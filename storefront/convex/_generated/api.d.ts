/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as abandoned from "../abandoned.js";
import type * as abandonedCron from "../abandonedCron.js";
import type * as addresses from "../addresses.js";
import type * as admin_analytics from "../admin/analytics.js";
import type * as admin_auditLogs from "../admin/auditLogs.js";
import type * as admin_catalog from "../admin/catalog.js";
import type * as admin_drivers from "../admin/drivers.js";
import type * as admin_orders from "../admin/orders.js";
import type * as admin_rbac from "../admin/rbac.js";
import type * as admin_shipping from "../admin/shipping.js";
import type * as cart from "../cart.js";
import type * as catalog from "../catalog.js";
import type * as checkout from "../checkout.js";
import type * as coupons from "../coupons.js";
import type * as crons from "../crons.js";
import type * as driver from "../driver.js";
import type * as http from "../http.js";
import type * as lib_auditLog from "../lib/auditLog.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_couponLogic from "../lib/couponLogic.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_roles from "../lib/roles.js";
import type * as loyalty from "../loyalty.js";
import type * as maps from "../maps.js";
import type * as notifications from "../notifications.js";
import type * as orders from "../orders.js";
import type * as paymentLogs from "../paymentLogs.js";
import type * as payments from "../payments.js";
import type * as scheduling from "../scheduling.js";
import type * as seed from "../seed.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";
import type * as webhookProcessors from "../webhookProcessors.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  abandoned: typeof abandoned;
  abandonedCron: typeof abandonedCron;
  addresses: typeof addresses;
  "admin/analytics": typeof admin_analytics;
  "admin/auditLogs": typeof admin_auditLogs;
  "admin/catalog": typeof admin_catalog;
  "admin/drivers": typeof admin_drivers;
  "admin/orders": typeof admin_orders;
  "admin/rbac": typeof admin_rbac;
  "admin/shipping": typeof admin_shipping;
  cart: typeof cart;
  catalog: typeof catalog;
  checkout: typeof checkout;
  coupons: typeof coupons;
  crons: typeof crons;
  driver: typeof driver;
  http: typeof http;
  "lib/auditLog": typeof lib_auditLog;
  "lib/auth": typeof lib_auth;
  "lib/couponLogic": typeof lib_couponLogic;
  "lib/pricing": typeof lib_pricing;
  "lib/roles": typeof lib_roles;
  loyalty: typeof loyalty;
  maps: typeof maps;
  notifications: typeof notifications;
  orders: typeof orders;
  paymentLogs: typeof paymentLogs;
  payments: typeof payments;
  scheduling: typeof scheduling;
  seed: typeof seed;
  storage: typeof storage;
  users: typeof users;
  webhookProcessors: typeof webhookProcessors;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
