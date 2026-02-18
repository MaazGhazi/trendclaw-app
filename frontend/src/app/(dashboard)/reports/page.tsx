"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Report } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  function loadReports() {
    api
      .get<{ reports: Report[]; total: number }>("/api/reports")
      .then((data) => setReports(data.reports))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.post("/api/reports/generate", {});
      loadReports();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading reports...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "Generate Report"}
        </Button>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted-foreground">No reports yet. Generate your first report.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{report.title}</p>
                    <p className="text-xs text-muted-foreground">{report.signalCount} signals</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={report.status === "completed" ? "default" : "secondary"}>
                      {report.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.reportDate).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
