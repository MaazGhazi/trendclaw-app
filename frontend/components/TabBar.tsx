"use client";

export type TabId = "trends" | "pipeline" | "history";

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  isPipelineRunning: boolean;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "trends", label: "Trends" },
  { id: "pipeline", label: "Pipeline" },
  { id: "history", label: "History" },
];

export default function TabBar({ active, onChange, isPipelineRunning }: TabBarProps) {
  return (
    <div className="flex gap-1 mb-6 border-b border-zinc-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.id
              ? "text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
          }`}
        >
          {tab.label}
          {tab.id === "pipeline" && isPipelineRunning && (
            <span className="absolute top-2 -right-0.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          )}
        </button>
      ))}
    </div>
  );
}
