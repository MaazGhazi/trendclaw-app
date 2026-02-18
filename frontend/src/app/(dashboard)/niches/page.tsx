"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Niche = {
  id: string;
  name: string;
  keywords: string[];
  sources: string[];
  createdAt: string;
};

export default function NichesPage() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadNiches();
  }, []);

  function loadNiches() {
    api
      .get<{ niches: Niche[] }>("/api/niches")
      .then((data) => setNiches(data.niches))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/niches", {
        name: formName,
        keywords: formKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      setFormName("");
      setFormKeywords("");
      setShowForm(false);
      loadNiches();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this niche?")) return;
    try {
      await api.delete(`/api/niches/${id}`);
      loadNiches();
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading niches...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Niches</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Niche"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Niche Name</Label>
                <Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Input id="keywords" value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} required />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Niche"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {niches.length === 0 ? (
        <p className="text-muted-foreground">No content niches yet.</p>
      ) : (
        <div className="space-y-2">
          {niches.map((niche) => (
            <Card key={niche.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{niche.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {niche.keywords.map((kw) => (
                      <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(niche.id)}>
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
