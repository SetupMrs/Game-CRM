import React, { useMemo, useState } from "react";
import { PiggyBank, Plus, Trash2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { BudgetPlan, Transaction, TransactionType } from "../types";
import { generateId } from "../utils";

interface BudgetPlannerProps {
  transactions: Transaction[];
  budgets: BudgetPlan[];
  baseCurrency?: string;
  currencyRates?: Record<string, number>;
  onAddBudget: (data: Omit<BudgetPlan, "id">) => void;
  onDeleteBudget: (id: string) => void;
}

const MONTH_LABELS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetPlanner({ transactions, budgets, baseCurrency = "USD", currencyRates = { USD: 1 }, onAddBudget, onDeleteBudget }: BudgetPlannerProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [category, setCategory] = useState("");
  const [type, setType] = useState<TransactionType>("Expense");
  const [plannedAmount, setPlannedAmount] = useState("");

  const [y, m] = month.split("-").map(Number);
  const monthLabel = `${MONTH_LABELS[m - 1]} ${y}`;

  // Всі планові суми задаються у базовій валюті; фактичні суми
  // конвертуються з валюти транзакції за поточним курсом для порівняння.
  const toBase = (t: Transaction): number => {
    const code = (t.currency || baseCurrency).toUpperCase();
    const rate = currencyRates[code] ?? 1;
    return (Number(t.amount) || 0) * rate;
  };

  const monthBudgets = useMemo(
    () => budgets.filter(b => b.month === month),
    [budgets, month]
  );

  const actualByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      const txMonth = (t.date || "").slice(0, 7);
      if (txMonth !== month) return;
      const key = `${t.type}::${t.category}`;
      map[key] = (map[key] || 0) + toBase(t);
    });
    return map;
  }, [transactions, month, currencyRates]);

  const totals = useMemo(() => {
    let plannedIncome = 0, plannedExpense = 0, actualIncome = 0, actualExpense = 0;
    monthBudgets.forEach(b => {
      if (b.type === "Income") plannedIncome += b.plannedAmount;
      else plannedExpense += b.plannedAmount;
    });
    transactions.forEach(t => {
      if ((t.date || "").slice(0, 7) !== month) return;
      if (t.type === "Income") actualIncome += toBase(t);
      else actualExpense += toBase(t);
    });
    return { plannedIncome, plannedExpense, actualIncome, actualExpense };
  }, [monthBudgets, transactions, month, currencyRates]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(plannedAmount);
    if (!category.trim() || isNaN(amount) || amount <= 0) return;
    onAddBudget({ month, category: category.trim(), type, plannedAmount: amount });
    setCategory("");
    setPlannedAmount("");
  };

  return (
    <div className="bg-[#111112] rounded-xl border border-white/5 p-4 space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-emerald-400" />
          Бюджет: {monthLabel}
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMonth(currentMonthKey())}
            className="px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            Цей місяць
          </button>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Totals summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#161618] rounded-lg border border-white/5 p-3 space-y-1">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Доходи
          </p>
          <p className="text-sm font-mono text-white">
            {totals.actualIncome.toLocaleString()} <span className="text-gray-500">/ {totals.plannedIncome.toLocaleString()} {baseCurrency}</span>
          </p>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${totals.plannedIncome > 0 ? Math.min(100, (totals.actualIncome / totals.plannedIncome) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className="bg-[#161618] rounded-lg border border-white/5 p-3 space-y-1">
          <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Витрати
          </p>
          <p className="text-sm font-mono text-white">
            {totals.actualExpense.toLocaleString()} <span className="text-gray-500">/ {totals.plannedExpense.toLocaleString()} {baseCurrency}</span>
          </p>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${totals.actualExpense > totals.plannedExpense && totals.plannedExpense > 0 ? "bg-red-500" : "bg-amber-500"}`}
              style={{ width: `${totals.plannedExpense > 0 ? Math.min(100, (totals.actualExpense / totals.plannedExpense) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Add budget line */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 pt-2 border-t border-white/5">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Категорія</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Напр. Оренда, Зарплата..."
            className="w-full px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Тип</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
          >
            <option value="Income">Дохід</option>
            <option value="Expense">Витрата</option>
          </select>
        </div>
        <div className="w-28">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Сума, {baseCurrency}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={plannedAmount}
            onChange={(e) => setPlannedAmount(e.target.value)}
            placeholder="0"
            className="w-full px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Додати
        </button>
      </form>

      {/* Budget lines list */}
      <div className="space-y-1.5">
        {monthBudgets.length > 0 ? (
          monthBudgets.map(b => {
            const actual = actualByCategory[`${b.type}::${b.category}`] || 0;
            const pct = b.plannedAmount > 0 ? Math.min(100, (actual / b.plannedAmount) * 100) : 0;
            const overBudget = b.type === "Expense" && actual > b.plannedAmount;
            return (
              <div key={b.id} className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                  b.type === "Income"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  {b.type === "Income" ? "Дохід" : "Витрата"}
                </span>
                <span className="text-xs text-gray-200 flex-1 truncate">{b.category}</span>
                <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden hidden sm:block">
                  <div
                    className={`h-full rounded-full ${overBudget ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-gray-400 shrink-0">
                  {actual.toLocaleString()} / {b.plannedAmount.toLocaleString()} {baseCurrency}
                </span>
                <button
                  onClick={() => onDeleteBudget(b.id)}
                  className="p-1 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                  title="Видалити"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-gray-600 py-6 text-center">
            На {monthLabel.toLowerCase()} ще немає запланованих статей бюджету.
          </p>
        )}
      </div>
    </div>
  );
}
