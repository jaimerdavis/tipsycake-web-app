"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SmsSettingsPage() {
  const smsLogs = useQuery(api.admin.notificationLogs.list, {
    channel: "sms",
    limit: 50,
  });
  const sendTestSms = useMutation(api.admin.settings.sendTestSms);

  const [message, setMessage] = useState<string | null>(null);
  const [testSmsSending, setTestSmsSending] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">SMS Settings</h1>
        <p className="text-sm text-muted-foreground">
          Test Twilio and view SMS notification logs. Twilio env vars are in Settings → Verify connections.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      {/* ── Test SMS ── */}
      <Card>
        <CardHeader>
          <CardTitle>Test SMS</CardTitle>
          <CardDescription>
            Send a test SMS to verify Twilio. Use E.164 format (e.g. +15551234567) or 10-digit US number.
            Store Phone is in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="test-sms-phone">Phone number</Label>
            <Input
              id="test-sms-phone"
              type="tel"
              placeholder="+15551234567 or 5551234567"
              className="w-48 font-mono"
            />
          </div>
          <Button
            variant="outline"
            disabled={testSmsSending}
            onClick={async () => {
              const input = document.getElementById("test-sms-phone") as HTMLInputElement;
              const to = input?.value?.trim();
              if (!to) {
                setMessage("Enter a phone number");
                return;
              }
              setTestSmsSending(true);
              setMessage(null);
              try {
                await sendTestSms({ toPhone: to });
                setMessage(`Test SMS scheduled to ${to}. Check logs below.`);
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "SMS failed");
              } finally {
                setTestSmsSending(false);
              }
            }}
          >
            {testSmsSending ? "Sending…" : "Send test SMS"}
          </Button>
        </CardContent>
      </Card>

      {/* ── SMS Logs ── */}
      <Card>
        <CardHeader>
          <CardTitle>SMS Logs</CardTitle>
          <CardDescription>
            Sent (with Twilio SID), skipped (Twilio not configured), or error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {smsLogs === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : smsLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SMS logs yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {smsLogs.map((log) => (
                <div
                  key={log._id}
                  className="flex flex-col gap-1.5 rounded border bg-muted/30 px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <Badge
                        variant={
                          log.status === "error"
                            ? "destructive"
                            : log.status === "skipped"
                              ? "secondary"
                              : "default"
                        }
                        className="capitalize shrink-0"
                      >
                        {log.status}
                      </Badge>
                      {log.template && (
                        <span className="text-muted-foreground truncate">{log.template}</span>
                      )}
                      {log.orderNumber && (
                        <span className="text-muted-foreground">#{log.orderNumber}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate text-muted-foreground">To: {log.to}</span>
                    {log.bodyPreview != null && (
                      <span className="truncate text-xs text-muted-foreground italic">
                        &quot;{log.bodyPreview}&quot;
                      </span>
                    )}
                    {log.status === "sent" && log.externalId != null && (
                      <span className="text-xs text-green-700 dark:text-green-400 font-mono">
                        Twilio SID: {log.externalId}
                      </span>
                    )}
                    {log.errorMessage != null && (
                      <span className="text-destructive text-xs">{log.errorMessage}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
