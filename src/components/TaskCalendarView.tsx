import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Task, TASK_STATUS_CONFIGS, AssignableUser } from "../types";
import { getAvatarColor } from "../utils";

interface TaskCalendarViewProps {
  tasks: Task[];
  assignableUsers: AssignableUser[];
  onSelectTask: (task: Task) => void;
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTH_LABELS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function taskDateKey(task: Task): string {
  if (!task.dueDate) return "";
  return task.dueDate.includes("T") ? task.dueDate.split("T")[0] : task.dueDate;
}

export default function TaskCalendarView({ tasks, assignableUsers, onSelectTask }: TaskCalendarViewProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(today));

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const key = taskDateKey(t);
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const memberById = useMemo(() => {
    const map: Record<string, AssignableUser> = {};
    assignableUsers.forEach(m => { map[m.id] = m; });
    return map;
  }, [assignableUsers]);

  const gridDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Monday-first grid
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return days;
  }, [viewDate]);

  const goPrevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toDateKey(today));
  };

  const selectedTasks = tasksByDate[selectedDate] || [];
  const todayKey = toDateKey(today);

  return (
    <div className="bg-[#111112] rounded-xl border border-white/5 p-4 space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-400" />
          {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToday}
            className="px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            Сьогодні
          </button>
          <button
            onClick={goPrevMonth}
            className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={goNextMonth}
            className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="text-[10px] font-bold text-gray-500 uppercase tracking-wider py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {gridDays.map((day) => {
          const key = toDateKey(day);
          const dayTasks = tasksByDate[key] || [];
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isSelected = key === selectedDate;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              className={`aspect-square rounded-lg border p-1 flex flex-col items-center justify-start gap-0.5 transition-all cursor-pointer ${
                isSelected
                  ? "bg-emerald-600/20 border-emerald-500/50"
                  : isToday
                  ? "bg-white/5 border-emerald-500/30"
                  : "bg-[#161618] border-white/5 hover:border-white/15"
              } ${!isCurrentMonth ? "opacity-30" : ""}`}
            >
              <span className={`text-[11px] font-mono ${isToday ? "text-emerald-400 font-bold" : "text-gray-300"}`}>
                {day.getDate()}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-0.5 max-w-full">
                  {dayTasks.slice(0, 3).map(t => (
                    <span
                      key={t.id}
                      className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS_CONFIGS[t.status]?.dotClass || "bg-gray-400"}`}
                    />
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[8px] text-gray-500 font-mono">+{dayTasks.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day tasks */}
      <div className="pt-3 border-t border-white/5 space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {selectedDate} · {selectedTasks.length} {selectedTasks.length === 1 ? "завдання" : "завдань"}
        </p>
        {selectedTasks.length > 0 ? (
          <div className="space-y-1.5">
            {selectedTasks.map(t => {
              const cfg = TASK_STATUS_CONFIGS[t.status];
              const assignee = t.assigneeId ? memberById[t.assigneeId] : null;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTask(t)}
                  className="w-full flex items-center gap-2 bg-[#161618] hover:bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg?.dotClass || "bg-gray-400"}`} />
                  <span className="text-xs text-gray-200 truncate flex-1">{t.title}</span>
                  {assignee && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: getAvatarColor(assignee.id) }}
                      title={assignee.username}
                    >
                      {assignee.username.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${cfg?.badgeClass || ""}`}>
                    {cfg?.label || t.status}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 py-3 text-center">На цю дату завдань немає.</p>
        )}
      </div>
    </div>
  );
}
