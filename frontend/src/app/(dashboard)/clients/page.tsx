"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Client } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ clients: Client[] }>("/api/clients")
      .then((data) => setClients(data.clients))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading clients...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Link href="/clients/new">
          <Button>Add Client</Button>
        </Link>
      </div>

      {clients.length === 0 ? (
        <p className="text-muted-foreground">No clients yet. Add your first client to start monitoring.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{client.name}</h3>
                      {client.industry && (
                        <p className="text-xs text-muted-foreground">{client.industry}</p>
                      )}
                    </div>
                    <Badge variant={client.isActive ? "default" : "secondary"}>
                      {client.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  {client.domain && (
                    <p className="mt-2 text-sm text-muted-foreground">{client.domain}</p>
                  )}
                  {client.keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {client.keywords.slice(0, 3).map((kw) => (
                        <Badge key={kw} variant="outline" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                      {client.keywords.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{client.keywords.length - 3}</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
