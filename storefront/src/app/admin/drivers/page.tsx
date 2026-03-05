"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminDriversPage() {
  const drivers = useQuery(api.admin.drivers.list);
  const createDriver = useMutation(api.admin.drivers.create);
  const setDriverActive = useMutation(api.admin.drivers.setActive);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Drivers</h1>
        <p className="text-sm text-muted-foreground">Create and activate driver records.</p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Create Driver</CardTitle>
          <CardDescription>TRK-003 / ADM-002 driver management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <Button
            onClick={async () => {
              try {
                await createDriver({ name, phone, active: true });
                setName("");
                setPhone("");
                setMessage("Driver created.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Create failed");
              }
            }}
          >
            Create driver
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Drivers</CardTitle>
          <CardDescription>Current records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(drivers ?? []).map((driver) => (
            <div key={driver._id} className="flex items-center justify-between rounded border p-3 text-sm">
              <div>
                <p className="font-medium">{driver.name}</p>
                <p className="text-xs text-muted-foreground">{driver.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={driver.active ? "default" : "outline"}>
                  {driver.active ? "active" : "inactive"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDriverActive({ driverId: driver._id, active: !driver.active })}
                >
                  Toggle
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
