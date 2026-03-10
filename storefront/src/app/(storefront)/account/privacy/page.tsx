"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useConvexAuth } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DELETE_CONFIRMATION_TEXT = "DELETE";

export default function AccountPrivacyPage() {
  const { isAuthenticated } = useConvexAuth();
  const deleteMyAccount = useAction(api.accountDeletionAction.deleteMyAccount);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { signOut } = useClerk();
  const router = useRouter();

  async function handleDeleteAccount() {
    if (deleteConfirmText !== DELETE_CONFIRMATION_TEXT) return;
    setDeleteError(null);
    setDeletePending(true);
    try {
      await deleteMyAccount();
      await signOut();
      router.push("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setDeletePending(false);
      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
    }
  }

  function openDeleteDialog() {
    setDeleteConfirmText("");
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  const canDelete = deleteConfirmText === DELETE_CONFIRMATION_TEXT;

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">Sign in to manage your privacy settings.</p>
        <Button asChild>
          <Link href="/account">Back to account</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-text">
          Privacy &amp; Data
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your data and account settings
        </p>
      </header>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account, order history link, loyalty points, addresses, and all
            associated data. Orders will remain in our records for business purposes but will no
            longer be linked to you. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive hover:bg-destructive/10"
            onClick={openDeleteDialog}
          >
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Button asChild variant="outline" size="sm">
        <Link href="/account">Back to account</Link>
      </Button>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all associated data. To confirm, type{" "}
              <code className="rounded bg-muted px-1 font-mono text-sm">{DELETE_CONFIRMATION_TEXT}</code>{" "}
              below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm" className="sr-only">
              Type {DELETE_CONFIRMATION_TEXT} to confirm
            </Label>
            <Input
              id="delete-confirm"
              type="text"
              placeholder={`Type ${DELETE_CONFIRMATION_TEXT} to confirm`}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="font-mono"
              autoComplete="off"
              autoCapitalize="off"
            />
          </div>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!canDelete || deletePending}
            >
              {deletePending ? "Deleting…" : "Yes, delete my account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
