"use client";

import { useCallback, useState, useEffect } from "react";
import { useTrends, useProgress, useHistory, useRunTrigger } from "@/lib/hooks";
import DashboardHeader from "@/components/DashboardHeader";
import SystemHealthStrip from "@/components/SystemHealthStrip";
import TabBar, { type TabId } from "@/components/TabBar";
import TrendsTab from "@/components/tabs/TrendsTab";
import PipelineTab from "@/components/tabs/PipelineTab";
import HistoryTab from "@/components/tabs/HistoryTab";

function getInitialTab(): TabId {
  if (typeof window === "undefined") return "trends";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "trends" || tab === "pipeline" || tab === "history") return tab;
  return "trends";
}

function getInitialFile(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("file");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [viewFile, setViewFile] = useState<string | null>(getInitialFile);

  // Sync tab to URL without router.push (just replaceState)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (viewFile) params.set("file", viewFile);
    const url = `/?${params.toString()}`;
    window.history.replaceState(null, "", url);
  }, [activeTab, viewFile]);

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
  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab !== "trends") setViewFile(null);
  }, []);

  const viewRun = useCallback((file: string) => {
    setViewFile(file);
    setActiveTab("trends");
  }, []);

  const backToLatest = useCallback(() => {
    setViewFile(null);
  }, []);

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
