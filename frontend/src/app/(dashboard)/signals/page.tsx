"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Signal } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ signals: Signal[]; total: number }>("/api/signals")
      .then((data) => setSignals(data.signals))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading signals...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Signals</h1>

      {signals.length === 0 ? (
        <p className="text-muted-foreground">No signals detected yet.</p>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => (
            <Card key={signal.id}>
              <CardContent className="flex items-start justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{signal.type}</Badge>
                    {signal.client && (
                      <span className="text-xs text-muted-foreground">{signal.client.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(signal.confidence * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{signal.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{signal.summary}</p>
                  {signal.sourceUrl && (
                    <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs underline">
                      {signal.sourceName || "Source"}
                    </a>
                  )}
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
  );
}
