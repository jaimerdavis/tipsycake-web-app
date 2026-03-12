"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleIcon, XIcon } from "lucide-react";

const STAFF_ROLES = ["admin", "manager", "dispatcher"] as const;
const GUEST_SESSION_KEY = "chat_guest";

/** Chat widget for customers and guests. Staff use /admin/chat. Guests provide email/name to start. */
export function ChatWidgetUniversal() {
  const pathname = usePathname();
  const params = useParams<{ token?: string }>();
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.meOrNull);

  const guestToken =
    pathname.startsWith("/orders/") && params?.token ? (params.token as string) : undefined;

  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<Id<"chatConversations"> | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ email: "", name: "", phone: "" });
  const [contactFormError, setContactFormError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const createOrGetGuest = useMutation(api.chat.createOrGetConversationForGuest);
  const createOrGetGuestByContact = useMutation(api.chat.createOrGetConversationForGuestByContact);
  const createOrGetUser = useMutation(api.chat.createOrGetConversationForUser);
  const sendMessage = useMutation(api.chat.sendMessage);

  const isStaff = user != null && STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]);
  const isGuestOrderFlow = Boolean(guestToken);
  const isGuestContactFlow = Boolean(accessToken);
  const canChat = !isStaff;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(GUEST_SESSION_KEY);
      if (stored) {
        const { conversationId: cid, accessToken: at } = JSON.parse(stored) as {
          conversationId: string;
          accessToken: string;
        };
        if (cid && at) {
          setConversationId(cid as Id<"chatConversations">);
          setAccessToken(at);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const messages = useQuery(
    api.chat.getMessages,
    conversationId
      ? {
          conversationId,
          ...(isGuestOrderFlow ? { guestToken: guestToken! } : {}),
          ...(isGuestContactFlow ? { accessToken: accessToken! } : {}),
        }
      : "skip"
  );

  const handleOpen = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (conversationId && !(isAuthenticated && accessToken)) {
      setOpen(true);
      return;
    }
    setAuthError(null);
    setContactFormError(null);
    try {
      if (isGuestOrderFlow) {
        const id = await createOrGetGuest({ guestToken: guestToken! });
        setConversationId(id);
      } else if (isAuthenticated) {
        const id = await createOrGetUser({});
        setConversationId(id);
        if (accessToken) {
          if (typeof window !== "undefined") localStorage.removeItem(GUEST_SESSION_KEY);
          setAccessToken(null);
        }
      } else {
        setOpen(true);
        return;
      }
      setOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start chat";
      setAuthError(msg);
      setOpen(true);
    }
  }, [
    open,
    conversationId,
    accessToken,
    guestToken,
    isGuestOrderFlow,
    isAuthenticated,
    createOrGetGuest,
    createOrGetUser,
  ]);

  const handleContactSubmit = useCallback(async () => {
    const email = contactForm.email.trim();
    const name = contactForm.name.trim();
    const phone = contactForm.phone.trim();
    if (!email) {
      setContactFormError("Email is required");
      return;
    }
    if (!name) {
      setContactFormError("Name is required");
      return;
    }
    setContactFormError(null);
    try {
      const { conversationId: cid, accessToken: at } = await createOrGetGuestByContact({
        email,
        name,
        phone: phone || undefined,
      });
      setConversationId(cid);
      setAccessToken(at);
      if (typeof window !== "undefined") {
        localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ conversationId: cid, accessToken: at }));
      }
      await sendMessage({
        conversationId: cid,
        body: "Hi, I'd like to get some help.",
        accessToken: at,
      });
    } catch (e) {
      setContactFormError(e instanceof Error ? e.message : "Could not start chat");
    }
  }, [contactForm, createOrGetGuestByContact, sendMessage]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || !conversationId) return;
    try {
      await sendMessage({
        conversationId,
        body,
        ...(isGuestOrderFlow ? { guestToken: guestToken! } : {}),
        ...(isGuestContactFlow ? { accessToken: accessToken! } : {}),
      });
      setDraft("");
    } catch {
      // Ignore send errors for now
    }
  }, [draft, conversationId, guestToken, isGuestOrderFlow, isGuestContactFlow, accessToken, sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  if (!canChat) return null;

  return (
    <>
      <Button
        variant="default"
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg sm:gap-2 sm:px-5"
        onClick={handleOpen}
        aria-label={open ? "Close chat" : "Open chat"}
        title="Message us"
      >
        {open ? (
          <XIcon className="size-5 shrink-0" />
        ) : (
          <>
            <MessageCircleIcon className="size-5 shrink-0" />
            <span className="text-sm font-medium">Chat</span>
          </>
        )}
      </Button>

      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-xl border bg-background shadow-xl sm:w-96">
          <div className="border-b bg-muted/50 px-4 py-3">
            <h3 className="font-semibold">Message us</h3>
            <p className="text-xs text-muted-foreground">
              {isGuestOrderFlow
                ? "Type a message..."
                : !conversationId && !isAuthenticated
                  ? "Enter your details below to start a conversation."
                  : "Have a question? Type your message below and click Send to start."}
            </p>
          </div>
          {authError && (
            <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {authError}
            </div>
          )}
          {!conversationId && !isGuestOrderFlow && !isAuthenticated ? (
            <form
              className="flex flex-col gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleContactSubmit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="chat-email">Email</Label>
                <Input
                  id="chat-email"
                  type="email"
                  placeholder="you@example.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chat-name">Full name</Label>
                <Input
                  id="chat-name"
                  type="text"
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chat-phone">Phone (optional)</Label>
                <Input
                  id="chat-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              {contactFormError && (
                <p className="text-sm text-destructive">{contactFormError}</p>
              )}
              <Button type="submit">Start chat</Button>
            </form>
          ) : (
            <>
              <div className="flex max-h-72 flex-1 flex-col overflow-y-auto p-3">
                {messages === undefined ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Type below and click Send to start the conversation.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`mb-2 max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.authorType === "customer"
                          ? "ml-0 mr-auto bg-muted"
                          : "ml-auto mr-0 bg-primary text-primary-foreground"
                      }`}
                    >
                      {msg.body}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t p-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your message and click Send..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={2}
                    className="min-h-0 resize-none"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || !conversationId}
                    size="sm"
                    className="shrink-0 self-end"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
