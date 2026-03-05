"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function DriverPortalPage() {
  const assignments = useQuery(api.driver.myAssignments);
  const updateStatus = useMutation(api.driver.updateStatus);
  const pingLocation = useMutation(api.driver.pingLocation);
  const uploadProof = useMutation(api.driver.uploadProofOfDelivery);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [lat, setLat] = useState("40.7128");
  const [lng, setLng] = useState("-74.0060");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  async function handleProofUpload(assignmentId: string, file: File) {
    setUploading(assignmentId);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await result.json()) as { storageId: string };
      await uploadProof({ assignmentId: assignmentId as never, storageId });
    } finally {
      setUploading(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Driver Portal</h1>
        <p className="text-sm text-muted-foreground">
          Update assignment status, ping location, upload proof of delivery.
        </p>
      </header>

      {(!assignments || assignments.length === 0) && (
        <p className="text-sm text-muted-foreground">No assignments found.</p>
      )}

      <section className="grid gap-4">
        {(assignments ?? []).map((assignment) => (
          <Card key={assignment._id}>
            <CardHeader>
              <CardTitle className="text-base">
                Order {String(assignment.orderId).slice(0, 16)}…
              </CardTitle>
              <CardDescription>
                Assignment {String(assignment._id).slice(0, 16)}…
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge>{assignment.status}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assignment.status === "en_route"}
                  onClick={() => updateStatus({ assignmentId: assignment._id, status: "en_route" })}
                >
                  Mark En Route
                </Button>
                <Button
                  size="sm"
                  disabled={assignment.status === "delivered"}
                  onClick={() => updateStatus({ assignmentId: assignment._id, status: "delivered" })}
                >
                  Mark Delivered
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Latitude</label>
                  <Input value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Longitude</label>
                  <Input value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    pingLocation({
                      assignmentId: assignment._id,
                      lat: Number(lat),
                      lng: Number(lng),
                    })
                  }
                >
                  Ping
                </Button>
              </div>

              <div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(assignment._id, el);
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleProofUpload(assignment._id, file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading === assignment._id}
                  onClick={() => fileInputRefs.current.get(assignment._id)?.click()}
                >
                  {uploading === assignment._id ? "Uploading…" : "Upload Proof Photo"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
