"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoyaltyPage() {
  const accounts = useQuery(api.loyalty.adminListAccounts);
  const adjustPoints = useMutation(api.loyalty.adminAdjustPoints);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: "",
    pointsDelta: "0",
    note: "",
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Loyalty</h1>
        <p className="text-sm text-muted-foreground">
          Review loyalty accounts and apply manual point adjustments.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Adjust Points</CardTitle>
          <CardDescription>LOY-005 + ADM-003</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              value={form.userId}
              onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pointsDelta">Points delta (+/-)</Label>
            <Input
              id="pointsDelta"
              type="number"
              value={form.pointsDelta}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, pointsDelta: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>
          <Button
            onClick={async () => {
              try {
                await adjustPoints({
                  userId: form.userId as never,
                  pointsDelta: Number(form.pointsDelta),
                  note: form.note || undefined,
                });
                setMessage("Points adjusted.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Adjustment failed");
              }
            }}
          >
            Apply adjustment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loyalty Accounts</CardTitle>
          <CardDescription>Current balances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(accounts ?? []).map((account) => (
            <div key={account._id} className="flex items-center justify-between rounded border p-3 text-sm">
              <span>User {String(account.userId)}</span>
              <Badge>{account.pointsBalance} points</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
