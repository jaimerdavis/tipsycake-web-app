"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function AdminChatPage() {
  const [selectedId, setSelectedId] = useState<Id<"chatConversations"> | null>(null);
  const [draft, setDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");

  const conversations = useQuery(api.chat.listConversations, {
    status: statusFilter,
    limit: 50,
  });

  const messages = useQuery(
    api.chat.getMessages,
    selectedId ? { conversationId: selectedId } : "skip"
  );

  const sendMessage = useMutation(api.chat.sendMessage);
  const closeConversation = useMutation(api.chat.closeConversation);
  const settings = useQuery(api.admin.settings.getAll);
  const setSetting = useMutation(api.admin.settings.set);

  const chatEnabled = settings?.chatEnabled !== "false";
  const setChatEnabled = (enabled: boolean) => setSetting({ key: "chatEnabled", value: enabled ? "true" : "false" });

  const selected = selectedId ? conversations?.find((c) => c._id === selectedId) : null;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !selectedId) return;
    try {
      await sendMessage({ conversationId: selectedId, body });
      setDraft("");
    } catch {
      // Error
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    try {
      await closeConversation({ conversationId: selectedId });
      setSelectedId(null);
    } catch {
      // Error
    }
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Chat</h1>
          <p className="text-sm text-muted-foreground">
            Reply to customer messages from the order page or any storefront page.
          </p>
        </div>
        <Card className="shrink-0">
          <CardContent className="flex items-center gap-3 pt-6">
            <Switch
              id="chat-enabled"
              checked={chatEnabled}
              onCheckedChange={setChatEnabled}
            />
            <Label htmlFor="chat-enabled" className="cursor-pointer text-sm font-medium">
              Show chat button on storefront
            </Label>
          </CardContent>
        </Card>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conversations</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={statusFilter === "open" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("open")}
                >
                  Open
                </Button>
                <Button
                  variant={statusFilter === "closed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("closed")}
                >
                  Closed
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {conversations === undefined ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversations.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setSelectedId(c._id)}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selectedId === c._id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/80"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {c.contactName
                        ? c.contactName
                        : c.contactEmail ?? c.guestToken ?? "Guest"}
                    </span>
                    <span className={`truncate text-xs ${selectedId === c._id ? "opacity-90" : "text-muted-foreground"}`}>
                      {c.contactName && c.contactEmail ? `${c.contactEmail} · ` : ""}
                      {new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[400px] flex-col">
          {selected ? (
            <>
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {selected.contactName
                      ? `${selected.contactName}${selected.contactEmail ? ` (${selected.contactEmail})` : ""}`
                      : selected.contactEmail ?? "Guest"}
                    {selected.orderId && (
                      <Badge variant="secondary" className="ml-2">
                        Order
                      </Badge>
                    )}
                  </CardTitle>
                  {selected.status === "open" && (
                    <Button variant="outline" size="sm" onClick={handleClose}>
                      Close
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                  {messages === undefined ? (
                    <p className="text-sm text-muted-foreground">Loading messages...</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`flex ${msg.authorType === "staff" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                            msg.authorType === "staff"
                              ? "rounded-br-md bg-primary text-primary-foreground"
                              : "rounded-bl-md bg-muted"
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {selected.status === "open" && (
                  <div className="flex gap-2 border-t pt-4">
                    <Input
                      placeholder="Type a reply..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="rounded-xl"
                    />
                    <Button onClick={handleSend} disabled={!draft.trim()} className="rounded-xl shrink-0">
                      Send
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a conversation</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
