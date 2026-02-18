"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const keywordsRaw = formData.get("keywords") as string;

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
