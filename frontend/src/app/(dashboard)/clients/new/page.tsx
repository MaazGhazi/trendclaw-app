"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SIGNAL_TYPE_OPTIONS = [
  { key: "executive_change", label: "Executive Changes", description: "New hires, departures, promotions (C-suite/VP)" },
  { key: "funding", label: "Funding Events", description: "Fundraising announcements, investment rounds" },
  { key: "hiring", label: "Hiring Activity", description: "Significant hiring activity, team expansions" },
  { key: "product_launch", label: "Product Launches", description: "New products, features, services" },
  { key: "expansion", label: "Expansion", description: "New offices, markets, geographic growth" },
  { key: "partnership", label: "Partnerships", description: "Strategic partnerships, integrations" },
  { key: "social_posts", label: "Social Media Posts", description: "Recent social media posts and content activity" },
  { key: "news_mentions", label: "News & Media", description: "Press coverage, news articles, media mentions" },
  { key: "awards", label: "Awards & Recognition", description: "Awards, rankings, certifications" },
  { key: "events", label: "Events", description: "Conference appearances, webinars, speaking engagements" },
] as const;

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSignals, setSelectedSignals] = useState<string[]>(
    SIGNAL_TYPE_OPTIONS.map((o) => o.key)
  );

  function toggleSignal(key: string) {
    setSelectedSignals((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    if (selectedSignals.length === SIGNAL_TYPE_OPTIONS.length) {
      setSelectedSignals([]);
    } else {
      setSelectedSignals(SIGNAL_TYPE_OPTIONS.map((o) => o.key));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const keywordsRaw = formData.get("keywords") as string;

    // Send empty array if all selected (backwards compatible = monitor all)
    const allSelected = selectedSignals.length === SIGNAL_TYPE_OPTIONS.length;

    try {
      await api.post("/api/clients", {
        name: formData.get("name"),
        domain: formData.get("domain") || null,
        description: formData.get("description") || null,
        linkedinUrl: formData.get("linkedinUrl") || null,
        twitterUrl: formData.get("twitterUrl") || null,
        facebookUrl: formData.get("facebookUrl") || null,
        instagramUrl: formData.get("instagramUrl") || null,
        industry: formData.get("industry") || null,
        keywords: keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : [],
        monitorSignals: allSelected ? [] : selectedSignals,
      });
      router.push("/clients");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Add Client</h1>
      <Card>
        <CardHeader>
          <CardTitle>Client Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input id="name" name="name" required />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="domain">Website</Label>
                <Input id="domain" name="domain" placeholder="example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" name="industry" placeholder="e.g. SaaS, Healthcare" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="Brief description of the company" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn Page URL</Label>
              <Input id="linkedinUrl" name="linkedinUrl" placeholder="https://linkedin.com/company/..." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="twitterUrl">Twitter/X URL</Label>
                <Input id="twitterUrl" name="twitterUrl" placeholder="https://x.com/..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebookUrl">Facebook URL</Label>
                <Input id="facebookUrl" name="facebookUrl" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagramUrl">Instagram URL</Label>
              <Input id="instagramUrl" name="instagramUrl" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (comma-separated)</Label>
              <Input id="keywords" name="keywords" placeholder="AI, machine learning, enterprise" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>What to Monitor</Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {selectedSignals.length === SIGNAL_TYPE_OPTIONS.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {SIGNAL_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSignals.includes(opt.key)}
                      onChange={() => toggleSignal(opt.key)}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Client"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
