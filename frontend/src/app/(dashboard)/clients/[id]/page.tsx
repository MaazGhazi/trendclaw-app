"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Client, Signal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ClientWithSignals = Client & { signals: Signal[] };

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  executive_change: "Executive Changes",
  funding: "Funding Events",
  hiring: "Hiring Activity",
  product_launch: "Product Launches",
  expansion: "Expansion",
  partnership: "Partnerships",
  social_posts: "Social Media Posts",
  news_mentions: "News & Media",
  awards: "Awards & Recognition",
  events: "Events",
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<ClientWithSignals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ client: ClientWithSignals }>(`/api/clients/${id}`)
      .then((data) => setClient(data.client))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this client?")) return;
    try {
      await api.delete(`/api/clients/${id}`);
      router.push("/clients");
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!client) return <p className="text-muted-foreground">Client not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          {client.industry && <p className="text-muted-foreground">{client.industry}</p>}
        </div>
        <div className="flex gap-2">
          <Badge variant={client.isActive ? "default" : "secondary"}>
            {client.isActive ? "Active" : "Paused"}
          </Badge>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {client.domain && <p><strong>Website:</strong> {client.domain}</p>}
          {client.description && <p><strong>Description:</strong> {client.description}</p>}
          {client.linkedinUrl && <p><strong>LinkedIn:</strong> <a href={client.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">{client.linkedinUrl}</a></p>}
          {client.twitterUrl && <p><strong>Twitter/X:</strong> <a href={client.twitterUrl} target="_blank" rel="noopener noreferrer" className="underline">{client.twitterUrl}</a></p>}
          {client.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <strong>Keywords:</strong>
              {client.keywords.map((kw) => (
                <Badge key={kw} variant="outline">{kw}</Badge>
              ))}
            </div>
          )}
          <p><strong>Monitoring:</strong> {client.cronJobId ? "Active cron job" : "Not provisioned"}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            <strong>Signal Types:</strong>
            {(client.monitorSignals.length > 0
              ? client.monitorSignals
              : Object.keys(SIGNAL_TYPE_LABELS)
            ).map((key) => (
              <Badge key={key} variant="outline">
                {SIGNAL_TYPE_LABELS[key] || key}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Signals</h2>
        {client.signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signals detected yet for this client.</p>
        ) : (
          <div className="space-y-2">
            {client.signals.map((signal) => (
              <Card key={signal.id}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{signal.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(signal.detectedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{signal.title}</p>
                  <p className="text-xs text-muted-foreground">{signal.summary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
