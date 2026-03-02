"use client";

interface Mover {
  title: string;
  direction: "up" | "down" | "new";
  delta: string;
}

interface Signals {
  emerging: string[];
  fading: string[];
}

const directionStyle: Record<string, { icon: string; color: string }> = {
  up: { icon: "^", color: "text-green-400" },
  down: { icon: "v", color: "text-red-400" },
  new: { icon: "*", color: "text-purple-400" },
};

export default function TopMovers({
  movers,
  signals,
  summary,
}: {
  movers: Mover[];
  signals: Signals;
  summary: string;
}) {
  return (
    <aside className="space-y-6">
      {/* Summary */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-100 mb-2">Summary</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{summary}</p>
      </div>

      {/* Top Movers */}
      {movers.length > 0 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Top Movers
          </h3>
          <div className="space-y-2">
            {movers.map((m) => {
              const style = directionStyle[m.direction] || directionStyle.new;
              return (
                <div
                  key={m.title}
                  className="flex items-start gap-2"
                >
                  <span className={`font-mono text-xs mt-0.5 ${style.color}`}>
                    {style.icon}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-zinc-200">
                      {m.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">{m.delta}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signals */}
      {(signals.emerging.length > 0 || signals.fading.length > 0) && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">Signals</h3>

          {signals.emerging.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-green-500 mb-1">
                Emerging
              </p>
              {signals.emerging.map((s) => (
                <p key={s} className="text-xs text-zinc-400 mb-1">
                  {s}
                </p>
              ))}
            </div>
          )}

          {signals.fading.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-red-500 mb-1">
                Fading
              </p>
              {signals.fading.map((s) => (
                <p key={s} className="text-xs text-zinc-400 mb-1">
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
