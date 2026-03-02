"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTrends, useProgress, useHistory, useRunTrigger } from "@/lib/hooks";
import DashboardHeader from "@/components/DashboardHeader";
import SystemHealthStrip from "@/components/SystemHealthStrip";
import TabBar, { type TabId } from "@/components/TabBar";
import TrendsTab from "@/components/tabs/TrendsTab";
import PipelineTab from "@/components/tabs/PipelineTab";
import HistoryTab from "@/components/tabs/HistoryTab";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get("tab") as TabId) || "trends";
  const viewFile = searchParams.get("file");

  // Shared data hooks
  const latestTrends = useTrends();
  const historicalTrends = useTrends(viewFile);
  const trends = viewFile ? historicalTrends : latestTrends;

  const { data: progress, error: progressError, elapsed } = useProgress();
  const { runs, loading: historyLoading, refetch: refetchHistory } = useHistory();

  const onRunStarted = useCallback(() => {
    refetchHistory();
  }, [refetchHistory]);

  const { runningType, message: runMessage, trigger } = useRunTrigger(onRunStarted);

  // Navigation helpers
  const setTab = useCallback(
    (tab: TabId) => {
      const params = new URLSearchParams();
      params.set("tab", tab);
      router.push(`/?${params.toString()}`);
    },
    [router]
  );

  const viewRun = useCallback(
    (file: string) => {
      const params = new URLSearchParams();
      params.set("tab", "trends");
      params.set("file", file);
      router.push(`/?${params.toString()}`);
    },
    [router]
  );

  const backToLatest = useCallback(() => {
    router.push("/?tab=trends");
  }, [router]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <DashboardHeader
        latestData={latestTrends.data}
        latestFile={latestTrends.file}
        runningType={runningType}
        runMessage={runMessage}
        onTriggerRun={trigger}
        onRefresh={latestTrends.refetch}
      />

      <SystemHealthStrip
        latestData={latestTrends.data}
        progress={progress}
        elapsed={elapsed}
      />

      <TabBar
        active={activeTab}
        onChange={setTab}
        isPipelineRunning={progress?.status === "running"}
      />

      {activeTab === "trends" && (
        <TrendsTab
          data={trends.data}
          error={trends.error}
          viewingFile={viewFile}
          onBackToLatest={backToLatest}
        />
      )}

      {activeTab === "pipeline" && (
        <PipelineTab
          progress={progress}
          progressError={progressError}
          elapsed={elapsed}
          recentRuns={runs}
          onViewRun={viewRun}
        />
      )}

      {activeTab === "history" && (
        <HistoryTab
          runs={runs}
          loading={historyLoading}
          onViewRun={viewRun}
        />
      )}
    </main>
  );
}
