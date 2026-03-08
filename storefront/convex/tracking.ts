/**
 * TRK-003, ADM-002: Admin driver tracking. Role-gated.
 */

import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";

/**
 * Returns active driver assignments (not delivered) with latest location and destination.
 * Used by admin tracking page.
 */
export const getActiveDriverLocations = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "dispatcher");

    const assignments = await ctx.db
      .query("driverAssignments")
      .filter((q) => q.neq(q.field("status"), "delivered"))
      .collect();

    const result: Array<{
      assignmentId: Id<"driverAssignments">;
      orderId: Id<"orders">;
      orderNumber: string;
      driverId: string;
      driverName: string;
      status: string;
      latestLocation: { lat: number; lng: number } | null;
      driverTrail: Array<{ lat: number; lng: number }>;
      destination: { lat: number; lng: number; formatted: string } | null;
    }> = [];

    for (const a of assignments) {
      const driver = await ctx.db.get(a.driverId);
      const order = await ctx.db.get(a.orderId);
      if (!order) continue;

      const locationRows = await ctx.db
        .query("driverLocations")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", a._id))
        .order("desc")
        .take(50);
      const latestLocation = locationRows[0]
        ? { lat: locationRows[0].lat, lng: locationRows[0].lng }
        : null;
      const driverTrail = locationRows
        .reverse()
        .map((loc) => ({ lat: loc.lat, lng: loc.lng }));

      let destination: { lat: number; lng: number; formatted: string } | null = null;
      if (order.addressId) {
        const addr = await ctx.db.get(order.addressId);
        if (addr) {
          destination = {
            lat: addr.lat,
            lng: addr.lng,
            formatted: addr.formatted,
          };
        }
      }

      result.push({
        assignmentId: a._id,
        orderId: order._id,
        orderNumber: order.orderNumber,
        driverId: a.driverId,
        driverName: driver?.name ?? "Unknown",
        status: a.status,
        latestLocation,
        driverTrail,
        destination,
      });
    }

    return result;
  },
});
