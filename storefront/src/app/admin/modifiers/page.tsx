"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function AdminModifiersPage() {
  const groups = useQuery(api.admin.catalog.listGlobalModifierGroups);
  const createGroup = useMutation(api.admin.catalog.createModifierGroup);
  const updateGroup = useMutation(api.admin.catalog.updateModifierGroup);
  const deleteGroup = useMutation(api.admin.catalog.deleteModifierGroup);
  const createOption = useMutation(api.admin.catalog.createModifierOption);
  const updateOption = useMutation(api.admin.catalog.updateModifierOption);
  const deleteOption = useMutation(api.admin.catalog.deleteModifierOption);

  const [message, setMessage] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupRequired, setEditGroupRequired] = useState(false);
  const [editGroupMin, setEditGroupMin] = useState(0);
  const [editGroupMax, setEditGroupMax] = useState(1);

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOptionName, setEditOptionName] = useState("");
  const [editOptionDelta, setEditOptionDelta] = useState("");

  const [addingOptionForGroup, setAddingOptionForGroup] = useState<string | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionDelta, setNewOptionDelta] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(false);
  const [newGroupMin, setNewGroupMin] = useState(0);
  const [newGroupMax, setNewGroupMax] = useState(1);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function onSaveGroup(groupId: Id<"modifierGroups">) {
    try {
      await updateGroup({
        groupId,
        name: editGroupName.trim() || undefined,
        description: editGroupDescription.trim() || undefined,
        required: editGroupRequired,
        minSelect: editGroupMin,
        maxSelect: editGroupMax,
      });
      setEditingGroupId(null);
      flash("Group updated");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onSaveOption(optionId: Id<"modifierOptions">) {
    try {
      await updateOption({
        optionId,
        name: editOptionName.trim() || undefined,
        priceDeltaCents: Math.round(parseFloat(editOptionDelta || "0") * 100),
      });
      setEditingOptionId(null);
      flash("Option updated");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onAddGroup() {
    if (!newGroupName.trim()) return;
    try {
      await createGroup({
        productId: undefined,
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
        required: newGroupRequired,
        minSelect: newGroupMin,
        maxSelect: newGroupMax,
        sortOrder: groups?.length ?? 0,
      });
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupRequired(false);
      setNewGroupMin(0);
      setNewGroupMax(1);
      flash("Global modifier group added");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onAddOption(groupId: Id<"modifierGroups">, sortOrder: number) {
    if (!newOptionName.trim()) return;
    try {
      await createOption({
        groupId,
        name: newOptionName.trim(),
        priceDeltaCents: Math.round(parseFloat(newOptionDelta || "0") * 100),
        sortOrder,
      });
      setNewOptionName("");
      setNewOptionDelta("");
      setAddingOptionForGroup(null);
      flash("Option added");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Store Modifiers</h1>
        <p className="text-sm text-muted-foreground">
          These modifier groups apply to all products. Configure Birthday Extras, Make it Extra Tipsy, Shape, and other store-wide options here. The description appears as an info tooltip on the product page.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Global modifier groups</CardTitle>
          <CardDescription>
            Edit name, description (tooltip), and options. Changes apply to every product.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!groups ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No global modifier groups yet. Add one below or run the seed (seedModifiers) to create Birthday Extras, Make it Extra Tipsy, and Shape.
            </p>
          ) : (
            groups.map((group) => {
              const options = (group.options ?? []) as Array<{
                _id: Id<"modifierOptions">;
                name: string;
                priceDeltaCents: number;
                sortOrder: number;
              }>;
              return (
                <div key={group._id} className="rounded-lg border">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                    {editingGroupId === group._id ? (
                      <div className="flex flex-1 flex-wrap items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                          />
                        </div>
                        <div className="w-full flex-1 basis-full space-y-1">
                          <Label className="text-xs">Description (info tooltip on product page)</Label>
                          <Input
                            placeholder="e.g. Includes non-standard decoration with a Happy Birthday Cake Sign"
                            value={editGroupDescription}
                            onChange={(e) => setEditGroupDescription(e.target.value)}
                          />
                        </div>
                        <div className="w-16 space-y-1">
                          <Label className="text-xs">Min</Label>
                          <Input
                            type="number"
                            value={editGroupMin}
                            onChange={(e) => setEditGroupMin(Number(e.target.value))}
                          />
                        </div>
                        <div className="w-16 space-y-1">
                          <Label className="text-xs">Max</Label>
                          <Input
                            type="number"
                            value={editGroupMax}
                            onChange={(e) => setEditGroupMax(Number(e.target.value))}
                          />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={editGroupRequired}
                            onChange={(e) => setEditGroupRequired(e.target.checked)}
                          />
                          Required
                        </label>
                        <Button size="sm" onClick={() => onSaveGroup(group._id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingGroupId(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.required ? "Required" : "Optional"} · Select {group.minSelect}–{group.maxSelect}
                            {group.description && " · Has tooltip"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingGroupId(group._id);
                            setEditGroupName(group.name);
                            setEditGroupDescription((group as { description?: string }).description ?? "");
                            setEditGroupRequired(group.required);
                            setEditGroupMin(group.minSelect);
                            setEditGroupMax(group.maxSelect);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteGroup({ groupId: group._id })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="divide-y">
                    {options.map((opt) => (
                      <div key={opt._id} className="flex items-center gap-2 px-3 py-2">
                        {editingOptionId === opt._id ? (
                          <div className="flex flex-1 flex-wrap items-end gap-2">
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input
                                value={editOptionName}
                                onChange={(e) => setEditOptionName(e.target.value)}
                              />
                            </div>
                            <div className="w-28 space-y-1">
                              <Label className="text-xs">Delta ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={editOptionDelta}
                                onChange={(e) => setEditOptionDelta(e.target.value)}
                              />
                            </div>
                            <Button size="sm" onClick={() => onSaveOption(opt._id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingOptionId(null)}>
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{opt.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {opt.priceDeltaCents === 0 ? "Free" : `+$${centsToDollars(opt.priceDeltaCents)}`}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingOptionId(opt._id);
                                setEditOptionName(opt.name);
                                setEditOptionDelta(String(opt.priceDeltaCents / 100));
                              }}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteOption({ optionId: opt._id })}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    {addingOptionForGroup === group._id ? (
                      <div className="flex flex-wrap items-end gap-2 px-3 py-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Option name</Label>
                          <Input
                            placeholder="e.g. Gold Sprinkles"
                            value={newOptionName}
                            onChange={(e) => setNewOptionName(e.target.value)}
                          />
                        </div>
                        <div className="w-28 space-y-1">
                          <Label className="text-xs">Delta ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newOptionDelta}
                            onChange={(e) => setNewOptionDelta(e.target.value)}
                          />
                        </div>
                        <Button size="sm" onClick={() => onAddOption(group._id, options.length)}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddingOptionForGroup(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
                        onClick={() => {
                          setAddingOptionForGroup(group._id);
                          setNewOptionName("");
                          setNewOptionDelta("");
                        }}
                      >
                        <Plus className="size-3" /> Add option
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Add global modifier group</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Group name</Label>
                <Input
                  placeholder="e.g. Birthday Extras"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <div className="w-full flex-1 basis-full space-y-1">
                <Label className="text-xs">Description (shown as tooltip)</Label>
                <Input
                  placeholder="e.g. Includes non-standard decoration with a Happy Birthday Cake Sign"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  value={newGroupMin}
                  onChange={(e) => setNewGroupMin(Number(e.target.value))}
                />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  value={newGroupMax}
                  onChange={(e) => setNewGroupMax(Number(e.target.value))}
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newGroupRequired}
                  onChange={(e) => setNewGroupRequired(e.target.checked)}
                />
                Required
              </label>
              <Button size="sm" onClick={onAddGroup}>
                <Plus className="size-4" /> Add group
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
