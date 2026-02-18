"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Report, Signal } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ReportDetail = Report & {
  reportSignals: Array<{
    section: string;
    sortOrder: number;
    signal: Signal;
  }>;
};

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ report: ReportDetail }>(`/api/reports/${id}`)
      .then((data) => setReport(data.report))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading report...</p>;
  if (!report) return <p className="text-muted-foreground">Report not found.</p>;

  // Group signals by section
  const sections = report.reportSignals.reduce(
    (acc, rs) => {
      if (!acc[rs.section]) acc[rs.section] = [];
      acc[rs.section].push(rs.signal);
      return acc;
    },
    {} as Record<string, Signal[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{report.title}</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={report.status === "completed" ? "default" : "secondary"}>
            {report.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {new Date(report.reportDate).toLocaleDateString()} &middot; {report.signalCount} signals
          </span>
        </div>
      </div>

      {Object.entries(sections).map(([section, signals]) => (
        <Card key={section}>
          <CardHeader>
            <CardTitle className="text-lg capitalize">{section.replace(/_/g, " ")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {signals.map((signal) => (
              <div key={signal.id} className="border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{signal.title}</p>
                  {signal.client && (
                    <Badge variant="outline" className="text-xs">{signal.client.name}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{signal.summary}</p>
                {signal.sourceUrl && (
                  <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                    {signal.sourceName || "Source"}
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
