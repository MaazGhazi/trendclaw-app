"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { TrendData, ProgressData, HistoryRun, QueueData, FormatsData } from "./types";
import { TYPE_LABELS } from "./types";

// --- useTrends: polls /api/trends or fetches a specific historical file ---

export function useTrends(file?: string | null) {
  const [data, setData] = useState<TrendData | null>(null);
  const [currentFile, setCurrentFile] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchTrends = useCallback(async () => {
    try {
      const url = file
        ? `/api/trends/history?file=${encodeURIComponent(file)}`
        : "/api/trends";
      const res = await fetch(url);
      if (res.status === 401) {
        setError("sign-in-required");
        return;
      }
      if (res.status === 404) {
        setError("No trend data yet. Waiting for first pipeline run...");
        return;
      }
      if (!res.ok) {
        setError("Failed to fetch trends");
        return;
      }
      const json = await res.json();
      setData(json.data);
      setCurrentFile(json.file || file || "");
      setRegion(json.region || null);
      setError("");
    } catch {
      setError("Connection error");
    }
  }, [file]);

  useEffect(() => {
    fetchTrends();
    // Only auto-poll when viewing latest (no specific file)
    if (!file) {
      const interval = setInterval(fetchTrends, 30_000);
      return () => clearInterval(interval);
    }
  }, [fetchTrends, file]);

  return { data, file: currentFile, region, error, refetch: fetchTrends };
}

// --- useProgress: polls /api/progress (2s when running, 10s idle) ---

export function useProgress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("");

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/progress");
      if (res.status === 404) {
        setData(null);
        setError("No pipeline run data available.");
        return;
      }
      if (!res.ok) {
        setError("Failed to fetch progress");
        return;
      }
      const json = await res.json();
      setData(json);
      setError("");
    } catch {
      setError("Connection error");
    }
  }, []);

  // Poll: 2s when running, 10s when idle/completed
  useEffect(() => {
    fetchProgress();
    const interval = setInterval(
      fetchProgress,
      data?.status === "running" ? 2000 : 10000
    );
    return () => clearInterval(interval);
  }, [fetchProgress, data?.status]);

  // Elapsed timer
  useEffect(() => {
    if (!data?.started_at) return;
    if (data.status !== "running") {
      setElapsed(formatElapsed(data.started_at));
      return;
    }
    const tick = () => setElapsed(formatElapsed(data.started_at));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data?.started_at, data?.status]);

  return { data, error, elapsed, refetch: fetchProgress };
}

// --- useQueue: polls /api/run for queue status (5s when running, 15s idle) ---

export function useQueue() {
  const [data, setData] = useState<QueueData | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/run");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(
      fetchQueue,
      data?.running ? 5000 : 15000
    );
    return () => clearInterval(interval);
  }, [fetchQueue, data?.running]);

  return { data, refetch: fetchQueue };
}

// --- useHistory: fetches /api/trends/history ---

export function useHistory() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/trends/history");
      if (!res.ok) return;
      const json = await res.json();
      setRuns(json.runs || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { runs, loading, refetch: fetchHistory };
}

// --- useRunTrigger: handles POST /api/run ---

export function useRunTrigger(onStarted?: () => void) {
  const [runningType, setRunningType] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const trigger = useCallback(
    async (type: string) => {
      setRunningType(type);
      setMessage("");
      if (timerRef.current) clearTimeout(timerRef.current);

      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessage(json.error || "Failed to start pipeline");
        } else if (json.queued) {
          setMessage(`${TYPE_LABELS[type] || type} queued (position ${json.position})`);
          onStarted?.();
        } else {
          setMessage(`${TYPE_LABELS[type] || type} started!`);
          onStarted?.();
        }
      } catch {
        setMessage("Connection error");
      }
      timerRef.current = setTimeout(() => {
        setRunningType(null);
        setMessage("");
      }, 3000);
    },
    [onStarted]
  );

  return { runningType, message, trigger };
}

// --- Helpers ---

export function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );
  if (elapsed < 60) return `${elapsed}s`;
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return `${min}m ${sec}s`;
}

export function totalDuration(steps: ProgressData["steps"]): string {
  let total = 0;
  if (steps.scraping?.duration_s) total += steps.scraping.duration_s;
  return total > 0 ? `${total.toFixed(1)}s` : "";
}

// --- useFormats: fetches social trend format data from Supabase ---

export function useFormats() {
  const [data, setData] = useState<FormatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchFormats = useCallback(async () => {
    try {
      const res = await fetch("/api/formats");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFormats();
  }, [fetchFormats]);

  return { data, loading, error, refetch: fetchFormats };
}

export function formatAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
