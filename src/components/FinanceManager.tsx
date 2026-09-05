import React, { useState, useMemo } from "react";
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Trash2, 
  Search, 
  TrendingUp, 
  FileText, 
  AlertCircle, 
  User, 
  Printer,
  Pencil,
  Calendar,
  PiggyBank,
  ChevronDown,
  ChevronUp,
  CheckSquare as CheckSquareIcon,
  Truck
} from "lucide-react";
import { Transaction, TransactionType, BudgetPlan, Task, Supplier } from "../types";
// jsPDF is loaded on demand (dynamic import) below, since it's fairly heavy
// and only needed when the user actually exports a PDF report.
import { formatDate } from "../utils";
import BudgetPlanner from "./BudgetPlanner";
import CurrencyRatesPanel from "./CurrencyRatesPanel";

interface FinanceManagerProps {
  transactions: Transaction[];
  budgets?: BudgetPlan[];
  tasks?: Task[];
  suppliers?: Supplier[];
  baseCurrency?: string;
  currencyRates?: Record<string, number>;
  onUpdateCurrencyRates?: (rates: Record<string, number>) => void;
  onSetBaseCurrency?: (currency: string) => void;
  onAddTransaction: (tx: Omit<Transaction, "id">) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onAddBudget?: (data: Omit<BudgetPlan, "id">) => void;
  onDeleteBudget?: (id: string) => void;
}

export default function FinanceManager({
  transactions = [],
  budgets = [],
  tasks = [],
  suppliers = [],
  baseCurrency = "USD",
  currencyRates = { USD: 1 },
  onUpdateCurrencyRates,
  onSetBaseCurrency,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddBudget,
  onDeleteBudget
}: FinanceManagerProps) {
  const [isBudgetExpanded, setIsBudgetExpanded] = useState(false);
  const [isCurrencySettingsOpen, setIsCurrencySettingsOpen] = useState(false);

  // Converts a transaction's amount into the base currency for totals,
  // charts and reports, using the current exchange rates. Individual list
  // rows still show the transaction's own original currency and amount.
  const toBase = (tx: Transaction): number => {
    const code = (tx.currency || baseCurrency).toUpperCase();
    const rate = currencyRates[code] ?? 1;
    return (Number(tx.amount) || 0) * rate;
  };

  const taskById = useMemo(() => {
    const map: Record<string, Task> = {};
    tasks.forEach(t => { map[t.id] = t; });
    return map;
  }, [tasks]);

  const supplierById = useMemo(() => {
    const map: Record<string, Supplier> = {};
    suppliers.forEach(s => { map[s.id] = s; });
    return map;
  }, [suppliers]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Income" | "Expense">("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [periodFilter, setPeriodFilter] = useState<"All" | "Week" | "Month" | "Quarter" | "Custom">("All");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Edit State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Income categories list
  const [customIncomeCategories, setCustomIncomeCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("crm_custom_income_categories");
      return saved ? JSON.parse(saved) : [
        "Оплата від клієнта",
        "Внесення власних коштів",
        "Повернення коштів",
        "Інші надходження"
      ];
    } catch {
      return [];
    }
  });

  // Expense categories list
  const [customExpenseCategories, setCustomExpenseCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("crm_custom_expense_categories");
      return saved ? JSON.parse(saved) : [
        "Закупівля сировини",
        "Логістика / Доставка",
        "Оренда та Комунальні",
        "Податки та мита",
        "Зарплата",
        "Маркетинг",
        "Інші витрати"
      ];
    } catch {
      return [];
    }
  });

  // Create Transaction Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTx, setNewTx] = useState({
    type: "Income" as TransactionType,
    amount: "",
    currency: baseCurrency,
    category: customIncomeCategories[0] || "Оплата від клієнта",
    description: "",
    date: new Date().toISOString().split("T")[0],
    counterparty: "",
    taskId: "",
    supplierId: ""
  });

  // Report Modal state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"Month" | "Quarter" | "Year" | "Custom">("Month");
  const [reportStartDate, setReportStartDate] = useState(new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split("T")[0]);

  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const defaultIncomeCategories: string[] = [];

  const defaultExpenseCategories: string[] = [];

  const incomeCategories = useMemo(() => [...defaultIncomeCategories, ...customIncomeCategories], [customIncomeCategories]);
  const expenseCategories = useMemo(() => [...defaultExpenseCategories, ...customExpenseCategories], [customExpenseCategories]);

  const handleDeleteCustomCategory = (catToDelete: string) => {
    if (newTx.type === "Income") {
      const updated = customIncomeCategories.filter(cat => cat !== catToDelete);
      setCustomIncomeCategories(updated);
      localStorage.setItem("crm_custom_income_categories", JSON.stringify(updated));
      if (newTx.category === catToDelete) {
        setNewTx(prev => ({ ...prev, category: updated[0] || "" }));
      }
    } else {
      const updated = customExpenseCategories.filter(cat => cat !== catToDelete);
      setCustomExpenseCategories(updated);
      localStorage.setItem("crm_custom_expense_categories", JSON.stringify(updated));
      if (newTx.category === catToDelete) {
        setNewTx(prev => ({ ...prev, category: updated[0] || "" }));
      }
    }
  };

  const handleSaveCustomCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    if (newTx.type === "Income") {
      if (!incomeCategories.includes(trimmed)) {
        const updated = [...customIncomeCategories, trimmed];
        setCustomIncomeCategories(updated);
        localStorage.setItem("crm_custom_income_categories", JSON.stringify(updated));
      }
      setNewTx(prev => ({ ...prev, category: trimmed }));
    } else {
      if (!expenseCategories.includes(trimmed)) {
        const updated = [...customExpenseCategories, trimmed];
        setCustomExpenseCategories(updated);
        localStorage.setItem("crm_custom_expense_categories", JSON.stringify(updated));
      }
      setNewTx(prev => ({ ...prev, category: trimmed }));
    }

    setNewCategoryName("");
    setIsAddingCustomCategory(false);
  };

  // Reset category when transaction type shifts
  const handleTypeChangeInForm = (type: TransactionType) => {
    setNewTx(prev => ({
      ...prev,
      type,
      category: type === "Income" ? (customIncomeCategories[0] || "Оплата від клієнта") : (customExpenseCategories[0] || "Закупівля сировини")
    }));
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(tx => 
        tx.description.toLowerCase().includes(query) || 
        tx.category.toLowerCase().includes(query) ||
        (tx.counterparty && tx.counterparty.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (typeFilter !== "All") {
      result = result.filter(tx => tx.type === typeFilter);
    }

    // Category filter
    if (categoryFilter !== "All") {
      result = result.filter(tx => tx.category === categoryFilter);
    }

    // Period filter
    const now = new Date();
    if (periodFilter === "Week") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      result = result.filter(tx => new Date(tx.date) >= oneWeekAgo);
    } else if (periodFilter === "Month") {
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      result = result.filter(tx => new Date(tx.date) >= oneMonthAgo);
    } else if (periodFilter === "Quarter") {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      result = result.filter(tx => new Date(tx.date) >= threeMonthsAgo);
    } else if (periodFilter === "Custom" && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= start && txDate <= end;
      });
    }

    // Sort by date descending
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchQuery, typeFilter, categoryFilter, periodFilter, customStartDate, customEndDate]);

  // Aggregate metrics
  const stats = useMemo(() => {
    let totalDeposits = 0; // Income
    let totalExpenses = 0;  // Expenses

    transactions.forEach(tx => {
      const amount = toBase(tx);
      if (tx.type === "Income") {
        totalDeposits += amount;
      } else {
        totalExpenses += amount;
      }
    });

    return {
      totalDeposits,
      totalExpenses,
      balance: totalDeposits - totalExpenses
    };
  }, [transactions, currencyRates]);

  // Active filter stats (for reports or context)
  const filteredStats = useMemo(() => {
    let totalDeposits = 0;
    let totalExpenses = 0;

    filteredTransactions.forEach(tx => {
      const amount = toBase(tx);
      if (tx.type === "Income") {
        totalDeposits += amount;
      } else {
        totalExpenses += amount;
      }
    });

    return {
      totalDeposits,
      totalExpenses,
      balance: totalDeposits - totalExpenses
    };
  }, [filteredTransactions, currencyRates]);

  const handleStartEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setNewTx({
      type: tx.type,
      amount: tx.amount.toString(),
      currency: tx.currency || baseCurrency,
      category: tx.category,
      description: tx.description,
      date: tx.date.substring(0, 10),
      counterparty: tx.counterparty || "",
      taskId: tx.taskId || "",
      supplierId: tx.supplierId || ""
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTx(null);
    setNewTx({
      type: "Income",
      amount: "",
      currency: baseCurrency,
      category: customIncomeCategories[0] || "Оплата від клієнта",
      description: "",
      date: new Date().toISOString().split("T")[0],
      counterparty: "",
      taskId: "",
      supplierId: ""
    });
  };

  const handleCreateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newTx.amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    if (editingTx) {
      onUpdateTransaction({
        ...editingTx,
        type: newTx.type,
        amount: amountNum,
        currency: newTx.currency,
        category: newTx.category,
        description: newTx.description || `Транзакція: ${newTx.category}`,
        date: new Date(newTx.date).toISOString(),
        counterparty: newTx.counterparty.trim() || undefined,
        taskId: newTx.taskId || undefined,
        supplierId: newTx.supplierId || undefined
      });
      setEditingTx(null);
    } else {
      onAddTransaction({
        type: newTx.type,
        amount: amountNum,
        currency: newTx.currency,
        category: newTx.category,
        description: newTx.description || `Транзакція: ${newTx.category}`,
        date: new Date(newTx.date).toISOString(),
        counterparty: newTx.counterparty.trim() || undefined,
        taskId: newTx.taskId || undefined,
        supplierId: newTx.supplierId || undefined
      });
    }

    // Reset Form
    setNewTx({
      type: "Income",
      amount: "",
      currency: baseCurrency,
      category: customIncomeCategories[0] || "Оплата від клієнта",
      description: "",
      date: new Date().toISOString().split("T")[0],
      counterparty: "",
      taskId: "",
      supplierId: ""
    });
    setIsFormOpen(false);
  };

  // Get categories available for filtering
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(tx => cats.add(tx.category));
    return Array.from(cats);
  }, [transactions]);

  // Cumulative Chart Data Generation
  const chartData = useMemo(() => {
    const chronTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let currentBalance = 0;
    const dailyPoints: { date: string; balance: number; income: number; expense: number }[] = [];
    const grouped: { [key: string]: { income: number; expense: number } } = {};

    chronTx.forEach(tx => {
      const dateStr = tx.date.substring(0, 10);
      const amount = toBase(tx);
      if (!grouped[dateStr]) {
        grouped[dateStr] = { income: 0, expense: 0 };
      }
      if (tx.type === "Income") {
        grouped[dateStr].income += amount;
      } else {
        grouped[dateStr].expense += amount;
      }
    });

    const dates = Object.keys(grouped).sort();
    
    dates.forEach(date => {
      const dayData = grouped[date];
      currentBalance += (dayData.income - dayData.expense);
      dailyPoints.push({
        date,
        balance: currentBalance,
        income: dayData.income,
        expense: dayData.expense
      });
    });

    const maxPoints = 12;
    if (dailyPoints.length > maxPoints) {
      return dailyPoints.slice(-maxPoints);
    }
    return dailyPoints;
  }, [transactions, currencyRates]);

  // SVG Chart Dimensions & Computations
  const svgChart = useMemo(() => {
    if (chartData.length < 2) return null;

    const width = 500;
    const height = 150;
    const padding = 20;

    const balances = chartData.map(d => d.balance);
    const minBal = Math.min(...balances, 0);
    const maxBal = Math.max(...balances, 10000) * 1.1; // 10% buffer
    const balRange = maxBal - minBal;

    const points = chartData.map((d, index) => {
      const x = padding + (index * (width - 2 * padding)) / (chartData.length - 1);
      const y = height - padding - ((d.balance - minBal) / balRange) * (height - 2 * padding);
      return { x, y, label: formatDate(d.date).substring(0, 5), balance: d.balance };
    });

    const pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return {
      width,
      height,
      points,
      pathD,
      areaD,
      minBal,
      maxBal
    };
  }, [chartData]);

  // PRINT / PDF REPORT PROCESSOR
  const reportTransactions = useMemo(() => {
    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    end.setHours(23, 59, 59, 999);

    return transactions
      .filter(tx => {
        const d = new Date(tx.date);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, reportStartDate, reportEndDate]);

  const reportStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    reportTransactions.forEach(t => {
      if (t.type === "Income") income += toBase(t);
      else expense += toBase(t);
    });
    return { income, expense, balance: income - expense };
  }, [reportTransactions, currencyRates]);

  const triggerBrowserPrint = () => {
    const printContent = document.getElementById("printable-report-area")?.innerHTML;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Фінансовий Звіт CRM/SRM</title>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
              body { font-family: 'Inter', system-ui, sans-serif; background-color: white; color: black; padding: 40px; }
              @media print {
                .no-print { display: none; }
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="max-w-4xl mx-auto">
              ${printContent}
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const downloadJsPdfReport = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("FINANCIAL REPORT (OPERATIONAL LEDGER)", 14, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${reportStartDate} to ${reportEndDate}`, 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 34);
    
    doc.setFontSize(12);
    doc.setFont("Helvetica", "bold");
    doc.text("SUMMARY METRICS", 14, 45);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total Deposits / Income:  ${baseCurrency} ${reportStats.income.toLocaleString()}`, 14, 52);
    doc.text(`Total Operations / Expenses: ${baseCurrency} ${reportStats.expense.toLocaleString()}`, 14, 58);
    doc.text(`Net Period Balance:       ${baseCurrency} ${reportStats.balance.toLocaleString()}`, 14, 64);
    
    doc.setFontSize(12);
    doc.setFont("Helvetica", "bold");
    doc.text("DETAILED TRANSACTION LEDGER", 14, 76);
    
    let y = 84;
    doc.setFontSize(8);
    doc.setFont("Helvetica", "bold");
    doc.text("Date", 14, y);
    doc.text("Type", 40, y);
    doc.text("Category", 65, y);
    doc.text(`Amount (${baseCurrency})`, 115, y);
    doc.text("Counterparty / Note", 145, y);
    
    doc.line(14, y + 2, 195, y + 2);
    
    y += 7;
    doc.setFont("Helvetica", "normal");
    
    reportTransactions.slice(0, 25).forEach((tx) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      const txDate = formatDate(tx.date);
      const txType = tx.type === "Income" ? "INCOME (+)" : "EXPENSE (-)";
      const cleanCat = tx.category.replace(/[^\x00-\x7F]/g, "?");
      const cleanCounterparty = (tx.counterparty || tx.description || "").replace(/[^\x00-\x7F]/g, "?").substring(0, 30);
      
      doc.text(txDate, 14, y);
      doc.text(txType, 40, y);
      doc.text(cleanCat.substring(0, 25), 65, y);
      doc.text(`${tx.amount.toLocaleString()} ${(tx.currency || baseCurrency)}`, 115, y);
      doc.text(cleanCounterparty, 145, y);
      
      y += 6;
    });
    
    if (reportTransactions.length > 25) {
      doc.text(`... and ${reportTransactions.length - 25} other operations. (Download print sheet for full Cyrillic detailed view)`, 14, y + 4);
    }
    
    doc.save(`financial_report_${reportStartDate}_to_${reportEndDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#111112] p-4 sm:p-5 rounded-xl border border-white/5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Wallet className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-lg">Фінанси</h3>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setIsCurrencySettingsOpen(!isCurrencySettingsOpen)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 border border-white/10 hover:border-white/20 bg-white/[0.02] text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            Валюти
            {isCurrencySettingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsBudgetExpanded(!isBudgetExpanded)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 border border-white/10 hover:border-white/20 bg-white/[0.02] text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <PiggyBank className="w-4 h-4" />
            Бюджет
            {isBudgetExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsReportOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 border border-white/10 hover:border-white/20 bg-white/[0.02] text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Звіти
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Нова операція
          </button>
        </div>
      </div>

      {/* Currency rates settings (collapsible) */}
      {isCurrencySettingsOpen && onUpdateCurrencyRates && (
        <CurrencyRatesPanel
          baseCurrency={baseCurrency}
          currencyRates={currencyRates}
          onUpdateCurrencyRates={onUpdateCurrencyRates}
          onSetBaseCurrency={onSetBaseCurrency}
        />
      )}

      {/* Budget planner (collapsible) */}
      {isBudgetExpanded && onAddBudget && onDeleteBudget && (
        <BudgetPlanner
          transactions={transactions}
          budgets={budgets}
          baseCurrency={baseCurrency}
          currencyRates={currencyRates}
          onAddBudget={onAddBudget}
          onDeleteBudget={onDeleteBudget}
        />
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Balance */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Загальний Баланс Каси</p>
              <h2 className="text-2xl font-bold text-white mt-1.5 font-mono">
                {stats.balance.toLocaleString()} <span className="text-sm font-sans font-normal text-gray-400">{baseCurrency}</span>
              </h2>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <span className={stats.balance >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              ● {stats.balance >= 0 ? "Стабільний профіцит" : "Дефіцит коштів"}
            </span>
          </div>
        </div>

        {/* Total Deposits */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Усього Внесено / Депозити</p>
              <h2 className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono">
                +{stats.totalDeposits.toLocaleString()} <span className="text-sm font-sans font-normal text-gray-400">{baseCurrency}</span>
              </h2>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-gray-500">
            Сукупні надходження, передплати від клієнтів та поповнення
          </p>
        </div>

        {/* Total Expenses */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Витрачено на Операції</p>
              <h2 className="text-2xl font-bold text-red-400 mt-1.5 font-mono">
                -{stats.totalExpenses.toLocaleString()} <span className="text-sm font-sans font-normal text-gray-400">{baseCurrency}</span>
              </h2>
            </div>
            <div className="p-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-gray-500">
            Оплата сировини, транспортні витрати, податки та комунальні
          </p>
        </div>
      </div>

      {/* SVG Chart & Financial Trends */}
      {chartData.length >= 2 && svgChart ? (
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Графік Динаміки Загального Балансу ({baseCurrency})
            </h4>
            <span className="text-[10px] font-mono text-gray-500">Останні {chartData.length} операційних днів</span>
          </div>

          <div className="w-full overflow-x-auto pt-2">
            <div className="min-w-[500px] h-[160px] flex justify-center items-center">
              <svg 
                viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} 
                className="w-full h-full text-emerald-500"
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                <line x1="20" y1="130" x2="480" y2="130" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="20" y1="75" x2="480" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3" />
                <line x1="20" y1="20" x2="480" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3" />

                <path d={svgChart.areaD} fill="url(#chartGradient)" />

                <path 
                  d={svgChart.pathD} 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="2" 
                  strokeLinecap="round"
                />

                {svgChart.points.map((p, i) => (
                  <g key={i}>
                    <circle 
                      cx={p.x} 
                      cy={p.y} 
                      r="3.5" 
                      fill="#111112" 
                      stroke="#34d399" 
                      strokeWidth="2" 
                    />
                    <text 
                      x={p.x} 
                      y={p.y - 8} 
                      fill="#a1a1aa" 
                      fontSize="7" 
                      fontWeight="bold" 
                      textAnchor="middle"
                      className="font-mono"
                    >
                      {Math.round(p.balance).toLocaleString()}
                    </text>
                    <text 
                      x={p.x} 
                      y="142" 
                      fill="#71717a" 
                      fontSize="7" 
                      textAnchor="middle"
                      className="font-mono"
                    >
                      {p.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#111112] p-8 rounded-xl border border-white/5 text-center text-gray-500 text-xs">
          Додайте більше банківських операцій для побудови інтерактивного графіку залишку каси.
        </div>
      )}

      {/* Main Ledger Row (Filters + Table) */}
      <div className="space-y-4">
        {/* Filtering & Search panel */}
        <div className="bg-[#111112] p-4 rounded-xl border border-white/5 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Пошук за описом, сумою чи контрагентом..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white"
          >
            <option value="All">Всі операції</option>
            <option value="Income">Тільки Надходження (Внесення)</option>
            <option value="Expense">Тільки Витрати (Списання)</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white"
          >
            <option value="All">Всі категорії</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Period filter */}
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white"
          >
            <option value="All">За весь час</option>
            <option value="Week">За останній тиждень</option>
            <option value="Month">За останній місяць</option>
            <option value="Quarter">За останній квартал</option>
            <option value="Custom">Вказати інтервал дат...</option>
          </select>
        </div>

        {/* Custom Date Inputs if selected */}
        {periodFilter === "Custom" && (
          <div className="bg-[#111112] p-4 rounded-xl border border-white/5 flex gap-4 max-w-md animate-fade-in">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Початкова дата</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden bg-[#161618] text-white font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Кінцева дата</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden bg-[#161618] text-white font-mono"
              />
            </div>
          </div>
        )}

        {/* Ledger Transactions Table */}
        <div className="bg-[#111112] rounded-xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#161618] border-b border-white/5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-5 py-3">Дата</th>
                  <th className="px-5 py-3">Тип</th>
                  <th className="px-5 py-3">Категорія / Тип оплати</th>
                  <th className="px-5 py-3">Банк / Метод оплати</th>
                  <th className="px-5 py-3">Опис операції</th>
                  <th className="px-5 py-3 text-right">Сума ({baseCurrency})</th>
                  <th className="px-5 py-3 text-center">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-gray-500 font-medium">
                      Операцій за обраними фільтрами не знайдено.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(tx => {
                    const isIncome = tx.type === "Income";
                    return (
                      <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-5 py-3.5 font-mono text-[11px] text-gray-400">
                          {formatDate(tx.date)} {tx.date.includes("T") && tx.date.substring(11, 16)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                            isIncome 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}>
                            {isIncome ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                            {isIncome ? "Внесок" : "Витрата"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-white">
                          {tx.category}
                        </td>
                        <td className="px-5 py-3.5 text-gray-200 font-medium">
                          {tx.counterparty ? (
                            <span className="flex items-center gap-1.5 text-gray-300">
                              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                              {tx.counterparty}
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 max-w-xs truncate text-gray-400" title={tx.description}>
                          {tx.description}
                          {(tx.taskId || tx.supplierId) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tx.taskId && taskById[tx.taskId] && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md">
                                  <CheckSquareIcon className="w-2.5 h-2.5" />
                                  {taskById[tx.taskId].title}
                                </span>
                              )}
                              {tx.supplierId && supplierById[tx.supplierId] && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                                  <Truck className="w-2.5 h-2.5" />
                                  {supplierById[tx.supplierId].name}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-mono font-bold text-[13px] ${
                          isIncome ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {isIncome ? "+" : "-"}{tx.amount.toLocaleString()}
                          <span className="text-[10px] font-normal text-gray-500 ml-1">{(tx.currency || baseCurrency).toUpperCase()}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleStartEdit(tx)}
                              className="p-1 text-gray-500 hover:text-emerald-400 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                              title="Редагувати запис"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteTransaction(tx.id)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                              title="Видалити запис"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Active Ledger Summary metrics bar */}
          {filteredTransactions.length > 0 && (
            <div className="bg-[#161618] px-5 py-3.5 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center text-[11px] font-semibold text-gray-400 gap-2">
              <span>Показано операцій: {filteredTransactions.length}</span>
              <div className="flex gap-4 font-mono">
                <span>Надходження: <span className="text-emerald-400 font-bold">+{filteredStats.totalDeposits.toLocaleString()} {baseCurrency}</span></span>
                <span>Витрати: <span className="text-red-400 font-bold">-{filteredStats.totalExpenses.toLocaleString()} {baseCurrency}</span></span>
                <span>Баланс: <span className={`${filteredStats.balance >= 0 ? "text-emerald-400" : "text-red-400"} font-bold`}>{filteredStats.balance.toLocaleString()} {baseCurrency}</span></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE TRANSACTION MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-[#111112] rounded-xl border border-white/5 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[#161618] border-b border-white/5 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm">{editingTx ? "Редагувати Банківську Операцію" : "Додати Банківську Операцію"}</h4>
              <button onClick={handleCloseForm} className="text-gray-400 hover:text-white text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateTransaction} className="p-6 space-y-4">
              {/* Type selector buttons */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Напрямок транзакції *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTypeChangeInForm("Income")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      newTx.type === "Income"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/5"
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Надходження (Депозит)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChangeInForm("Expense")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      newTx.type === "Expense"
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/5"
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    Витрата (Операція)
                  </button>
                </div>
              </div>

              {/* Amount & Currency & Date */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Сума *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={newTx.amount}
                    onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Валюта</label>
                  <select
                    value={newTx.currency}
                    onChange={(e) => setNewTx({ ...newTx, currency: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
                  >
                    {Object.keys(currencyRates).sort((a, b) => a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b)).map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Дата транзакції *</label>
                  <div 
                    onClick={(e) => {
                      const input = (e.currentTarget.querySelector("input") as HTMLInputElement);
                      if (input) { input.focus(); try { input.showPicker?.(); } catch(err) {} }
                    }}
                    className="relative cursor-pointer"
                  >
                    <input
                      type="date"
                      required
                      value={newTx.date}
                      onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                      onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch(err) {} }}
                      onFocus={(e) => { try { e.currentTarget.showPicker?.(); } catch(err) {} }}
                      className="w-full px-3 py-2 pr-9 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white font-mono cursor-pointer"
                    />
                    <Calendar className="w-4 h-4 text-emerald-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Category selector */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Категорія / Тип оплати
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomCategory(!isAddingCustomCategory)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {isAddingCustomCategory ? "✕ Скасувати" : "➕ Своя категорія"}
                  </button>
                </div>

                {isAddingCustomCategory ? (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Назва нової категорії..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomCategory}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                      >
                        Додати
                      </button>
                    </div>

                    {((newTx.type === "Income" ? customIncomeCategories : customExpenseCategories).length > 0) && (
                      <div className="mt-2 border border-white/5 rounded-lg p-2.5 bg-black/40 max-h-36 overflow-y-auto space-y-1">
                        <div className="text-[9px] font-bold text-gray-500 uppercase px-1 pb-1">Ваші власні категорії:</div>
                        {(newTx.type === "Income" ? customIncomeCategories : customExpenseCategories).map(cat => (
                          <div key={cat} className="flex justify-between items-center text-xs text-gray-300 hover:text-white px-2 py-1.5 hover:bg-white/[0.02] rounded-md transition-colors">
                            <span className="truncate pr-2">{cat}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomCategory(cat)}
                              className="p-1 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-md transition-colors cursor-pointer shrink-0"
                              title="Видалити категорію"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <select
                    value={newTx.category}
                    onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white"
                  >
                    {newTx.type === "Income" 
                      ? incomeCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                      : expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                    }
                  </select>
                )}
              </div>

              {/* Bank / Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Банк з якого була оплата</label>
                <input
                  type="text"
                  placeholder="напр. Монобанк, ПриватБанк, Готівка..."
                  value={newTx.counterparty}
                  onChange={(e) => setNewTx({ ...newTx, counterparty: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-medium"
                />
              </div>

              {/* Link to task / supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Пов'язане завдання (опціонально)
                  </label>
                  <select
                    value={newTx.taskId}
                    onChange={(e) => setNewTx({ ...newTx, taskId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
                  >
                    <option value="">Не пов'язано</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Пов'язаний постачальник (опціонально)
                  </label>
                  <select
                    value={newTx.supplierId}
                    onChange={(e) => setNewTx({ ...newTx, supplierId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
                  >
                    <option value="">Не пов'язано</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Призначення платежу / Опис *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="напр. Передплата за договором №23 чи оплата пального..."
                  value={newTx.description}
                  onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {editingTx ? "Оновити операцію" : "Зберегти операцію"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERIOD-BASED PDF REPORT EXPORT MODAL */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-[#111112] border border-white/5 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#161618] border-b border-white/5 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                Генератор Періодичних Звітів
              </h4>
              <button onClick={() => setIsReportOpen(false)} className="text-gray-400 hover:text-white text-lg cursor-pointer">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Filter controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-white/[0.01] border border-white/5 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Обрати період</label>
                  <select
                    value={reportPeriod}
                    onChange={(e) => {
                      const mode = e.target.value as any;
                      setReportPeriod(mode);
                      const now = new Date();
                      if (mode === "Month") {
                        setReportStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
                        setReportEndDate(now.toISOString().split("T")[0]);
                      } else if (mode === "Quarter") {
                        setReportStartDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split("T")[0]);
                        setReportEndDate(now.toISOString().split("T")[0]);
                      } else if (mode === "Year") {
                        setReportStartDate(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
                        setReportEndDate(now.toISOString().split("T")[0]);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-xs border border-white/10 rounded bg-[#161618] text-white"
                  >
                    <option value="Month">Поточний Місяць</option>
                    <option value="Quarter">Останній Квартал (90 днів)</option>
                    <option value="Year">Поточний Рік</option>
                    <option value="Custom">Власний інтервал...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Дата З</label>
                  <input
                    type="date"
                    disabled={reportPeriod !== "Custom"}
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-white/10 rounded bg-[#161618] text-white font-mono disabled:opacity-40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Дата ПО</label>
                  <input
                    type="date"
                    disabled={reportPeriod !== "Custom"}
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-white/10 rounded bg-[#161618] text-white font-mono disabled:opacity-40"
                  />
                </div>
              </div>

              {/* REPORT PREVIEW CARD */}
              <div className="border border-white/10 rounded-xl bg-white text-black p-6 space-y-5 shadow-inner max-h-[350px] overflow-y-auto" id="printable-report-area">
                <div className="border-b-2 border-gray-900 pb-3 flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 uppercase tracking-tight">ЗВІТ ПО БАНКІВСЬКИХ ОПЕРАЦІЯХ</h2>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5 font-semibold">CRM & SRM Локальна Автономна Каса</p>
                  </div>
                  <div className="text-right text-[9px] font-mono text-gray-500">
                    <p>Період: {reportStartDate} — {reportEndDate}</p>
                    <p>Згенеровано: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 border border-gray-200 bg-gray-50 p-3 rounded-lg text-xs">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Надходження (Депозити)</p>
                    <p className="text-sm font-bold text-emerald-600 font-mono mt-0.5">+{reportStats.income.toLocaleString()} {baseCurrency}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Списання (Операції)</p>
                    <p className="text-sm font-bold text-red-600 font-mono mt-0.5">-{reportStats.expense.toLocaleString()} {baseCurrency}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Періодичний Баланс</p>
                    <p className={`text-sm font-bold font-mono mt-0.5 ${reportStats.balance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {reportStats.balance.toLocaleString()} {baseCurrency}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-gray-800 uppercase tracking-wider">Перелік виконаних операцій ({reportTransactions.length})</h5>
                  {reportTransactions.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">У вибраному періоді немає транзакцій.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-[9px]">
                        <thead>
                          <tr className="bg-gray-100 border-b border-gray-200 font-bold text-gray-600">
                            <th className="p-2">Дата</th>
                            <th className="p-2">Тип</th>
                            <th className="p-2">Категорія</th>
                            <th className="p-2">Банк оплати</th>
                            <th className="p-2">Призначення / Опис</th>
                            <th className="p-2 text-right">Сума</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-gray-700">
                          {reportTransactions.map(tx => (
                            <tr key={tx.id}>
                              <td className="p-2 font-mono">{formatDate(tx.date)}</td>
                              <td className={`p-2 font-bold ${tx.type === "Income" ? "text-emerald-600" : "text-red-500"}`}>
                                {tx.type === "Income" ? "Внесок" : "Витрата"}
                              </td>
                              <td className="p-2 font-semibold text-gray-900">{tx.category}</td>
                              <td className="p-2 font-medium text-gray-800">{tx.counterparty || "-"}</td>
                              <td className="p-2 truncate max-w-[150px]">{tx.description}</td>
                              <td className="p-2 text-right font-mono font-bold text-gray-900">{tx.amount.toLocaleString()} {tx.currency || baseCurrency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-200 flex justify-between items-center text-[8px] text-gray-400">
                  <p>Звіт сформовано автоматично. Документ містить вичерпний опис касових операцій за вказаний період.</p>
                  <p className="font-mono">Підпис: _________________</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>Cyrillic-шрифти ідеально рендерить інструмент друку</span>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsReportOpen(false)}
                    className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                  >
                    Закрити
                  </button>
                  <button
                    onClick={downloadJsPdfReport}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Завантажити спрощений PDF
                  </button>
                  <button
                    onClick={triggerBrowserPrint}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 cursor-pointer flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Роздрукувати / Зберегти як PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
