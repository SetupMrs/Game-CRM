import React, { useMemo, useState } from "react";
import { 
  TrendingUp, 
  CheckSquare, 
  AlertCircle, 
  Calendar, 
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ListTodo,
  FileText,
  Clock,
  ArrowRight,
  Truck,
  Package,
  Check,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CalendarRange,
  Printer,
  Download,
  Database,
  CheckCircle,
  Tag,
  Search,
  Users,
  Activity
} from "lucide-react";
import { Task, Transaction, Supplier, AssignableUser, ActivityLogEntry } from "../types";
import { formatDate, getAvatarColor } from "../utils";
import ActivityFeed from "./ActivityFeed";

interface DashboardProps {
  tasks: Task[];
  transactions: Transaction[];
  suppliers?: Supplier[];
  assignableUsers?: AssignableUser[];
  activityLog?: ActivityLogEntry[];
  baseCurrency?: string;
  onAddTask: () => void;
  onGoToTab: (tab: "tasks" | "finance" | "suppliers") => void;
}

export default function Dashboard({
  tasks,
  transactions = [],
  suppliers = [],
  assignableUsers = [],
  activityLog = [],
  baseCurrency = "USD",
  onAddTask,
  onGoToTab
 }: DashboardProps) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  const toggleSupplierExpanded = (id: string) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Report Period States
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });

  const [reportEndDate, setReportEndDate] = useState(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });

  const [isReportExpanded, setIsReportExpanded] = useState(true);
  const [reportActiveTab, setReportActiveTab] = useState<"summary" | "tasks" | "suppliers" | "finance">("summary");

  // Team workload: active + overdue task counts per member, for the widget below.
  const teamWorkload = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return assignableUsers.map(member => {
      const memberTasks = tasks.filter(t => t.assigneeId === member.id);
      const active = memberTasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled");
      const overdue = active.filter(t => t.dueDate < todayStr);
      return { member, activeCount: active.length, overdueCount: overdue.length };
    });
  }, [tasks, assignableUsers]);

  // New states for the custom Executed Work & Tasks widget
  const [executedSearch, setExecutedSearch] = useState("");
  const [executedType, setExecutedType] = useState<"all" | "categories" | "items">("all");
  const [isActiveTasksExpanded, setIsActiveTasksExpanded] = useState(true);
  const [isCompletedTasksExpanded, setIsCompletedTasksExpanded] = useState(false);

  // Date Preset Handlers
  const handleSetPreset = (preset: "today" | "yesterday" | "week" | "month" | "all") => {
    const today = new Date();
    const format = (d: Date) => {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    };

    setReportEndDate(format(today));

    if (preset === "today") {
      setReportStartDate(format(today));
    } else if (preset === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = format(yesterday);
      setReportStartDate(yesterdayStr);
      setReportEndDate(yesterdayStr);
    } else if (preset === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      setReportStartDate(format(weekAgo));
    } else if (preset === "month") {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      setReportStartDate(format(monthAgo));
    } else if (preset === "all") {
      setReportStartDate("2020-01-01");
    }
  };

  // Memoized Report Data for the selected period
  const reportData = useMemo(() => {
    const start = reportStartDate;
    const end = reportEndDate;

    const parseToYYYYMMDD = (dateStr: string): string => {
      if (!dateStr) return "";
      const trimmed = dateStr.trim();
      // If it's already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.substring(0, 10);
      }
      // If it's DD.MM.YYYY
      const dotParts = trimmed.split(".");
      if (dotParts.length >= 3) {
        const day = dotParts[0].padStart(2, '0');
        const month = dotParts[1].padStart(2, '0');
        let year = dotParts[2].substring(0, 4);
        if (year.length === 2) year = "20" + year;
        return `${year}-${month}-${day}`;
      }
      // If it's DD/MM/YYYY
      const slashParts = trimmed.split("/");
      if (slashParts.length >= 3) {
        const day = slashParts[0].padStart(2, '0');
        const month = slashParts[1].padStart(2, '0');
        let year = slashParts[2].substring(0, 4);
        if (year.length === 2) year = "20" + year;
        return `${year}-${month}-${day}`;
      }
      return trimmed;
    };
    
    // 1. Financial transactions within period
    const filteredTx = (transactions || []).filter(tx => {
      const txDateStr = tx.date.substring(0, 10); // YYYY-MM-DD
      return txDateStr >= start && txDateStr <= end;
    });
    
    let incomeSum = 0;
    let expenseSum = 0;
    filteredTx.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === "Income") {
        incomeSum += amount;
      } else {
        expenseSum += amount;
      }
    });
    const netSavings = incomeSum - expenseSum;

    // 2. Completed tasks within period (using dueDate as comparison)
    const completedTasks = tasks.filter(task => {
      if (task.status !== "Completed") return false;
      const taskDate = task.dueDate; // YYYY-MM-DD
      return taskDate >= start && taskDate <= end;
    });

    // 3. Completed supplier products & items within period
    const addedSupplierItems: { supplierName: string; categoryTitle: string; itemTitle: string; code: string; date?: string }[] = [];
    const addedSupplierCategories: { supplierName: string; categoryTitle: string; sku?: string; date?: string }[] = [];

    (suppliers || []).forEach(sup => {
      (sup.products || []).forEach(prod => {
        // If the whole category was added
        if (prod.isAdded) {
          addedSupplierCategories.push({
            supplierName: sup.name,
            categoryTitle: prod.title,
            sku: prod.sku
          });
        }
        
        // Items within the category
        (prod.items || []).forEach(item => {
          if (item.isAdded) {
            const itemDateRaw = item.createdAt || "";
            const itemDateFormatted = parseToYYYYMMDD(itemDateRaw);
            const matchesDate = itemDateFormatted ? (itemDateFormatted >= start && itemDateFormatted <= end) : true;
            
            if (matchesDate) {
              addedSupplierItems.push({
                supplierName: sup.name,
                categoryTitle: prod.title,
                itemTitle: item.title || prod.title,
                code: item.code,
                date: itemDateFormatted || undefined
              });
            }
          }
        });
      });
    });

    return {
      filteredTx,
      incomeSum,
      expenseSum,
      netSavings,
      completedTasks,
      addedSupplierItems,
      addedSupplierCategories
    };
  }, [tasks, transactions, suppliers, reportStartDate, reportEndDate]);
  
  // Financial statistics calculations
  const stats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === "Income") {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
    });

    const balance = totalIncome - totalExpense;

    return {
      balance,
      totalIncome,
      totalExpense,
      transactionsCount: transactions.length
    };
  }, [transactions]);

  // Tasks metrics calculations
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "Completed").length;
    const pending = tasks.filter(t => t.status !== "Completed").length;
    const highPriority = tasks.filter(t => t.status !== "Completed" && t.priority === "High").length;

    // Subtask statistics
    let totalSubtasks = 0;
    let completedSubtasks = 0;
    tasks.forEach(t => {
      if (t.subTasks) {
        totalSubtasks += t.subTasks.length;
        completedSubtasks += t.subTasks.filter(st => st.completed).length;
      }
    });

    const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      highPriority,
      totalSubtasks,
      completedSubtasks,
      completionPercent
    };
  }, [tasks]);

  // Suppliers work progress calculations
  const supplierStats = useMemo(() => {
    let totalProducts = 0;
    let addedProducts = 0;
    let totalItems = 0;
    let addedItems = 0;

    const supplierProgresses = (suppliers || []).map(sup => {
      let supProducts = 0;
      let supAddedProducts = 0;
      let supItems = 0;
      let supAddedItems = 0;

      (sup.products || []).forEach(prod => {
        supProducts++;
        totalProducts++;
        if (prod.isAdded) {
          supAddedProducts++;
          addedProducts++;
        }
        (prod.items || []).forEach(item => {
          supItems++;
          totalItems++;
          if (prod.isAdded || item.isAdded) {
            supAddedItems++;
            addedItems++;
          }
        });
      });

      // Overall items progress or products progress for this supplier
      const totalWorkUnits = supItems > 0 ? supItems : supProducts;
      const completedWorkUnits = supItems > 0 ? supAddedItems : supAddedProducts;
      const progress = totalWorkUnits > 0 ? Math.round((completedWorkUnits / totalWorkUnits) * 100) : 0;

      return {
        id: sup.id,
        name: sup.name,
        totalProducts: supProducts,
        addedProducts: supAddedProducts,
        totalItems: supItems,
        addedItems: supAddedItems,
        progress
      };
    });

    const overallProductsProgress = totalProducts > 0 ? Math.round((addedProducts / totalProducts) * 100) : 0;
    const overallItemsProgress = totalItems > 0 ? Math.round((addedItems / totalItems) * 100) : 0;

    return {
      totalSuppliers: (suppliers || []).length,
      totalProducts,
      addedProducts,
      totalItems,
      addedItems,
      overallProductsProgress,
      overallItemsProgress,
      supplierProgresses
    };
  }, [suppliers]);

  const getTodayString = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const handlePrintPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const startFormatted = new Date(reportStartDate).toLocaleDateString("uk-UA");
    const endFormatted = new Date(reportEndDate).toLocaleDateString("uk-UA");
    const todayStr = new Date().toLocaleDateString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const formatCurrencyLocal = (val: number) => {
      return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(val)} ${baseCurrency}`;
    };

    // Calculate metrics
    const {
      filteredTx,
      incomeSum,
      expenseSum,
      netSavings,
      completedTasks,
      addedSupplierItems,
      addedSupplierCategories
    } = reportData;

    const taskCount = completedTasks.length;
    const itemsCount = addedSupplierItems.length;
    const categoriesCount = addedSupplierCategories.length;

    // Generate HTML rows
    const tasksRows = completedTasks.length === 0 
      ? `<tr><td colspan="5" class="text-center py-4 text-gray-400 italic text-xs">Немає виконаних завдань за цей період</td></tr>`
      : completedTasks.map((t, idx) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
          <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${idx + 1}</td>
          <td class="px-4 py-2.5 text-xs font-semibold text-gray-800">${t.title}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600">${t.description || "-"}</td>
          <td class="px-4 py-2.5 text-xs text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
              t.priority === 'High' ? 'bg-red-100 text-red-800' : t.priority === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }">${t.priority}</span>
          </td>
          <td class="px-4 py-2.5 text-xs text-right text-gray-500 font-mono">${formatDate(t.dueDate)}</td>
        </tr>
      `).join("");

    const supplierRows = addedSupplierItems.length === 0 && addedSupplierCategories.length === 0
      ? `<tr><td colspan="5" class="text-center py-4 text-gray-400 italic text-xs">Немає виконаних категорій чи товарів за цей період</td></tr>`
      : [
          ...addedSupplierCategories.map((c, idx) => `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${idx + 1}</td>
              <td class="px-4 py-2.5 text-xs font-semibold text-gray-800">${c.supplierName}</td>
              <td class="px-4 py-2.5 text-xs text-emerald-700 font-medium">[Виконано Категорію] ${c.categoryTitle}</td>
              <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${c.sku || "-"}</td>
              <td class="px-4 py-2.5 text-xs text-right text-gray-400">-</td>
            </tr>
          `),
          ...addedSupplierItems.map((item, idx) => `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${addedSupplierCategories.length + idx + 1}</td>
              <td class="px-4 py-2.5 text-xs font-semibold text-gray-800">${item.supplierName}</td>
              <td class="px-4 py-2.5 text-xs text-emerald-700 font-medium">[Виконано Товар] ${item.categoryTitle} • ${item.itemTitle}</td>
              <td class="px-4 py-2.5 text-xs text-gray-600 font-mono bg-gray-50 px-1 py-0.5 rounded border border-gray-100">${item.code}</td>
              <td class="px-4 py-2.5 text-xs text-right text-gray-500 font-mono">${formatDate(item.date)}</td>
            </tr>
          `)
        ].join("");

    const financeRows = filteredTx.length === 0
      ? `<tr><td colspan="5" class="text-center py-4 text-gray-400 italic text-xs">Немає фінансових операцій за цей період</td></tr>`
      : filteredTx.map((tx, idx) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
          <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${idx + 1}</td>
          <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${formatDate(tx.date)}</td>
          <td class="px-4 py-2.5 text-xs font-semibold text-gray-800">${tx.category} ${tx.counterparty ? `• ${tx.counterparty}` : ""}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600">${tx.description || "-"}</td>
          <td class="px-4 py-2.5 text-xs font-mono font-bold text-right ${tx.type === 'Income' ? 'text-emerald-600' : 'text-red-600'}">
            ${tx.type === 'Income' ? '+' : '-'}${tx.amount.toLocaleString()} ${tx.currency || baseCurrency}
          </td>
        </tr>
      `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Аналітичний Звіт про Виконану Роботу</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              background-color: #ffffff;
              color: #111827;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .font-mono {
              font-family: 'JetBrains Mono', monospace;
            }
            @media print {
              body {
                background-color: #ffffff;
                color: #000000;
              }
              .no-print {
                display: none;
              }
              .page-break {
                page-break-before: always;
              }
              .avoid-break {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body class="p-8 max-w-4xl mx-auto">
          <!-- Document Header -->
          <div class="border-b-2 border-emerald-600 pb-5 mb-6 flex justify-between items-start">
            <div>
              <div class="text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 mb-1">ОФІЦІЙНИЙ СИСТЕМНИЙ ЗВІТ</div>
              <h1 class="text-2xl font-black text-gray-900 leading-tight">ЗВІТ ВИКОНАНОЇ РОБОТИ ТА ПРОГРЕСУ</h1>
              <p class="text-sm text-gray-500 mt-1 font-medium">Період звітності: <strong class="text-gray-800">${startFormatted}</strong> — <strong class="text-gray-800">${endFormatted}</strong></p>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-400 font-mono">Згенеровано: ${todayStr}</div>
              <div class="text-xs text-gray-500 font-semibold mt-1">Касова Книга & SRM</div>
            </div>
          </div>

          <!-- KPI Metrics Row -->
          <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="border border-gray-200 bg-gray-50/50 p-4 rounded-xl">
              <span class="text-[9px] uppercase font-extrabold tracking-wider text-gray-400">Фінансовий Баланс</span>
              <div class="text-xl font-bold font-mono text-gray-900 mt-1">${formatCurrencyLocal(netSavings)}</div>
              <div class="flex items-center gap-2 mt-1.5 text-[10px]">
                <span class="text-emerald-600 font-bold">+${incomeSum.toLocaleString()}</span>
                <span class="text-gray-300">|</span>
                <span class="text-red-600 font-bold">-${expenseSum.toLocaleString()}</span>
              </div>
            </div>

            <div class="border border-gray-200 bg-gray-50/50 p-4 rounded-xl">
              <span class="text-[9px] uppercase font-extrabold tracking-wider text-gray-400">Виконано Завдань</span>
              <div class="text-xl font-bold font-mono text-emerald-600 mt-1">${taskCount} <span class="text-xs font-normal text-gray-400">справ</span></div>
              <div class="text-[10px] text-gray-500 mt-2">Комплексні справи з чек-листами</div>
            </div>

            <div class="border border-gray-200 bg-gray-50/50 p-4 rounded-xl">
              <span class="text-[9px] uppercase font-extrabold tracking-wider text-gray-400">Виконано Товарів/Категорій</span>
              <div class="text-xl font-bold font-mono text-emerald-600 mt-1">${itemsCount + categoriesCount} <span class="text-xs font-normal text-gray-400">поз.</span></div>
              <div class="text-[10px] text-gray-500 mt-2">Виконано ${categoriesCount} категорій, ${itemsCount} товарів</div>
            </div>
          </div>

          <!-- Section 1: Tasks -->
          <div class="mb-8 avoid-break">
            <h2 class="text-sm uppercase font-extrabold tracking-wider text-emerald-600 mb-3 flex items-center gap-2">
              <span>■</span> 1. ВИКОНАНІ ЗАВДАННЯ ТА СПРАВИ (${taskCount})
            </h2>
            <div class="border border-gray-200 rounded-xl overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase">
                    <th class="px-4 py-2 w-12">№</th>
                    <th class="px-4 py-2">Назва Справи</th>
                    <th class="px-4 py-2">Опис / Коментарі</th>
                    <th class="px-4 py-2 w-24 text-center">Пріоритет</th>
                    <th class="px-4 py-2 w-28 text-right">Термін</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${tasksRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Section 2: Supplier Items -->
          <div class="mb-8 avoid-break">
            <h2 class="text-sm uppercase font-extrabold tracking-wider text-emerald-600 mb-3 flex items-center gap-2">
              <span>■</span> 2. ВИКОНАНІ ТОВАРИ ТА КАТЕГОРІЇ ПОСТАЧАЛЬНИКІВ (${itemsCount + categoriesCount})
            </h2>
            <div class="border border-gray-200 rounded-xl overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase">
                    <th class="px-4 py-2 w-12">№</th>
                    <th class="px-4 py-2 w-36">Постачальник</th>
                    <th class="px-4 py-2">Опис товарної позиції / Категорії</th>
                    <th class="px-4 py-2 w-48">Код товару / SKU</th>
                    <th class="px-4 py-2 w-28 text-right">Дата</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${supplierRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Section 3: Financial Transactions -->
          <div class="mb-8 avoid-break">
            <h2 class="text-sm uppercase font-extrabold tracking-wider text-amber-600 mb-3 flex items-center gap-2">
              <span>■</span> 3. РУХ КОШТІВ ТА КАСОВІ ОПЕРАЦІЇ (${filteredTx.length})
            </h2>
            <div class="border border-gray-200 rounded-xl overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase">
                    <th class="px-4 py-2 w-12">№</th>
                    <th class="px-4 py-2 w-28">Дата</th>
                    <th class="px-4 py-2">Категорія / Контрагент</th>
                    <th class="px-4 py-2">Призначення платежу</th>
                    <th class="px-4 py-2 w-32 text-right">Сума</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${financeRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footer/Sign-off -->
          <div class="mt-16 pt-6 border-t border-gray-200 flex justify-between items-end text-xs text-gray-400 avoid-break">
            <div>
              <p>Система автоматизації Каси та Планування</p>
              <p class="font-mono mt-0.5">Всі операційні дані підтверджено цифровим журналом.</p>
            </div>
            <div class="text-right space-y-4">
              <div class="w-40 border-b border-gray-400 h-8"></div>
              <p class="font-bold text-gray-700">Відповідальна особа (Підпис)</p>
            </div>
          </div>

          <!-- Floating Print Guide for iframe fallback -->
          <div class="no-print mt-8 flex justify-center gap-4">
            <button onclick="window.print()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-6 py-2.5 rounded-lg shadow-md cursor-pointer transition-colors">
              Друк або Зберегти в PDF
            </button>
            <button onclick="window.close()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-lg cursor-pointer transition-colors">
              Закрити вікно
            </button>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Memoized lists of executed products and items for easy display
  const executedSupplierData = useMemo(() => {
    const categories: { supplierName: string; categoryTitle: string; sku?: string; id: string; platform?: string }[] = [];
    const items: { supplierName: string; categoryTitle: string; itemTitle: string; code: string; date?: string; id: string; platform?: string }[] = [];

    (suppliers || []).forEach(sup => {
      (sup.products || []).forEach(prod => {
        if (prod.isAdded) {
          categories.push({
            id: prod.id,
            supplierName: sup.name,
            categoryTitle: prod.title,
            sku: prod.sku,
            platform: prod.platform
          });
        }
        (prod.items || []).forEach(item => {
          if (item.isAdded) {
            items.push({
              id: item.code,
              supplierName: sup.name,
              categoryTitle: prod.title,
              itemTitle: item.title || prod.title,
              code: item.code,
              date: item.createdAt,
              platform: item.platform || prod.platform
            });
          }
        });
      });
    });

    return { categories, items };
  }, [suppliers]);

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(val)} ${baseCurrency}`;
  };

  return (
    <div className="space-y-6">
      {/* Team workload & Activity feed */}
      {(assignableUsers.length > 0 || activityLog.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Team workload */}
          <div className="bg-[#111112] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/10 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Навантаження команди</h3>
              </div>
              <button
                onClick={() => onGoToTab("tasks")}
                className="text-[11px] text-gray-500 hover:text-white underline cursor-pointer"
              >
                Всі завдання
              </button>
            </div>

            {teamWorkload.length > 0 ? (
              <div className="space-y-2.5">
                {teamWorkload.map(({ member, activeCount, overdueCount }) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: getAvatarColor(member.id) }}
                    >
                      {member.username.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-300 flex-1 truncate">{member.username}</span>
                    <span className="text-[11px] font-mono text-gray-400">{activeCount} активних</span>
                    {overdueCount > 0 && (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md">
                        {overdueCount} протерм.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-gray-500 text-xs space-y-2">
                <p>Команду ще не додано.</p>
                <button
                  onClick={() => onGoToTab("tasks")}
                  className="text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  Перейти в розділ «Завдання»
                </button>
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="bg-[#111112] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/10 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Стрічка активності</h3>
            </div>
            <ActivityFeed entries={activityLog} limit={8} />
          </div>
        </div>
      )}

      {/* Visual Report Section */}
      <div className="bg-[#111112] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/10 shrink-0">
              <CalendarRange className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">
              Звіт за період
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrintPDF}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/10 focus:outline-hidden"
              title="Експортувати в PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Експорт PDF</span>
            </button>
            <button
              onClick={() => setIsReportExpanded(!isReportExpanded)}
              className="bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs flex items-center gap-1 focus:outline-hidden"
            >
              {isReportExpanded ? "Згорнути" : "Розгорнути"}
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isReportExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {isReportExpanded && (
          <div className="space-y-5 animate-fade-in">
            {/* Period selector controls */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-gray-400 font-semibold">Оберіть період:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="bg-[#161618] border border-white/10 rounded-lg text-white text-xs px-3 py-1.5 focus:outline-hidden focus:border-emerald-500 font-medium font-mono"
                  />
                  <span className="text-gray-600 text-xs">—</span>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="bg-[#161618] border border-white/10 rounded-lg text-white text-xs px-3 py-1.5 focus:outline-hidden focus:border-emerald-500 font-medium font-mono"
                  />
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => handleSetPreset("today")}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                    reportStartDate === getTodayString() && reportEndDate === getTodayString()
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Сьогодні
                </button>
                <button
                  onClick={() => handleSetPreset("yesterday")}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold cursor-pointer transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  Вчора
                </button>
                <button
                  onClick={() => handleSetPreset("week")}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold cursor-pointer transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  Тиждень
                </button>
                <button
                  onClick={() => handleSetPreset("month")}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold cursor-pointer transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  Місяць
                </button>
                <button
                  onClick={() => handleSetPreset("all")}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                    reportStartDate === "2020-01-01"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  За весь час
                </button>
              </div>
            </div>

            {/* Visual KPI Mini Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Financial Balance Mini Box */}
              <div className="bg-[#161618] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-gray-500 tracking-wider">Касовий Баланс за період</span>
                  <Wallet className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h4 className={`text-lg sm:text-xl font-bold font-mono ${reportData.netSavings >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {reportData.netSavings >= 0 ? "+" : ""}{formatCurrency(reportData.netSavings)}
                  </h4>
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-500">
                    <span className="text-emerald-500">+{formatCurrency(reportData.incomeSum)}</span>
                    <span className="text-gray-700">|</span>
                    <span className="text-red-400">-{formatCurrency(reportData.expenseSum)}</span>
                  </div>
                </div>
              </div>

              {/* Tasks Progress Box */}
              <div className="bg-[#161618] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-gray-500 tracking-wider">Виконані завдання за період</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-lg sm:text-xl font-bold font-mono text-white">
                    {reportData.completedTasks.length} <span className="text-xs font-sans text-gray-500">закритих справ</span>
                  </h4>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all" 
                      style={{ width: `${taskStats.total > 0 ? Math.min(100, Math.round((reportData.completedTasks.length / taskStats.total) * 100)) : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-[9px] text-gray-500 mt-1 font-mono text-right">
                    Частка від загальних: {taskStats.total > 0 ? Math.round((reportData.completedTasks.length / taskStats.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Supplier Progress Box */}
              <div className="bg-[#161618] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-gray-500 tracking-wider">Виконано товарів/категорій за період</span>
                  <Database className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-lg sm:text-xl font-bold font-mono text-white">
                    {reportData.addedSupplierItems.length + reportData.addedSupplierCategories.length} <span className="text-xs font-sans text-gray-500">виконано</span>
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2">
                    <span>Категорій: {reportData.addedSupplierCategories.length}</span>
                    <span>Товарів: {reportData.addedSupplierItems.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabbed details listing */}
            <div className="border border-white/5 bg-[#161618]/50 rounded-xl overflow-hidden">
              <div className="flex border-b border-white/5 bg-[#161618] p-1 gap-1 overflow-x-auto whitespace-nowrap">
                <button
                  onClick={() => setReportActiveTab("summary")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    reportActiveTab === "summary"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/10"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Загальний Огляд
                </button>
                <button
                  onClick={() => setReportActiveTab("tasks")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    reportActiveTab === "tasks"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/10"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Виконані Справи ({reportData.completedTasks.length})
                </button>
                <button
                  onClick={() => setReportActiveTab("suppliers")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    reportActiveTab === "suppliers"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/10"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Виконані Товари & Категорії ({reportData.addedSupplierItems.length + reportData.addedSupplierCategories.length})
                </button>
                <button
                  onClick={() => setReportActiveTab("finance")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    reportActiveTab === "finance"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/10"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Фінансові рухи ({reportData.filteredTx.length})
                </button>
              </div>

              <div className="p-4 min-h-[160px] max-h-80 overflow-y-auto">
                {reportActiveTab === "summary" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <span className="font-bold text-emerald-400 uppercase tracking-widest text-[10px] block">Ключові Досягнення за період</span>
                        <ul className="space-y-2 text-gray-300">
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>Успішно закрито <strong>{reportData.completedTasks.length}</strong> складних робочих завдань.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>Виконано та здано <strong>{reportData.addedSupplierItems.length}</strong> товарів та <strong>{reportData.addedSupplierCategories.length}</strong> категорій постачальників.</span>
                          </li>
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <span className="font-bold text-amber-400 uppercase tracking-widest text-[10px] block">Касовий Обіг</span>
                        <div className="space-y-2 bg-black/20 p-3 rounded-lg border border-white/5">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Всього надходжень:</span>
                            <span className="font-bold font-mono text-emerald-400">+{formatCurrency(reportData.incomeSum)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Всього витрат:</span>
                            <span className="font-bold font-mono text-red-400">-{formatCurrency(reportData.expenseSum)}</span>
                          </div>
                          <div className="border-t border-white/5 pt-1.5 flex justify-between font-semibold">
                            <span className="text-white">Чистий Фінансовий Баланс:</span>
                            <span className={`font-mono ${reportData.netSavings >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {reportData.netSavings >= 0 ? "+" : ""}{formatCurrency(reportData.netSavings)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {reportActiveTab === "tasks" && (
                  <div className="space-y-2">
                    {reportData.completedTasks.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-xs italic">
                        За вказаний період немає виконаних завдань.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reportData.completedTasks.map((t, idx) => (
                          <div key={t.id} className="p-2.5 bg-black/20 border border-white/5 rounded-lg flex justify-between items-center gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-gray-600">{idx + 1}.</span>
                                <span className="font-bold text-white text-xs sm:text-sm truncate">{t.title}</span>
                                <span className={`text-[8px] font-black uppercase px-1 py-0.2 rounded-sm border ${
                                  t.priority === "High" ? "bg-red-500/10 text-red-400 border-red-500/20" : t.priority === "Medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                }`}>
                                  {t.priority}
                                </span>
                              </div>
                              {t.description && <p className="text-[10px] text-gray-400 mt-0.5 truncate pl-4">{t.description}</p>}
                            </div>
                            <span className="text-[10px] font-mono text-gray-500 shrink-0">Завершено до: {t.dueDate}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {reportActiveTab === "suppliers" && (
                  <div className="space-y-2">
                    {reportData.addedSupplierItems.length === 0 && reportData.addedSupplierCategories.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-xs italic">
                        За вказаний період немає виконаних категорій чи товарів.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reportData.addedSupplierCategories.map((c, idx) => (
                          <div key={idx} className="p-2.5 bg-emerald-500/[0.02] border border-emerald-500/10 rounded-lg flex justify-between items-center gap-3">
                            <div>
                              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider block leading-none mb-1">Виконано Категорію</span>
                              <span className="font-bold text-white text-xs">{c.categoryTitle}</span>
                              <span className="text-[10px] text-gray-500 ml-2 font-mono">Контрагент: {c.supplierName}</span>
                            </div>
                            {c.sku && <span className="text-[10px] font-mono bg-black/40 border border-white/5 text-gray-400 px-1.5 py-0.5 rounded-sm">SKU: {c.sku}</span>}
                          </div>
                        ))}
                        {reportData.addedSupplierItems.map((item, idx) => (
                          <div key={idx} className="p-2.5 bg-emerald-500/[0.02] border border-emerald-500/10 rounded-lg flex justify-between items-center gap-3">
                            <div className="min-w-0">
                              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider block leading-none mb-1">Виконано Товар</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs truncate">{item.itemTitle}</span>
                                <span className="text-[9.5px] font-mono text-gray-500">({item.categoryTitle})</span>
                              </div>
                              <span className="text-[10.5px] text-gray-400 font-mono mt-0.5 font-bold select-all bg-black/30 px-1.5 py-0.5 rounded-md border border-white/5 inline-block">{item.code}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] text-gray-500 font-mono block">Постачальник: {item.supplierName}</span>
                              {item.date && <span className="text-[9px] font-mono text-gray-600">Виконано: {item.date}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {reportActiveTab === "finance" && (
                  <div className="space-y-2">
                    {reportData.filteredTx.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-xs italic">
                        За вказаний період немає касових транзакцій.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reportData.filteredTx.map((tx) => {
                          const isIncome = tx.type === "Income";
                          return (
                            <div key={tx.id} className="p-2.5 bg-black/20 border border-white/5 rounded-lg flex justify-between items-center gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isIncome ? "bg-emerald-500" : "bg-red-500"}`}></span>
                                  <span className="font-bold text-white text-xs sm:text-sm truncate">{tx.category}</span>
                                  {tx.counterparty && <span className="text-[10px] text-gray-500">({tx.counterparty})</span>}
                                </div>
                                <span className="text-[10px] text-gray-500 font-mono block pl-3.5 mt-0.5">{formatDate(tx.date)} {tx.description ? `• ${tx.description}` : ""}</span>
                              </div>
                              <span className={`font-mono font-bold text-xs sm:text-sm ${isIncome ? "text-emerald-400" : "text-red-400"}`}>
                                {isIncome ? "+" : "-"}{tx.amount.toLocaleString()} {tx.currency || baseCurrency}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance Card */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Баланс Каси</p>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 font-mono text-white">
              {formatCurrency(stats.balance)}
            </h3>
            <div className="text-[10px] text-gray-500 mt-1">Доступний залишок коштів</div>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-lg text-emerald-400 border border-emerald-500/20 flex-shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Total Income */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Депозити / Внески</p>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 font-mono text-emerald-400">
              +{formatCurrency(stats.totalIncome)}
            </h3>
            <div className="text-[10px] text-gray-500 mt-1">Надходження та передплати</div>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-lg text-emerald-400 border border-emerald-500/20 flex-shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* Operational Expenses */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Витрати / Списання</p>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 font-mono text-red-400">
              -{formatCurrency(stats.totalExpense)}
            </h3>
            <div className="text-[10px] text-gray-500 mt-1">Закупівлі та накладні операції</div>
          </div>
          <div className="bg-red-500/10 p-3 rounded-lg text-red-400 border border-red-500/20 flex-shrink-0">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        {/* Tasks Tracker */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Активні Завдання</p>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 font-mono text-white">
              {taskStats.pending} <span className="text-xs font-sans text-gray-500">з {taskStats.total}</span>
            </h3>
            <div className="text-[10px] mt-1">
              {taskStats.highPriority > 0 ? (
                <span className="text-red-400 font-semibold flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  {taskStats.highPriority} термінових справ
                </span>
              ) : (
                <span className="text-gray-500">Усі справи в роботі</span>
              )}
            </div>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-lg text-emerald-400 border border-emerald-500/20 flex-shrink-0">
            <CheckSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Complex Tasks Checklist Tracker */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 flex flex-col h-[450px]">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Завдання з підпунктами</h4>
            </div>
            <button 
              onClick={onAddTask}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold hover:underline"
            >
              + Нова справа
            </button>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
            {tasks.filter(t => t.status !== "Completed").length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <CheckSquare className="w-10 h-10 mb-2 text-gray-600" />
                <p className="text-xs">Всі завдання виконано! Створіть нову складну справу з чек-листом.</p>
              </div>
            ) : (
              tasks
                .filter(t => t.status !== "Completed")
                .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                .map(task => {
                  const subCount = task.subTasks?.length || 0;
                  const subCompleted = task.subTasks?.filter(st => st.completed).length || 0;
                  const isOverdue = new Date(task.dueDate).getTime() < new Date().setHours(0,0,0,0);
                  const progress = subCount > 0 ? Math.round((subCompleted / subCount) * 100) : 0;

                  return (
                    <div 
                      key={task.id} 
                      onClick={() => onGoToTab("tasks")}
                      className={`p-3.5 rounded-lg border text-sm space-y-2 cursor-pointer transition-all hover:bg-white/[0.02] ${
                        task.priority === "High" ? "border-red-500/10 bg-red-500/[0.01]" : "border-white/5 bg-white/[0.01]"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            task.priority === "High" ? "bg-red-500" : task.priority === "Medium" ? "bg-amber-500" : "bg-emerald-400"
                          }`}></span>
                          <span className="font-semibold text-white truncate leading-tight">{task.title}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
                          isOverdue ? "bg-red-500/10 text-red-400 font-bold" : "bg-white/5 text-gray-400"
                        }`}>
                          До {task.dueDate}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-gray-500 line-clamp-1">{task.description}</p>
                      )}

                      {/* Subtask micro indicator */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium">
                          <span>Виконано підпунктів: {subCompleted}/{subCount}</span>
                          <span className="font-mono">{progress}%</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Right Column: Recent Financial Transactions Feed */}
        <div className="bg-[#111112] p-5 rounded-xl border border-white/5 flex flex-col h-[450px]">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Останні фінансові операції</h4>
            </div>
            <button 
              onClick={() => onGoToTab("finance")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline"
            >
              До каси
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <Wallet className="w-10 h-10 mb-2 text-gray-600" />
                <p className="text-xs">Каса порожня. Зафіксуйте першу банківську операцію або депозит.</p>
              </div>
            ) : (
              [...transactions]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 5)
                .map(tx => {
                  const isIncome = tx.type === "Income";
                  return (
                    <div 
                      key={tx.id}
                      onClick={() => onGoToTab("finance")}
                      className="p-3 bg-white/[0.01] border border-white/5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${
                          isIncome ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-xs sm:text-sm truncate leading-tight">{tx.category}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                            {formatDate(tx.date)} {tx.counterparty ? `• ${tx.counterparty}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className={`text-right font-mono font-bold text-xs sm:text-sm ${
                        isIncome ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {isIncome ? "+" : "-"}{tx.amount.toLocaleString()} {tx.currency || baseCurrency}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* Custom Executed Work and Tasks Tracker Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#111112] p-6 rounded-xl border border-white/5">
        {/* Left column: Executed Goods and Categories */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              <h4 className="text-sm font-semibold text-white">Виконані позиції</h4>
            </div>
            
            <button
              onClick={() => onGoToTab("suppliers")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline cursor-pointer shrink-0 self-start sm:self-center"
            >
              Постачальники
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.01] border border-white/5 p-3 rounded-lg flex items-center gap-2.5">
              <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400 border border-emerald-500/10 shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[9px] text-gray-500 uppercase font-mono tracking-wider">Категорій додано</div>
                <div className="text-base font-bold text-white font-mono">{executedSupplierData.categories.length}</div>
              </div>
            </div>

            <div className="bg-white/[0.01] border border-white/5 p-3 rounded-lg flex items-center gap-2.5">
              <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400 border border-emerald-500/10 shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[9px] text-gray-500 uppercase font-mono tracking-wider">Товарів розібрано</div>
                <div className="text-base font-bold text-white font-mono">{executedSupplierData.items.length}</div>
              </div>
            </div>
          </div>

          {/* Filters & Search Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Пошук виконаних позицій..."
                value={executedSearch}
                onChange={(e) => setExecutedSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs border border-white/10 rounded-md focus:outline-hidden focus:border-emerald-500 bg-black/40 text-white font-medium"
              />
            </div>

            <div className="flex gap-1">
              {(["all", "categories", "items"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setExecutedType(type)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                    executedType === type
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {type === "all" ? "Всі" : type === "categories" ? "Категорії" : "Товари"}
                </button>
              ))}
            </div>
          </div>

          {/* Executed list */}
          <div className="max-h-80 overflow-y-auto space-y-2 border border-white/5 rounded-xl p-3 bg-black/20 min-h-[180px]">
            {(() => {
              // Combine and filter
              const combined: Array<
                | { type: "category"; title: string; subtitle: string; codeOrSku?: string; supplier: string; date?: string; id: string; platform?: string }
                | { type: "item"; title: string; subtitle: string; codeOrSku: string; supplier: string; date?: string; id: string; platform?: string }
              > = [];

              if (executedType === "all" || executedType === "categories") {
                executedSupplierData.categories.forEach(c => {
                  combined.push({
                    type: "category",
                    id: `cat-${c.id}`,
                    title: c.categoryTitle,
                    subtitle: "Категорія",
                    codeOrSku: c.sku,
                    supplier: c.supplierName,
                    platform: c.platform
                  });
                });
              }

              if (executedType === "all" || executedType === "items") {
                executedSupplierData.items.forEach(item => {
                  combined.push({
                    type: "item",
                    id: `item-${item.code}`,
                    title: item.itemTitle,
                    subtitle: item.categoryTitle,
                    codeOrSku: item.code,
                    supplier: item.supplierName,
                    date: item.date,
                    platform: item.platform
                  });
                });
              }

              const filtered = combined.filter(item => {
                const query = executedSearch.toLowerCase().trim();
                if (!query) return true;
                return (
                  item.title.toLowerCase().includes(query) ||
                  item.subtitle.toLowerCase().includes(query) ||
                  (item.codeOrSku && item.codeOrSku.toLowerCase().includes(query)) ||
                  item.supplier.toLowerCase().includes(query)
                );
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-10 text-gray-500 text-xs italic">
                    Не знайдено виконаних позицій за цим запитом.
                  </div>
                );
              }

              return filtered.map(item => (
                <div 
                  key={item.id} 
                  className={`p-2.5 rounded-lg border flex justify-between items-center gap-3 transition-all ${
                    item.type === "category" 
                      ? "bg-[#161618]/60 border-emerald-500/10 hover:border-emerald-500/20" 
                      : "bg-[#161618]/30 border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[8px] font-bold uppercase px-1 rounded-sm ${
                        item.type === "category" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-gray-400 border border-white/5"
                      }`}>
                        {item.type === "category" ? "Категорія" : "Товар"}
                      </span>
                      <span className="font-semibold text-white text-xs sm:text-sm truncate leading-tight">{item.title}</span>
                      {item.platform && item.platform.split(',').map(plat => (
                        <span key={plat.trim()} className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-xs font-mono">
                          {plat.trim()}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 mt-1 font-mono">
                      <span>Постачальник: <strong className="text-gray-400 font-sans">{item.supplier}</strong></span>
                      {item.type === "item" && <span>• {item.subtitle}</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {item.codeOrSku && (
                      <span className="text-[10px] font-mono bg-black/40 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded font-bold select-all">
                        {item.codeOrSku}
                      </span>
                    )}
                    {item.date && (
                      <span className="block text-[9px] text-gray-600 mt-1 font-mono">
                        {formatDate(item.date)}
                      </span>
                    )}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Right column: Tasks & Active matters tracker */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Кількість завдань та прогрес</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Відстеження виконання ваших справ та чек-листів</p>
              </div>
            </div>

            <button
              onClick={() => onGoToTab("tasks")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline cursor-pointer shrink-0 self-start sm:self-center"
            >
              Всі завдання
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mini Task Stats card */}
          <div className="grid grid-cols-2 gap-3 bg-white/[0.01] border border-white/5 p-3 rounded-lg">
            <div className="text-center p-2 rounded-lg bg-black/20">
              <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Активних справ</span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {tasks.filter(t => t.status !== "Completed").length}
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-black/20">
              <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Виконано справ</span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {tasks.filter(t => t.status === "Completed").length}
              </div>
            </div>
          </div>

          {/* Active Tasks list */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                Поточні справи в роботі ({tasks.filter(t => t.status !== "Completed").length})
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto bg-black/10 p-2 rounded-lg border border-white/5">
              {(() => {
                const active = tasks.filter(t => t.status !== "Completed");
                if (active.length === 0) {
                  return (
                    <div className="text-center py-6 text-gray-500 text-xs italic">
                      Усі завдання виконані! Повний спокій.
                    </div>
                  );
                }
                return active.map(t => {
                  const subTasksCount = t.subTasks?.length || 0;
                  const completedSubTasks = t.subTasks?.filter(st => st.completed).length || 0;
                  return (
                    <div key={t.id} className="p-2 bg-[#161618] border border-white/5 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white text-xs truncate">{t.title}</span>
                        <span className={`text-[8px] font-bold uppercase px-1 py-0.2 rounded border ${
                          t.priority === "High" ? "bg-red-500/10 text-red-400 border-red-500/20" : t.priority === "Medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                        }`}>
                          {t.priority}
                        </span>
                      </div>
                      {subTasksCount > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/5 h-1 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${(completedSubTasks / subTasksCount) * 100}%` }}></div>
                          </div>
                          <span className="text-[9px] font-mono text-gray-500 shrink-0">{completedSubTasks}/{subTasksCount}</span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* COMPLETED TASKS DROPDOWN - PREVENT COLUMN STRETCHING TO BOTTOM */}
          <div className="border border-white/5 rounded-lg overflow-hidden bg-black/20">
            <button
              onClick={() => setIsCompletedTasksExpanded(!isCompletedTasksExpanded)}
              className="w-full px-3 py-2.5 bg-[#161618] flex items-center justify-between text-xs text-gray-400 hover:text-white transition-all cursor-pointer font-semibold"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Завершені завдання ({tasks.filter(t => t.status === "Completed").length})</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isCompletedTasksExpanded ? "rotate-180" : ""}`} />
            </button>

            {isCompletedTasksExpanded && (
              <div className="p-2.5 space-y-2 border-t border-white/5 max-h-44 overflow-y-auto bg-[#111112]/40">
                {(() => {
                  const completed = tasks.filter(t => t.status === "Completed");
                  if (completed.length === 0) {
                    return (
                      <div className="text-center py-4 text-gray-500 text-xs italic">
                        Немає завершених завдань.
                      </div>
                    );
                  }
                  return completed.map(t => (
                    <div key={t.id} className="p-2 bg-emerald-500/[0.01] border border-emerald-500/5 rounded-md flex items-center justify-between gap-2">
                      <span className="text-gray-300 text-xs truncate line-through decoration-gray-600 font-medium">{t.title}</span>
                      <span className="text-[9px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1 rounded">Виконано</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
