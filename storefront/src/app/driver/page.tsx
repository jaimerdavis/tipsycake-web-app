"use client";

import { useState } from "react";
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
  const [lat, setLat] = useState("40.7128");
  const [lng, setLng] = useState("-74.0060");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Driver Portal</h1>
        <p className="text-sm text-muted-foreground">
          Update assignment status, ping location, upload proof of delivery.
        </p>
      </header>

      <section className="grid gap-4">
        {(assignments ?? []).map((assignment) => (
          <Card key={assignment._id}>
            <CardHeader>
              <CardTitle>Assignment {String(assignment._id)}</CardTitle>
              <CardDescription>Order {String(assignment.orderId)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge>{assignment.status}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus({ assignmentId: assignment._id, status: "en_route" })}
                >
                  Mark en_route
                </Button>
                <Button
                  size="sm"
                  onClick={() => updateStatus({ assignmentId: assignment._id, status: "delivered" })}
                >
                  Mark delivered
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={lat} onChange={(event) => setLat(event.target.value)} />
                <Input value={lng} onChange={(event) => setLng(event.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
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
                  Ping location
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    uploadProof({
                      assignmentId: assignment._id,
                      storageId: `mock-storage-${Date.now()}`,
                    })
                  }
                >
                  Upload proof
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
