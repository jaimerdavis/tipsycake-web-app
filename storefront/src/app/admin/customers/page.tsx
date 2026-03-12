"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, CreditCard, ChevronRight } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethodManager } from "@/components/PaymentMethodManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CUSTOMER_STATUS_LABELS } from "@/lib/orderStatusConfig";

type SortField = "name" | "email" | "orderCount" | "totalRevenue" | "lastOrderAt";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminCustomersPage() {
  const [sortBy, setSortBy] = useState<SortField>("lastOrderAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [paymentMethodsEmail, setPaymentMethodsEmail] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState("");
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [addressBackfillStatus, setAddressBackfillStatus] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);

  const customers = useQuery(api.admin.customers.list, {
    sortBy,
    sortDirection,
  });
  const ordersForExpanded = useQuery(
    api.admin.customers.getOrdersByEmail,
    expandedEmail ? { email: expandedEmail } : "skip"
  );

  const backfillNames = useMutation(api.importHistoricalOrders.backfillContactNamesFromCsv);
  const backfillAddresses = useMutation(api.importHistoricalOrders.backfillAddressesFromCsv);
  const linkGuestOrders = useMutation(api.admin.orders.linkAllGuestOrdersToUsers);
  const fixCustomerEmail = useMutation(api.admin.customers.fixCustomerEmail);

  const [fixFromEmail, setFixFromEmail] = useState("");
  const [fixToEmail, setFixToEmail] = useState("");
  const [fixStatus, setFixStatus] = useState<string | null>(null);
  const [fixSearch, setFixSearch] = useState("alrick");

  const emailSearchResults = useQuery(
    api.admin.customers.searchCustomerEmails,
    fixSearch.trim().length >= 2 ? { search: fixSearch.trim() } : "skip"
  );

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  if (customers === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6">
        <p className="text-sm text-muted-foreground">Loading customers…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          View customer details, order count, total revenue, and contact info.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Customer list</CardTitle>
          <CardDescription>
            {customers.length} customer{customers.length === 1 ? "" : "s"} (grouped by email)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_1fr_80px_80px_100px_100px] min-w-[640px] gap-x-4 border-b pb-3 text-left text-sm text-muted-foreground">
              <div className="w-8" aria-label="Expand" />
              <div className="font-medium min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8 font-medium"
                  onClick={() => toggleSort("name")}
                >
                  Name
                  {sortBy === "name" && (sortDirection === "asc" ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" /> : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />)}
                </Button>
              </div>
              <div className="font-medium">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8 font-medium min-w-0"
                  onClick={() => toggleSort("email")}
                >
                  Email
                  {sortBy === "email" && (sortDirection === "asc" ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" /> : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />)}
                </Button>
              </div>
              <div className="font-medium">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8 font-medium"
                  onClick={() => toggleSort("orderCount")}
                >
                  Orders
                  {sortBy === "orderCount" && (sortDirection === "asc" ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" /> : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />)}
                </Button>
              </div>
              <div className="font-medium">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8 font-medium"
                  onClick={() => toggleSort("totalRevenue")}
                >
                  Total revenue
                  {sortBy === "totalRevenue" && (sortDirection === "asc" ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" /> : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />)}
                </Button>
              </div>
              <div className="font-medium">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8 font-medium"
                  onClick={() => toggleSort("lastOrderAt")}
                >
                  Last order
                  {sortBy === "lastOrderAt" && (sortDirection === "asc" ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" /> : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />)}
                </Button>
              </div>
            </div>
            {customers.map((c) => (
              <Collapsible
                key={c.email}
                className="border-b last:border-b-0"
                open={expandedEmail === c.email}
                onOpenChange={(open) => setExpandedEmail(open ? c.email : null)}
              >
                <div className="grid grid-cols-[auto_1fr_1fr_80px_80px_100px_100px] min-w-[640px] gap-x-4 py-3 text-sm hover:bg-muted/50 [&[data-state=open]_button_svg]:rotate-90">
                  <div className="flex items-center">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 -ml-1"
                        aria-label={c.orderCount > 0 ? "Expand to see orders" : undefined}
                      >
                        <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <div className="font-medium">
                    {c.name || <span className="text-muted-foreground">—</span>}
                  </div>
                  <div>
                    <Link
                      href={`/admin/orders?email=${encodeURIComponent(c.email)}`}
                      className="text-primary hover:underline"
                    >
                      {c.email}
                    </Link>
                  </div>
                  <div className="text-muted-foreground">{c.phone || "—"}</div>
                  <div>{c.orderCount}</div>
                  <div className="font-medium">{dollars(c.totalRevenueCents)}</div>
                  <div className="text-muted-foreground">{formatDate(c.lastOrderAt)}</div>
                </div>
                <CollapsibleContent>
                  <div className="bg-muted/30 px-4 py-3 pb-4 -mt-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPaymentMethodsEmail(c.email)}
                      >
                        <CreditCard className="mr-1.5 h-4 w-4" />
                        Payment methods
                      </Button>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground ml-2 flex-1">
                        Orders
                      </p>
                    </div>
                    <div className="space-y-2">
                      {expandedEmail === c.email && ordersForExpanded === undefined && (
                        <p className="text-sm text-muted-foreground italic">
                          Loading orders…
                        </p>
                      )}
                      {expandedEmail === c.email && ordersForExpanded && ordersForExpanded.length === 0 && c.orderCount > 0 && (
                        <p className="text-sm text-muted-foreground">
                          No orders found.{" "}
                          <Link
                            href={`/admin/orders?email=${encodeURIComponent(c.email)}`}
                            className="text-primary hover:underline"
                          >
                            View in Orders →
                          </Link>
                        </p>
                      )}
                      {expandedEmail === c.email &&
                        (ordersForExpanded ?? []).map((o) => (
                        <div
                          key={o._id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-background px-3 py-2 text-sm"
                        >
                          <span className="font-mono font-medium">#{o.orderNumber}</span>
                          <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>
                          <span className="capitalize text-muted-foreground">{o.fulfillmentMode}</span>
                          <span className="font-medium">{dollars(o.totalCents)}</span>
                          <span className="text-muted-foreground">
                            {CUSTOMER_STATUS_LABELS[o.status] ?? o.status.replace(/_/g, " ")}
                          </span>
                          <span className="flex-1" />
                          <Link
                            href={`/orders/${o.guestToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs"
                          >
                            View status
                          </Link>
                          <Link
                            href={`/admin/orders?email=${encodeURIComponent(c.email)}`}
                            className="text-primary hover:underline text-xs"
                          >
                            In admin
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
          {customers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No customers with email on orders yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data maintenance</CardTitle>
          <CardDescription>
            Update names on existing imported orders and link guest orders to accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="csv-backfill">Backfill names from WooCommerce CSV</Label>
            <p className="text-xs text-muted-foreground">
              Paste your WooCommerce orders CSV. Only updates contactName on existing orders (by order number).
              Does not re-import.
            </p>
            <Textarea
              id="csv-backfill"
              placeholder="Paste CSV content here…"
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!csvContent.trim()}
              onClick={async () => {
                setBackfillStatus("Running…");
                try {
                  const result = await backfillNames({ csvContent: csvContent.trim() });
                  if (!result.ok && result.error) {
                    setBackfillStatus(result.error);
                  } else {
                    let msg = `Updated ${result.updated} order(s). (${result.totalInCsv} email/name pairs in CSV)`;
                    if ("hint" in result && result.hint) msg += result.hint;
                    setBackfillStatus(msg);
                  }
                } catch (e) {
                  setBackfillStatus("Error: " + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              Backfill names
            </Button>
            {backfillStatus && (
              <p className="text-sm text-muted-foreground">{backfillStatus}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Backfill addresses from CSV</Label>
            <p className="text-xs text-muted-foreground">
              Uses delivery address first (where cake goes), billing as fallback. Only updates
              delivery/shipping orders. Same CSV as above.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={!csvContent.trim()}
              onClick={async () => {
                setAddressBackfillStatus("Running…");
                try {
                  const result = await backfillAddresses({ csvContent: csvContent.trim() });
                  if (!result.ok && result.error) {
                    setAddressBackfillStatus(result.error);
                  } else {
                    setAddressBackfillStatus(`Updated ${result.updated} order(s).`);
                  }
                } catch (e) {
                  setAddressBackfillStatus("Error: " + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              Backfill addresses
            </Button>
            {addressBackfillStatus && (
              <p className="text-sm text-muted-foreground">{addressBackfillStatus}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Fix customer email (merge duplicates)</Label>
            <p className="text-xs text-muted-foreground">
              Correct a typo across orders, coupon redemptions, and chat. Merges duplicate rows.
            </p>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <Label htmlFor="fix-search" className="text-xs">Search emails (e.g. alrick)</Label>
                  <Input
                    id="fix-search"
                    type="text"
                    placeholder="alrick"
                    value={fixSearch}
                    onChange={(e) => setFixSearch(e.target.value)}
                    className="h-8 w-40"
                  />
                </div>
              </div>
              {emailSearchResults && emailSearchResults.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Found: {emailSearchResults.map((r) => `${r.email} (${r.orderCount})`).join("; ")}
                  {" "}— Use the typo for From, correct email for To.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label htmlFor="fix-from" className="text-xs">From (wrong email)</Label>
                <Input
                  id="fix-from"
                  type="email"
                  placeholder="alrickmurray14@gnail.com"
                  value={fixFromEmail}
                  onChange={(e) => setFixFromEmail(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fix-to" className="text-xs">To (correct email)</Label>
                <Input
                  id="fix-to"
                  type="email"
                  placeholder="alrickmurray14@gmail.com"
                  value={fixToEmail}
                  onChange={(e) => setFixToEmail(e.target.value)}
                  className="h-8"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!fixFromEmail.trim() || !fixToEmail.trim()}
                onClick={async () => {
                  setFixStatus("Running…");
                  try {
                    const result = await fixCustomerEmail({
                      fromEmail: fixFromEmail.trim(),
                      toEmail: fixToEmail.trim(),
                    });
                    setFixStatus(
                      `Updated ${result.ordersUpdated} order(s), ${result.redemptionsUpdated} redemption(s), ${result.conversationsUpdated} conversation(s).`
                    );
                  } catch (e) {
                    setFixStatus("Error: " + (e instanceof Error ? e.message : String(e)));
                  }
                }}
              >
                Fix email
              </Button>
            </div>
            {fixStatus && (
              <p className="text-sm text-muted-foreground">{fixStatus}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Link guest orders to accounts</Label>
            <p className="text-xs text-muted-foreground">
              Attach all guest orders (with email) to user accounts with matching email.
              Ensures customers see their full order history when signed in.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setLinkStatus("Running…");
                try {
                  const result = await linkGuestOrders({});
                  if ("message" in result) {
                    setLinkStatus(result.message ?? "Done.");
                  } else {
                    const extra =
                      result.totalGuestWithEmail > result.linked
                        ? ` (${result.totalGuestWithEmail - result.linked} have no matching account)`
                        : "";
                    setLinkStatus(`Linked ${result.linked} orders.${extra}`);
                  }
                } catch (e) {
                  setLinkStatus("Error: " + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              Link guest orders to accounts
            </Button>
            {linkStatus && (
              <p className="text-sm text-muted-foreground">{linkStatus}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!paymentMethodsEmail}
        onOpenChange={(open) => !open && setPaymentMethodsEmail(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment methods — {paymentMethodsEmail ?? ""}</DialogTitle>
          </DialogHeader>
          {paymentMethodsEmail && (
            <PaymentMethodManager
              customerEmail={paymentMethodsEmail}
              adminView={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
