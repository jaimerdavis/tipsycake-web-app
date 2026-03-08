"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

const ENTITY_TYPES = [
  { value: "all", label: "All" },
  { value: "users", label: "Users" },
  { value: "coupons", label: "Coupons" },
  { value: "scheduling", label: "Scheduling" },
  { value: "deliveryTiers", label: "Delivery Pricing" },
  { value: "loyaltyLedger", label: "Loyalty" },
] as const;

export default function AuditLogsPage() {
  const [entityFilter, setEntityFilter] = useState("all");
  const logs = useQuery(api.admin.auditLogs.list, {
    entityType: entityFilter === "all" ? undefined : entityFilter,
    limit: 200,
  });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            Track changes to scheduling rules, delivery pricing, coupons, loyalty,
            and user roles.
          </p>
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by entity" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.value === "all" ? "All entities" : t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {!logs && <p className="text-sm text-muted-foreground">Loading...</p>}

      {logs?.length === 0 && (
        <p className="text-sm text-muted-foreground">No audit log entries found.</p>
      )}

      <div className="flex flex-col gap-3">
        {(logs ?? []).map((log) => (
          <Card key={log._id}>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">{log.action}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {log.entityType}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {log.actorType}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {new Date(log.createdAt).toLocaleString()} &middot; Entity:{" "}
                {String(log.entityId).slice(0, 16)}…
              </CardDescription>
            </CardHeader>
            {log.diff && (
              <CardContent className="pt-0 pb-3">
                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(log.diff, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
