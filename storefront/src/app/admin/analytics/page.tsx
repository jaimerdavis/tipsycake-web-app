"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AnalyticsPage() {
  const data = useQuery(api.admin.analytics.dashboard);

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          High-level business metrics at a glance.
        </p>
      </header>

      {/* Revenue cards */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Revenue</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Today" value={dollars(data.revenue.todayCents)} />
          <MetricCard title="Last 7 days" value={dollars(data.revenue.last7DaysCents)} />
          <MetricCard title="Last 30 days" value={dollars(data.revenue.last30DaysCents)} />
          <MetricCard title="All time" value={dollars(data.revenue.allTimeCents)} />
        </div>
      </section>

      {/* Order counts */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Orders</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Today" value={String(data.orders.today)} />
          <MetricCard title="Last 7 days" value={String(data.orders.last7Days)} />
          <MetricCard title="Last 30 days" value={String(data.orders.last30Days)} />
          <MetricCard title="All time" value={String(data.orders.total)} />
        </div>
      </section>

      {/* Cart funnel */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Cart Funnel</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Active carts" value={String(data.carts.active)} />
          <MetricCard title="Abandoned" value={String(data.carts.abandoned)} />
          <MetricCard title="Converted" value={String(data.carts.converted)} />
          <MetricCard
            title="Conversion rate"
            value={`${data.carts.conversionRate}%`}
          />
        </div>
      </section>

      {/* Fulfillment breakdown */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Fulfillment Breakdown</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="Pickup" value={String(data.byFulfillment.pickup)} />
          <MetricCard title="Delivery" value={String(data.byFulfillment.delivery)} />
          <MetricCard title="Shipping" value={String(data.byFulfillment.shipping)} />
        </div>
      </section>

      {/* Order status breakdown */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Order Statuses</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.byStatus).map(([status, count]) => (
            <MetricCard key={status} title={status} value={String(count)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wider">
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}
