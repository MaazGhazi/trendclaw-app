"use client";

import { useCallback, useState, useEffect } from "react";
import { useTrends, useProgress, useHistory, useQueue, useRunTrigger } from "@/lib/hooks";
import DashboardHeader from "@/components/DashboardHeader";
import SystemHealthStrip from "@/components/SystemHealthStrip";
import TabBar, { type TabId } from "@/components/TabBar";
import TrendsTab from "@/components/tabs/TrendsTab";
import PipelineTab from "@/components/tabs/PipelineTab";
import HistoryTab from "@/components/tabs/HistoryTab";
import Link from "next/link";

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

function SignInPrompt() {
  return (
    <div className="max-w-lg mx-auto mt-32 text-center px-4">
      <h1 className="text-3xl font-bold text-zinc-100 mb-3">TrendClaw</h1>
      <p className="text-zinc-400 mb-6">
        Real-time trend monitoring across Tech, Crypto, and Social Media.
        Sign in to see trends personalized for your region.
      </p>
      <Link
        href="/auth/signin"
        className="inline-block px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors font-medium"
      >
        Sign In to Get Started
      </Link>
    </div>
  );
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
  const { data: queueData, refetch: refetchQueue } = useQueue();

  const onRunStarted = useCallback(() => {
    refetchHistory();
    refetchQueue();
  }, [refetchHistory, refetchQueue]);

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

  // If user is not authenticated, show sign-in prompt
  if (latestTrends.error === "sign-in-required") {
    return <SignInPrompt />;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <DashboardHeader
        latestData={latestTrends.data}
        latestFile={latestTrends.file}
        runningType={runningType}
        runMessage={runMessage}
        region={latestTrends.region}
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
          queueData={queueData}
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
