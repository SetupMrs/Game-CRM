import React from "react";
import { Activity, CheckSquare, Wallet, Truck, Package, Users, PiggyBank } from "lucide-react";
import { ActivityLogEntry, ActivityEntityType } from "../types";
import { formatRelativeTime } from "../utils";

interface ActivityFeedProps {
  entries: ActivityLogEntry[];
  limit?: number;
}

const ENTITY_ICONS: Record<ActivityEntityType, React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  transaction: Wallet,
  supplier: Truck,
  product: Package,
  team: Users,
  budget: PiggyBank
};

const ENTITY_COLORS: Record<ActivityEntityType, string> = {
  task: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  transaction: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  supplier: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  product: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  team: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  budget: "text-teal-400 bg-teal-500/10 border-teal-500/20"
};

export default function ActivityFeed({ entries, limit = 12 }: ActivityFeedProps) {
  const visible = entries.slice(0, limit);

  if (visible.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center justify-center text-center text-gray-500 text-xs space-y-2">
        <Activity className="w-5 h-5 text-gray-600" />
        <p>Активності поки немає. Тут з'являться дії команди.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {visible.map((entry) => {
        const Icon = ENTITY_ICONS[entry.entityType] || Activity;
        const colorClass = ENTITY_COLORS[entry.entityType] || "text-gray-400 bg-white/5 border-white/10";
        return (
          <div key={entry.id} className="flex items-start gap-3">
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${colorClass}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-300 leading-snug">
                <span className="font-bold text-white">{entry.actorName}</span>
                {" "}
                <span className="text-gray-400">{entry.action.toLowerCase()}</span>
                {" "}
                <span className="font-semibold text-gray-200">«{entry.entityTitle}»</span>
                {entry.details && (
                  <span className="text-gray-500"> · {entry.details}</span>
                )}
              </p>
              <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                {formatRelativeTime(entry.timestamp)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
