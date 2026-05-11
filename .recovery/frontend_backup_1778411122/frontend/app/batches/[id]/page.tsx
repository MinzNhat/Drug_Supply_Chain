/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function BatchTrackerPage() {
  const { id } = useParams();
  const [batch, setBatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    if (id && user) {
      fetchApi(`/batches/${id}`)
        .then(res => {
          setBatch(res.data);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    } else if (!user) {
      setError("Please login to view ledger traceability records.");
      setLoading(false);
    }
  }, [id, user]);

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Querying Fabric Ledger...</div>;
  if (error) return <div className="p-8 text-center text-destructive font-semibold">{error}</div>;
  if (!batch) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Ledger Provenance</h1>
        <p className="text-muted-foreground text-lg mt-2">Batch Tracker: <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">{batch.batchID}</span></p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-6 border rounded-xl bg-card">
          <h2 className="text-xl font-semibold mb-4">Metadata</h2>
          <div className="space-y-3">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Product Title</span>
              <span className="font-medium text-right">{batch.drugName}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Manufacturer MSP</span>
              <span className="font-medium font-mono">{batch.manufacturerMSP}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Original Supply</span>
              <span className="font-medium">{batch.totalSupply} Units</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Expiry Date</span>
              <span className="font-medium text-red-500">{new Date(batch.expiryDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="p-6 border rounded-xl bg-card">
          <h2 className="text-xl font-semibold mb-4">Live State</h2>
          <div className="space-y-3">
            <div className="flex justify-between border-b pb-2 items-center">
              <span className="text-muted-foreground">Current Owner</span>
              <span className="font-semibold text-primary">{batch.ownerMSP}</span>
            </div>
            <div className="flex justify-between border-b pb-2 items-center">
              <span className="text-muted-foreground">Transit Status</span>
              <span className={`px-2 py-1 rounded text-xs font-semibold ${batch.transferStatus === "IN_TRANSIT" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                {batch.transferStatus}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2 items-center">
              <span className="text-muted-foreground">Market Consumption</span>
              <span className="font-semibold">
                {batch.consumptionConfirmed ? '✅ Confirmed' : 'Pre-market'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
