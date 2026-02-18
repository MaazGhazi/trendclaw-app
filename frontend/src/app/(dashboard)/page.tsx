"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DashboardStats } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const signalTypeLabels: Record<string, string> = {
  executive_change: "Executive Change",
  funding: "Funding",
  hiring: "Hiring",
  product_launch: "Product Launch",
  expansion: "Expansion",
  partnership: "Partnership",
  trending_topic: "Trending Topic",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DashboardStats>("/api/dashboard/stats")
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  if (!stats) {
    return <p className="text-muted-foreground">Failed to load dashboard.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.clientCount}</p>
            <p className="text-xs text-muted-foreground">{stats.activeClientCount} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Signals Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.signalCountToday}</p>
            <p className="text-xs text-muted-foreground">{stats.signalCountTotal} total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Latest Report</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.latestReport ? (
              <>
                <p className="text-sm font-medium">{stats.latestReport.title}</p>
                <p className="text-xs text-muted-foreground">{stats.latestReport.signalCount} signals</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No reports yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Signals</h2>
        {stats.recentSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signals detected yet. Add some clients to start monitoring.</p>
        ) : (
          <div className="space-y-2">
            {stats.recentSignals.map((signal) => (
              <Card key={signal.id}>
                <CardContent className="flex items-start justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{signalTypeLabels[signal.type] || signal.type}</Badge>
                      {signal.client && (
                        <span className="text-xs text-muted-foreground">{signal.client.name}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium">{signal.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{signal.summary}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(signal.detectedAt).toLocaleDateString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
