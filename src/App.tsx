import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  CheckSquare, 
  LayoutDashboard, 
  Cpu, 
  RefreshCw, 
  Database,
  AlertCircle,
  Wallet,
  Truck,
  Package,
  Laptop,
  CheckCircle,
  LogOut,
  Trash2,
  ShieldCheck,
  Bell,
  TrendingUp,
  Search
} from "lucide-react";
import { Task, Transaction, DatabaseState, Supplier, ProductCard, CategoryItem, ActivityLogEntry, ActivityEntityType, BudgetPlan, TaskTemplate, TaskStatus, RecurrenceFrequency, TASK_STATUS_CONFIGS, PriceHistoryEntry, DEFAULT_CURRENCY_RATES, DEFAULT_BASE_CURRENCY } from "./types";
import { generateId, formatDate } from "./utils";
import { apiFetch, fetchCurrentUser, logout, listBasicUsers, AppUser, BasicUser, LetsKeysVariation, AUTH_REQUIRED_EVENT } from "./apiClient";
import LoginGate from "./components/LoginGate";
import UsersManager from "./components/UsersManager";
import TrashBin from "./components/TrashBin";

// Each tab is its own chunk, loaded only when the user opens it. These four
// components alone are ~7000 lines combined and were previously bundled into
// the initial page load even though only one tab is ever visible at a time.
const Dashboard = lazy(() => import("./components/Dashboard"));
const TaskManager = lazy(() => import("./components/TaskManager"));
const FinanceManager = lazy(() => import("./components/FinanceManager"));
const SupplierManager = lazy(() => import("./components/SupplierManager"));

const LOCAL_CACHE_KEY = "game_crm_srm_db_cache";
const NOTIFICATIONS_ENABLED_KEY = "game_crm_notifications_enabled";
const LAST_NOTIFIED_DATE_KEY = "game_crm_last_notified_date";
const SEEN_PRICE_ALERTS_KEY = "game_crm_seen_price_alerts";
const LAST_PRICE_NOTIFIED_DATE_KEY = "game_crm_last_price_notified_date";
const MAX_ACTIVITY_LOG_ENTRIES = 300;
const TRASH_RETENTION_DAYS = 30;

function TabLoadingFallback() {
  return (
    <div className="bg-[#111112] rounded-xl border border-white/5 py-24 flex flex-col items-center justify-center space-y-4">
      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm text-gray-500 font-mono">Завантаження модуля...</p>
    </div>
  );
}

const EMPTY_DB: DatabaseState = {
  tasks: [],
  transactions: [],
  suppliers: [],
  activityLog: [],
  budgets: [],
  taskTemplates: [],
  baseCurrency: DEFAULT_BASE_CURRENCY,
  currencyRates: { ...DEFAULT_CURRENCY_RATES }
};

function normalizeDb(data: any): DatabaseState {
  const baseCurrency = (typeof data?.baseCurrency === "string" && data.baseCurrency.trim())
    ? data.baseCurrency.trim().toUpperCase()
    : DEFAULT_BASE_CURRENCY;
  return {
    tasks: data?.tasks || [],
    transactions: data?.transactions || [],
    suppliers: data?.suppliers || [],
    activityLog: data?.activityLog || [],
    budgets: data?.budgets || [],
    taskTemplates: data?.taskTemplates || [],
    baseCurrency,
    currencyRates: (data?.currencyRates && typeof data.currencyRates === "object")
      ? { ...DEFAULT_CURRENCY_RATES, ...data.currencyRates, [baseCurrency]: 1 }
      : { ...DEFAULT_CURRENCY_RATES, [baseCurrency]: 1 }
  };
}

// --- Trash / soft delete helpers ---------------------------------------

function isExpired(deletedAt: string | undefined): boolean {
  if (!deletedAt) return false;
  const deletedTime = new Date(deletedAt).getTime();
  if (isNaN(deletedTime)) return false;
  const ageDays = (Date.now() - deletedTime) / (1000 * 60 * 60 * 24);
  return ageDays > TRASH_RETENTION_DAYS;
}

// Permanently removes anything that's been sitting in the trash for more
// than TRASH_RETENTION_DAYS. Called once after each successful load.
function purgeExpiredTrash(dbState: DatabaseState): { db: DatabaseState; purgedCount: number } {
  let purgedCount = 0;

  const tasks = dbState.tasks.filter(t => {
    const expired = isExpired(t.deletedAt);
    if (expired) purgedCount++;
    return !expired;
  });

  const transactions = dbState.transactions.filter(tx => {
    const expired = isExpired(tx.deletedAt);
    if (expired) purgedCount++;
    return !expired;
  });

  const suppliers = dbState.suppliers.filter(s => {
    const expired = isExpired(s.deletedAt);
    if (expired) purgedCount++;
    return !expired;
  }).map(s => {
    const products = (s.products || []).filter(p => {
      const expired = isExpired(p.deletedAt);
      if (expired) purgedCount++;
      return !expired;
    });
    return products.length !== (s.products || []).length ? { ...s, products } : s;
  });

  if (purgedCount === 0) return { db: dbState, purgedCount: 0 };
  return { db: { ...dbState, tasks, transactions, suppliers }, purgedCount };
}

// Recurring tasks: computes the next due date for a given frequency.
function getNextDueDate(dueDate: string, frequency: RecurrenceFrequency): string {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return dueDate;
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

// If a task just transitioned into "Completed" and has a recurrence set,
// appends a fresh copy of it (Pending, next due date, subtasks reset) to the
// task list. Returns the list unchanged otherwise.
function withRecurrenceSpawn(tasksList: Task[], prevStatus: TaskStatus | undefined, updatedTask: Task): Task[] {
  if (prevStatus === "Completed" || updatedTask.status !== "Completed") return tasksList;
  if (!updatedTask.recurrence || updatedTask.recurrence === "none") return tasksList;

  const newTask: Task = {
    id: generateId("task"),
    title: updatedTask.title,
    dueDate: getNextDueDate(updatedTask.dueDate, updatedTask.recurrence),
    status: "Pending",
    priority: updatedTask.priority,
    description: updatedTask.description,
    counterparty: updatedTask.counterparty,
    tags: updatedTask.tags,
    assigneeId: updatedTask.assigneeId,
    recurrence: updatedTask.recurrence,
    subTasks: (updatedTask.subTasks || []).map(st => ({
      id: generateId("sub"),
      title: st.title,
      completed: false
    }))
  };
  return [...tasksList, newTask];
}

export default function App() {
  // Global Database State
  const [db, setDb] = useState<DatabaseState>(EMPTY_DB);

  const [activeTab, setActiveTab] = useState<"dashboard" | "tasks" | "finance" | "suppliers">("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // List of real accounts, used to populate "assign to..." pickers (task
  // assignee, dashboard workload, calendar). Loaded once after login.
  const [assignableUsers, setAssignableUsers] = useState<BasicUser[]>([]);

  // Deadline notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const urgentTasks = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return db.tasks.filter(t => !t.deletedAt && t.status !== "Completed" && t.status !== "Cancelled" && t.dueDate <= todayStr);
  }, [db.tasks]);

  // --- Price increase alerts ---------------------------------------------
  // priceHistory[0] is the most recent *previous* price (see handleUpdateProduct
  // below) — if the current price is higher than that, the supplier raised
  // the price. We track which specific price-change events the user has
  // already seen (by the history entry's id) in localStorage, so an alert
  // only shows once until the price changes again.
  interface PriceIncreaseAlert {
    id: string; // priceHistory entry id — unique per price-change event
    supplierName: string;
    productTitle: string;
    oldPrice: number;
    newPrice: number;
    currency: string;
    changedAt: string;
  }

  const [seenPriceAlertIds, setSeenPriceAlertIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SEEN_PRICE_ALERTS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [isPriceAlertsOpen, setIsPriceAlertsOpen] = useState(false);

  const priceIncreaseAlerts = useMemo((): PriceIncreaseAlert[] => {
    const alerts: PriceIncreaseAlert[] = [];
    (db.suppliers || []).forEach(s => {
      if (s.deletedAt) return;
      (s.products || []).forEach(p => {
        if (p.deletedAt) return;

        // Price set directly on the product card (manual entry, no items[])
        const lastChange = p.priceHistory?.[0];
        if (lastChange && typeof p.price === "number") {
          const sameCurrency = (lastChange.currency || "UAH") === (p.currency || "UAH");
          if (sameCurrency && p.price > lastChange.price) {
            alerts.push({
              id: lastChange.id,
              supplierName: s.name,
              productTitle: p.title,
              oldPrice: lastChange.price,
              newPrice: p.price,
              currency: p.currency || "UAH",
              changedAt: lastChange.changedAt
            });
          }
        }

        // Price set on individual denominations/codes (e.g. synced from LetsKeys)
        (p.items || []).forEach(item => {
          const itemLastChange = item.priceHistory?.[0];
          if (!itemLastChange || typeof item.price !== "number") return;
          const sameCurrency = (itemLastChange.currency || p.currency || "UAH") === (item.currency || p.currency || "UAH");
          if (sameCurrency && item.price > itemLastChange.price) {
            alerts.push({
              id: itemLastChange.id,
              supplierName: s.name,
              productTitle: item.title ? `${p.title} — ${item.title}` : p.title,
              oldPrice: itemLastChange.price,
              newPrice: item.price,
              currency: item.currency || p.currency || "UAH",
              changedAt: itemLastChange.changedAt
            });
          }
        });
      });
    });
    return alerts.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [db.suppliers]);

  const unseenPriceAlerts = useMemo(
    () => priceIncreaseAlerts.filter(a => !seenPriceAlertIds.has(a.id)),
    [priceIncreaseAlerts, seenPriceAlertIds]
  );

  const markPriceAlertSeen = (id: string) => {
    setSeenPriceAlertIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(SEEN_PRICE_ALERTS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const markAllPriceAlertsSeen = () => {
    setSeenPriceAlertIds(prev => {
      const next = new Set(prev);
      priceIncreaseAlerts.forEach(a => next.add(a.id));
      try { localStorage.setItem(SEEN_PRICE_ALERTS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBackupFeedback({ type: "error", message: "Цей браузер не підтримує сповіщення." });
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsEnabled(true);
        try { localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "true"); } catch { /* ignore */ }
        setBackupFeedback({ type: "success", message: "Сповіщення про дедлайни увімкнено." });
      } else {
        setBackupFeedback({ type: "error", message: "Доступ до сповіщень заблоковано в браузері." });
      }
    } catch (e) {
      console.warn("Notification permission request failed:", e);
    }
  };

  // Fire a single browser notification per day summarizing urgent tasks,
  // once permission is granted and the initial data load has finished.
  useEffect(() => {
    if (!notificationsEnabled || isLoading) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    if (urgentTasks.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    let lastNotified = "";
    try { lastNotified = localStorage.getItem(LAST_NOTIFIED_DATE_KEY) || ""; } catch { /* ignore */ }
    if (lastNotified === todayStr) return;

    try {
      new Notification("Game CRM: термінові завдання", {
        body: `${urgentTasks.length} ${urgentTasks.length === 1 ? "завдання потребує" : "завдань потребують"} уваги сьогодні або протерміновані.`
      });
      localStorage.setItem(LAST_NOTIFIED_DATE_KEY, todayStr);
    } catch (e) {
      console.warn("Failed to show notification:", e);
    }
  }, [notificationsEnabled, isLoading, urgentTasks.length]);

  // Fire a single browser notification per day summarizing new price
  // increases, same pattern as the deadline notification above.
  useEffect(() => {
    if (!notificationsEnabled || isLoading) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    if (unseenPriceAlerts.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    let lastNotified = "";
    try { lastNotified = localStorage.getItem(LAST_PRICE_NOTIFIED_DATE_KEY) || ""; } catch { /* ignore */ }
    if (lastNotified === todayStr) return;

    try {
      new Notification("Game CRM: постачальник підвищив ціну", {
        body: `${unseenPriceAlerts.length} ${unseenPriceAlerts.length === 1 ? "товар подорожчав" : "товарів подорожчали"} — перевірте розділ «Постачальники».`
      });
      localStorage.setItem(LAST_PRICE_NOTIFIED_DATE_KEY, todayStr);
    } catch (e) {
      console.warn("Failed to show notification:", e);
    }
  }, [notificationsEnabled, isLoading, unseenPriceAlerts.length]);

  // Global search across tasks, suppliers and finance
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return { tasks: [] as Task[], suppliers: [] as Supplier[], transactions: [] as Transaction[] };
    return {
      tasks: db.tasks.filter(t =>
        !t.deletedAt && (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.counterparty && t.counterparty.toLowerCase().includes(q))
        )
      ).slice(0, 5),
      suppliers: (db.suppliers || []).filter(s => !s.deletedAt && s.name.toLowerCase().includes(q)).slice(0, 5),
      transactions: (db.transactions || []).filter(tx =>
        !tx.deletedAt && (
          tx.category.toLowerCase().includes(q) ||
          (tx.description && tx.description.toLowerCase().includes(q)) ||
          (tx.counterparty && tx.counterparty.toLowerCase().includes(q))
        )
      ).slice(0, 5)
    };
  }, [globalSearchQuery, db.tasks, db.suppliers, db.transactions]);

  const hasSearchResults = searchResults.tasks.length + searchResults.suppliers.length + searchResults.transactions.length > 0;

  const handleSearchResultClick = (tab: "tasks" | "suppliers" | "finance") => {
    setActiveTab(tab);
    setGlobalSearchQuery("");
    setIsSearchFocused(false);
  };


  // Auth gate — the app always requires a real account now (no "open" mode).
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isUsersManagerOpen, setIsUsersManagerOpen] = useState(false);

  // Auto-dismiss backup status toasts
  useEffect(() => {
    if (backupFeedback) {
      const timer = setTimeout(() => setBackupFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [backupFeedback]);

  // Best-effort local cache write. Used purely as an offline fallback when the
  // server is unreachable — the server file is always the source of truth.
  const writeLocalCache = (data: DatabaseState) => {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
    } catch (e: any) {
      // Most likely a QuotaExceededError from large embedded images/voice notes.
      console.error("Failed to write offline cache to localStorage:", e);
      setBackupFeedback({
        type: "error",
        message: e?.name === "QuotaExceededError"
          ? "Не вистачає місця у пам'яті браузера для офлайн-копії. Дані на сервері збережено, але офлайн-кеш не оновлено."
          : "Не вдалося оновити офлайн-кеш у браузері."
      });
    }
  };

  // Server is the single source of truth (important once this app is shared
  // across devices / deployed on a real server). LocalStorage is only an
  // offline fallback used when the server can't be reached.
  const loadDatabase = async () => {
    setIsLoading(true);
    setServerError(null);
    try {
      const res = await apiFetch("/api/db");
      if (res.status === 401) {
        // apiFetch already triggered the login screen via AUTH_REQUIRED_EVENT
        return;
      }
      if (!res.ok) throw new Error("Помилка при читанні бази даних.");
      const data = await res.json();

      let finalData: DatabaseState = normalizeDb(data);
      const { db: purgedData, purgedCount } = purgeExpiredTrash(finalData);
      if (purgedCount > 0) {
        finalData = purgedData;
        // Persist the purge silently in the background; don't block the UI on it.
        apiFetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(purgedData)
        }).catch(() => { /* best-effort */ });
      }

      setDb(finalData);
      setIsOfflineMode(false);
      writeLocalCache(finalData);
    } catch (error: any) {
      console.error("Server database load failed, falling back to offline cache:", error);
      const localDataStr = localStorage.getItem(LOCAL_CACHE_KEY);
      if (localDataStr) {
        try {
          const localData = JSON.parse(localDataStr);
          setDb(normalizeDb(localData));
          setIsOfflineMode(true);
          setBackupFeedback({
            type: "error",
            message: "Сервер недоступний. Показано останню збережену офлайн-копію (лише для читання, зміни не будуть синхронізовані)."
          });
          setServerError(null);
          setIsLoading(false);
          return;
        } catch (e) {
          console.error("Local cache parse failed:", e);
        }
      }
      setServerError("Не вдалося з'єднатися із сервером. Перевірте, чи запущений сервер, та спробуйте ще раз.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auth is now always required — the app renders nothing but the login form
  // until the stored token proves to be a valid session for a real account.
  useEffect(() => {
    const init = async () => {
      const user = await fetchCurrentUser();
      if (user) {
        setAppUser(user);
        setIsAuthenticated(true);
      }
      setIsCheckingSession(false);
    };
    init();

    const handleAuthRequired = () => {
      setIsAuthenticated(false);
      setAppUser(null);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadDatabase();
      listBasicUsers().then(setAssignableUsers);
    }
  }, [isAuthenticated]);

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setAppUser(null);
  };

  // Universal State Update & Disk Save (server first, local cache as backup)
  const saveStateToDisk = async (updatedDb: DatabaseState): Promise<boolean> => {
    setDb(updatedDb);

    if (isOfflineMode) {
      // Don't silently pretend changes were saved while disconnected from the server.
      writeLocalCache(updatedDb);
      setBackupFeedback({
        type: "error",
        message: "Офлайн-режим: зміну збережено лише локально. Підключіться до сервера, щоб синхронізувати."
      });
      return false;
    }

    try {
      const res = await apiFetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDb)
      });
      if (!res.ok) {
        let serverMessage = "";
        try { serverMessage = (await res.json())?.message || ""; } catch { /* ignore */ }
        throw new Error(serverMessage || "Помилка збереження змін на диск.");
      }
      writeLocalCache(updatedDb);
      return true;
    } catch (error: any) {
      console.error("Server persist failed:", error);
      setBackupFeedback({
        type: "error",
        message: error?.message || "Не вдалося зберегти зміни на сервері. Перевірте з'єднання."
      });
      return false;
    }
  };

  // TASK ACTIONS

  // Attributes an action to the currently selected team member (or "Система"
  // if none is set) and appends it to the activity log, capped so the JSON
  // file doesn't grow forever.
  const makeLogEntry = (
    action: string,
    entityType: ActivityEntityType,
    entityTitle: string,
    details?: string
  ): ActivityLogEntry => {
    const actor = appUser?.username || "Система";
    return {
      id: generateId("log"),
      timestamp: new Date().toISOString(),
      actorName: actor,
      action,
      entityType,
      entityTitle,
      details
    };
  };

  const withLog = (
    updated: DatabaseState,
    action: string,
    entityType: ActivityEntityType,
    entityTitle: string,
    details?: string
  ): DatabaseState => {
    const entry = makeLogEntry(action, entityType, entityTitle, details);
    return {
      ...updated,
      activityLog: [entry, ...(updated.activityLog || db.activityLog || [])].slice(0, MAX_ACTIVITY_LOG_ENTRIES)
    };
  };

  const handleAddTask = (taskData: Omit<Task, "id">) => {
    const newTask: Task = {
      ...taskData,
      id: generateId("task")
    };
    const updated = {
      ...db,
      tasks: [...db.tasks, newTask]
    };
    saveStateToDisk(withLog(updated, "Створив завдання", "task", newTask.title));
  };

  const syncTaskStatusToSuppliers = (task: Task, suppliersList: Supplier[]): Supplier[] => {
    const supplierName = task.counterparty;
    if (!supplierName) return suppliersList;

    const isCompleted = task.status === "Completed";
    // Clean title from "Додати товар: " or "Додати категорію: " prefix
    const cleanTitle = task.title.replace("Додати товар: ", "").replace("Додати категорію: ", "").split(" (")[0].trim();

    return suppliersList.map(s => {
      if (s.name.trim() !== supplierName.trim()) return s;

      const updatedProducts = (s.products || []).map(prod => {
        let isProdAdded = prod.isAdded;
        let updatedItems = prod.items || [];

        if (prod.title.trim() === cleanTitle) {
          isProdAdded = isCompleted;
          updatedItems = updatedItems.map(item => ({ ...item, isAdded: isCompleted }));
        } else {
          let itemUpdated = false;
          updatedItems = updatedItems.map(item => {
            const displayTitle = item.title || `${prod.title} (Код: ${item.code})`;
            if (displayTitle.trim() === cleanTitle || item.code === cleanTitle || (task.description && task.description.includes(item.code))) {
              itemUpdated = true;
              return { ...item, isAdded: isCompleted };
            }
            return item;
          });

          if (itemUpdated) {
            const allItemsAdded = updatedItems.length > 0 && updatedItems.every(i => i.isAdded);
            isProdAdded = allItemsAdded;
          }
        }

        if (isProdAdded !== prod.isAdded || JSON.stringify(prod.items) !== JSON.stringify(updatedItems)) {
          return {
            ...prod,
            isAdded: isProdAdded,
            items: updatedItems
          };
        }
        return prod;
      });

      return {
        ...s,
        products: updatedProducts
      };
    });
  };

  const handleToggleTaskStatus = (taskId: string) => {
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    let nextStatus: Task["status"] = "Pending";
    if (task.status === "Pending") nextStatus = "Accepted";
    else if (task.status === "Accepted") nextStatus = "In Progress";
    else if (task.status === "In Progress") nextStatus = "Review";
    else if (task.status === "Review") nextStatus = "Completed";
    else if (task.status === "Completed") nextStatus = "Pending";
    else if (task.status === "Cancelled") nextStatus = "Pending";

    const updatedTask = { ...task, status: nextStatus };
    const updatedSuppliers = syncTaskStatusToSuppliers(updatedTask, db.suppliers || []);
    let updatedTasks = db.tasks.map(t => t.id === taskId ? updatedTask : t);
    updatedTasks = withRecurrenceSpawn(updatedTasks, task.status, updatedTask);

    const updated = {
      ...db,
      tasks: updatedTasks,
      suppliers: updatedSuppliers
    };
    saveStateToDisk(withLog(
      updated,
      "Змінив статус завдання",
      "task",
      task.title,
      `${TASK_STATUS_CONFIGS[task.status]?.label || task.status} → ${TASK_STATUS_CONFIGS[nextStatus]?.label || nextStatus}`
    ));
  };

  const handleSetTaskStatus = (taskId: string, newStatus: Task["status"]) => {
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTask = { ...task, status: newStatus };
    const updatedSuppliers = syncTaskStatusToSuppliers(updatedTask, db.suppliers || []);
    let updatedTasks = db.tasks.map(t => t.id === taskId ? updatedTask : t);
    updatedTasks = withRecurrenceSpawn(updatedTasks, task.status, updatedTask);

    const updated = {
      ...db,
      tasks: updatedTasks,
      suppliers: updatedSuppliers
    };
    saveStateToDisk(withLog(
      updated,
      "Змінив статус завдання",
      "task",
      task.title,
      `${TASK_STATUS_CONFIGS[task.status]?.label || task.status} → ${TASK_STATUS_CONFIGS[newStatus]?.label || newStatus}`
    ));
  };

  const handleDeleteTask = (taskId: string) => {
    const task = db.tasks.find(t => t.id === taskId);
    const updated = {
      ...db,
      tasks: db.tasks.map(t => t.id === taskId ? { ...t, deletedAt: new Date().toISOString() } : t)
    };
    saveStateToDisk(withLog(updated, "Перемістив у кошик завдання", "task", task?.title || taskId));
  };

  const handleRestoreTask = (taskId: string) => {
    const task = db.tasks.find(t => t.id === taskId);
    const updated = {
      ...db,
      tasks: db.tasks.map(t => t.id === taskId ? { ...t, deletedAt: undefined } : t)
    };
    saveStateToDisk(withLog(updated, "Відновив з кошика завдання", "task", task?.title || taskId));
  };

  const handlePermanentlyDeleteTask = (taskId: string) => {
    const task = db.tasks.find(t => t.id === taskId);
    const updated = {
      ...db,
      tasks: db.tasks.filter(t => t.id !== taskId)
    };
    saveStateToDisk(withLog(updated, "Остаточно видалив завдання", "task", task?.title || taskId));
  };

  const handleUpdateTask = (updatedTask: Task) => {
    const prevTask = db.tasks.find(t => t.id === updatedTask.id);
    const updatedSuppliers = syncTaskStatusToSuppliers(updatedTask, db.suppliers || []);
    let updatedTasks = db.tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    updatedTasks = withRecurrenceSpawn(updatedTasks, prevTask?.status, updatedTask);
    const updated = {
      ...db,
      tasks: updatedTasks,
      suppliers: updatedSuppliers
    };
    saveStateToDisk(withLog(updated, "Оновив завдання", "task", updatedTask.title));
  };

  // BULK TASK ACTIONS
  const handleBulkSetStatus = (taskIds: string[], newStatus: TaskStatus) => {
    if (taskIds.length === 0) return;
    let updatedTasks = db.tasks.map(t => taskIds.includes(t.id) ? { ...t, status: newStatus } : t);
    taskIds.forEach(id => {
      const original = db.tasks.find(t => t.id === id);
      if (original && original.status !== newStatus) {
        updatedTasks = withRecurrenceSpawn(updatedTasks, original.status, { ...original, status: newStatus });
      }
    });
    const updated = { ...db, tasks: updatedTasks };
    saveStateToDisk(withLog(
      updated,
      "Масово змінив статус завдань",
      "task",
      `${taskIds.length} завдань`,
      TASK_STATUS_CONFIGS[newStatus]?.label || newStatus
    ));
  };

  const handleBulkSetAssignee = (taskIds: string[], assigneeId: string | undefined) => {
    if (taskIds.length === 0) return;
    const updated = {
      ...db,
      tasks: db.tasks.map(t => taskIds.includes(t.id) ? { ...t, assigneeId } : t)
    };
    const memberName = assigneeId ? assignableUsers.find(u => u.id === assigneeId)?.username : "Не призначено";
    saveStateToDisk(withLog(updated, "Масово призначив відповідального", "task", `${taskIds.length} завдань`, memberName));
  };

  const handleBulkDeleteTasks = (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    const now = new Date().toISOString();
    const updated = {
      ...db,
      tasks: db.tasks.map(t => taskIds.includes(t.id) ? { ...t, deletedAt: now } : t)
    };
    saveStateToDisk(withLog(updated, "Масово перемістив у кошик завдання", "task", `${taskIds.length} завдань`));
  };

  // TASK TEMPLATE ACTIONS
  const handleAddTemplate = (data: Omit<TaskTemplate, "id">) => {
    const newTemplate: TaskTemplate = { ...data, id: generateId("template") };
    const updated = {
      ...db,
      taskTemplates: [...(db.taskTemplates || []), newTemplate]
    };
    saveStateToDisk(withLog(updated, "Додав шаблон завдання", "task", newTemplate.name));
  };

  const handleDeleteTemplate = (id: string) => {
    const template = (db.taskTemplates || []).find(t => t.id === id);
    const updated = {
      ...db,
      taskTemplates: (db.taskTemplates || []).filter(t => t.id !== id)
    };
    saveStateToDisk(withLog(updated, "Видалив шаблон завдання", "task", template?.name || id));
  };

  // TRANSACTION ACTIONS
  const handleAddTransaction = (txData: Omit<Transaction, "id">) => {
    const newTx: Transaction = {
      ...txData,
      id: generateId("tx")
    };
    const updated = {
      ...db,
      transactions: [...(db.transactions || []), newTx]
    };
    saveStateToDisk(withLog(updated, "Додав транзакцію", "transaction", `${newTx.category} · ${newTx.amount} ${newTx.currency || db.baseCurrency}`));
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    const updated = {
      ...db,
      transactions: (db.transactions || []).map(tx => tx.id === updatedTx.id ? updatedTx : tx)
    };
    saveStateToDisk(withLog(updated, "Оновив транзакцію", "transaction", `${updatedTx.category} · ${updatedTx.amount} ${updatedTx.currency || db.baseCurrency}`));
  };

  const handleDeleteTransaction = (txId: string) => {
    const tx = (db.transactions || []).find(t => t.id === txId);
    const updated = {
      ...db,
      transactions: (db.transactions || []).map(t => t.id === txId ? { ...t, deletedAt: new Date().toISOString() } : t)
    };
    saveStateToDisk(withLog(updated, "Перемістив у кошик транзакцію", "transaction", tx ? `${tx.category} · ${tx.amount} ${tx.currency || db.baseCurrency}` : txId));
  };

  const handleRestoreTransaction = (txId: string) => {
    const tx = (db.transactions || []).find(t => t.id === txId);
    const updated = {
      ...db,
      transactions: (db.transactions || []).map(t => t.id === txId ? { ...t, deletedAt: undefined } : t)
    };
    saveStateToDisk(withLog(updated, "Відновив з кошика транзакцію", "transaction", tx ? `${tx.category} · ${tx.amount} ${tx.currency || db.baseCurrency}` : txId));
  };

  const handlePermanentlyDeleteTransaction = (txId: string) => {
    const tx = (db.transactions || []).find(t => t.id === txId);
    const updated = {
      ...db,
      transactions: (db.transactions || []).filter(t => t.id !== txId)
    };
    saveStateToDisk(withLog(updated, "Остаточно видалив транзакцію", "transaction", tx ? `${tx.category} · ${tx.amount} ${tx.currency || db.baseCurrency}` : txId));
  };

  // SUPPLIER ACTIONS
  const handleAddSupplier = (supData: Omit<Supplier, "id" | "isClosed" | "products">) => {
    const newSup: Supplier = {
      ...supData,
      id: generateId("supplier"),
      isClosed: false,
      products: []
    };
    const updated = {
      ...db,
      suppliers: [...(db.suppliers || []), newSup]
    };
    saveStateToDisk(withLog(updated, "Додав постачальника", "supplier", newSup.name));
  };

  const handleToggleSupplierStatus = (supId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => 
        s.id === supId ? { ...s, isClosed: !s.isClosed } : s
      )
    };
    saveStateToDisk(withLog(
      updated,
      "Змінив статус постачальника",
      "supplier",
      supplier?.name || supId,
      supplier ? (supplier.isClosed ? "Закритий → Активний" : "Активний → Закритий") : undefined
    ));
  };

  const handleToggleSupplierLetsKeysLink = (supId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s =>
        s.id === supId ? { ...s, letsKeysLinked: !s.letsKeysLinked } : s
      )
    };
    saveStateToDisk(withLog(
      updated,
      "Змінив прив'язку до LetsKeys",
      "supplier",
      supplier?.name || supId,
      supplier?.letsKeysLinked ? "Відв'язано" : "Прив'язано"
    ));
  };

  const handleDeleteSupplier = (supId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => s.id === supId ? { ...s, deletedAt: new Date().toISOString() } : s)
    };
    saveStateToDisk(withLog(updated, "Перемістив у кошик постачальника", "supplier", supplier?.name || supId));
  };

  const handleRestoreSupplier = (supId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => s.id === supId ? { ...s, deletedAt: undefined } : s)
    };
    saveStateToDisk(withLog(updated, "Відновив з кошика постачальника", "supplier", supplier?.name || supId));
  };

  const handlePermanentlyDeleteSupplier = (supId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).filter(s => s.id !== supId)
    };
    saveStateToDisk(withLog(updated, "Остаточно видалив постачальника", "supplier", supplier?.name || supId));
  };

  const handleAddProduct = (supId: string, prodData: Omit<ProductCard, "id">) => {
    const newProd: ProductCard = {
      ...prodData,
      id: generateId("prod")
    };
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          return {
            ...s,
            products: [...(s.products || []), newProd]
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Додав товар", "product", `${newProd.title} (${supplier?.name || ""})`));
  };

  const handleAddProducts = (supId: string, prodsData: Omit<ProductCard, "id">[]) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          const newProducts: ProductCard[] = prodsData.map((p) => ({
            ...p,
            id: generateId("prod")
          }));
          return {
            ...s,
            products: [...(s.products || []), ...newProducts]
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Додав товари", "product", `${prodsData.length} шт. (${supplier?.name || ""})`));
  };

  const handleUpdateProduct = (supId: string, prodId: string, updatedProd: ProductCard) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const existingProd = supplier?.products?.find(p => p.id === prodId);

    // Record a price-history entry whenever the price (or its currency) actually changes.
    let finalProd = updatedProd;
    if (existingProd && typeof existingProd.price === "number" &&
        (existingProd.price !== updatedProd.price || (existingProd.currency || "UAH") !== (updatedProd.currency || "UAH"))) {
      const historyEntry: PriceHistoryEntry = {
        id: generateId("price"),
        price: existingProd.price,
        currency: existingProd.currency,
        changedAt: new Date().toISOString()
      };
      finalProd = {
        ...updatedProd,
        priceHistory: [historyEntry, ...(existingProd.priceHistory || [])].slice(0, 50)
      };
    }

    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          return {
            ...s,
            products: (s.products || []).map(p => p.id === prodId ? finalProd : p)
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Оновив товар", "product", finalProd.title));
  };

  const handleDeleteProduct = (supId: string, prodId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const prod = supplier?.products?.find(p => p.id === prodId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          return {
            ...s,
            products: (s.products || []).map(p => p.id === prodId ? { ...p, deletedAt: new Date().toISOString() } : p)
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Перемістив у кошик товар", "product", prod?.title || prodId));
  };

  const handleRestoreProduct = (supId: string, prodId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const prod = supplier?.products?.find(p => p.id === prodId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          return {
            ...s,
            products: (s.products || []).map(p => p.id === prodId ? { ...p, deletedAt: undefined } : p)
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Відновив з кошика товар", "product", prod?.title || prodId));
  };

  const handlePermanentlyDeleteProduct = (supId: string, prodId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const prod = supplier?.products?.find(p => p.id === prodId);
    const updated = {
      ...db,
      suppliers: (db.suppliers || []).map(s => {
        if (s.id === supId) {
          return {
            ...s,
            products: (s.products || []).filter(p => p.id !== prodId)
          };
        }
        return s;
      })
    };
    saveStateToDisk(withLog(updated, "Остаточно видалив товар", "product", prod?.title || prodId));
  };

  // Imports/updates products from a LetsKeys "variations" response into a
  // supplier's product list, matching by externalVariationId so re-running
  // this later updates prices (recording history) instead of duplicating.
  // Merges a batch of LetsKeys product+variations results into a supplier's
  // product list and persists it as a SINGLE save at the end. Each LetsKeys
  // "product" (in one region) becomes ONE ProductCard — its variations
  // (denominations/durations) become items[] inside that card, matching how
  // suppliers already model "one product, many codes/denominations". This
  // must NOT be called once per (product, region) job during a bulk sync —
  // doing that previously fired one full-database save per job (hundreds of
  // network round-trips, and a real risk of lost updates from stale reads).
  const handleImportLetsKeysVariations = async (
    supplierId: string,
    jobs: { productId: number; productName: string; region: string; variations: LetsKeysVariation[] }[]
  ): Promise<{ addedCount: number; updatedCount: number; priceChangedCount: number; success: boolean }> => {
    const supplier = db.suppliers.find(s => s.id === supplierId);
    if (!supplier) return { addedCount: 0, updatedCount: 0, priceChangedCount: 0, success: false };

    let addedCount = 0;
    let updatedCount = 0;
    let priceChangedCount = 0;
    const now = new Date().toISOString();

    // Match existing ProductCards by (externalProductId, region) so re-syncing
    // updates the same card's denominations instead of duplicating it.
    const cardByProductRegion: Record<string, ProductCard> = {};
    supplier.products.forEach(p => {
      if (p.externalProductId && p.externalRegion) {
        cardByProductRegion[`${p.externalProductId}::${p.externalRegion}`] = p;
      }
    });

    let updatedProducts = [...supplier.products];

    jobs.forEach(({ productId, productName, region, variations }) => {
      if (variations.length === 0) return;
      const key = `${productId}::${region}`;
      const existingCard = cardByProductRegion[key];

      // Merge this job's variations into the card's items[], matching each
      // by externalVariationId so prices update in place instead of piling up.
      const baseItems = existingCard?.items || [];
      const itemByExternalId: Record<string, CategoryItem> = {};
      baseItems.forEach(item => {
        if (item.externalVariationId) itemByExternalId[item.externalVariationId] = item;
      });

      const mergedItems = [...baseItems];
      variations.forEach(v => {
        const extId = String(v.id);
        const existingItem = itemByExternalId[extId];

        if (existingItem) {
          let finalItem: CategoryItem = { ...existingItem, externalInStock: v.in_stock, lastSyncedAt: now };
          if (typeof existingItem.price === "number" && existingItem.price !== v.price) {
            const historyEntry: PriceHistoryEntry = {
              id: generateId("price"),
              price: existingItem.price,
              currency: existingItem.currency,
              changedAt: now
            };
            finalItem.priceHistory = [historyEntry, ...(existingItem.priceHistory || [])].slice(0, 50);
            priceChangedCount++;
          }
          finalItem.price = v.price;
          finalItem.title = v.name;
          const idx = mergedItems.findIndex(i => i.id === existingItem.id);
          mergedItems[idx] = finalItem;
          itemByExternalId[extId] = finalItem;
          updatedCount++;
        } else {
          const newItem: CategoryItem = {
            id: generateId("item"),
            code: extId,
            title: v.name,
            price: v.price,
            status: "Available",
            createdAt: now,
            externalVariationId: extId,
            externalInStock: v.in_stock,
            lastSyncedAt: now
          };
          mergedItems.push(newItem);
          itemByExternalId[extId] = newItem;
          addedCount++;
        }
      });

      if (existingCard) {
        const finalCard: ProductCard = { ...existingCard, items: mergedItems, lastSyncedAt: now };
        const idx = updatedProducts.findIndex(p => p.id === existingCard.id);
        updatedProducts[idx] = finalCard;
        cardByProductRegion[key] = finalCard;
      } else {
        const newCard: ProductCard = {
          id: generateId("prod"),
          title: productName,
          currency: region, // "currency" field doubles as region tag app-wide
          items: mergedItems,
          externalSource: "letskeys",
          externalProductId: String(productId),
          externalRegion: region,
          lastSyncedAt: now
        };
        updatedProducts.push(newCard);
        cardByProductRegion[key] = newCard;
      }
    });

    const updatedSuppliers = db.suppliers.map(s => s.id === supplierId ? { ...s, products: updatedProducts } : s);
    const updated = { ...db, suppliers: updatedSuppliers };
    const success = await saveStateToDisk(withLog(
      updated,
      "Синхронізував товари з LetsKeys",
      "product",
      supplier.name,
      `Додано: ${addedCount}, оновлено: ${updatedCount}, зміна ціни: ${priceChangedCount}`
    ));

    return { addedCount, updatedCount, priceChangedCount, success };
  };

  const handleToggleProductAdded = (supId: string, prodId: string) => {
    const supplier = (db.suppliers || []).find(s => s.id === supId);
    const targetProd = supplier?.products?.find(p => p.id === prodId);
    if (!targetProd) return;

    const nextIsAdded = !targetProd.isAdded;

    const updatedSuppliers = (db.suppliers || []).map(s => {
      if (s.id === supId) {
        return {
          ...s,
          products: (s.products || []).map(p => {
            if (p.id === prodId) {
              const updatedItems = (p.items || []).map(item => ({
                ...item,
                isAdded: nextIsAdded
              }));
              return {
                ...p,
                isAdded: nextIsAdded,
                items: updatedItems
              };
            }
            return p;
          })
        };
      }
      return s;
    });

    let updatedTasks = db.tasks;
    if (supplier) {
      updatedTasks = db.tasks.map(t => {
        if (t.counterparty === supplier.name && (t.title.includes(targetProd.title) || (targetProd.items || []).some(i => t.description?.includes(i.code)))) {
          return {
            ...t,
            status: nextIsAdded ? "Completed" : "In Progress"
          };
        }
        return t;
      });
    }

    const updated = {
      ...db,
      suppliers: updatedSuppliers,
      tasks: updatedTasks
    };
    saveStateToDisk(withLog(
      updated,
      nextIsAdded ? "Позначив товар як додано" : "Зняв позначку з товару",
      "product",
      targetProd.title
    ));
  };

  // BUDGET ACTIONS
  const handleAddBudget = (data: Omit<BudgetPlan, "id">) => {
    const newBudget: BudgetPlan = { ...data, id: generateId("budget") };
    const updated = {
      ...db,
      budgets: [...(db.budgets || []), newBudget]
    };
    saveStateToDisk(withLog(
      updated,
      "Додав статтю бюджету",
      "budget",
      `${newBudget.category} (${newBudget.month})`,
      `${newBudget.type === "Income" ? "Дохід" : "Витрата"} · ${newBudget.plannedAmount} ${db.baseCurrency}`
    ));
  };

  const handleDeleteBudget = (id: string) => {
    const budget = (db.budgets || []).find(b => b.id === id);
    const updated = {
      ...db,
      budgets: (db.budgets || []).filter(b => b.id !== id)
    };
    saveStateToDisk(withLog(updated, "Видалив статтю бюджету", "budget", budget ? `${budget.category} (${budget.month})` : id));
  };

  // CURRENCY RATES
  const handleUpdateCurrencyRates = (rates: Record<string, number>) => {
    const updated = { ...db, currencyRates: { ...rates, [db.baseCurrency]: 1 } };
    saveStateToDisk(withLog(updated, "Оновив курси валют", "budget", "Налаштування валют"));
  };

  const handleSetBaseCurrency = (currency: string) => {
    const code = currency.trim().toUpperCase();
    if (!code || code === db.baseCurrency) return;
    // Keep the old base currency in the rate table (its rate relative to the
    // new base is unknown, so default to 1 — the user can correct it).
    const updated = {
      ...db,
      baseCurrency: code,
      currencyRates: { ...db.currencyRates, [code]: 1 }
    };
    saveStateToDisk(withLog(updated, "Змінив базову валюту", "budget", code));
  };

  // --- Trash (soft-deleted items) -----------------------------------------
  const trashedTasks = useMemo(() => db.tasks.filter(t => !!t.deletedAt), [db.tasks]);
  const trashedTransactions = useMemo(() => (db.transactions || []).filter(t => !!t.deletedAt), [db.transactions]);
  const trashedSuppliers = useMemo(() => (db.suppliers || []).filter(s => !!s.deletedAt), [db.suppliers]);
  const trashedProducts = useMemo(() => {
    const result: { supplierId: string; supplierName: string; product: ProductCard }[] = [];
    (db.suppliers || []).forEach(s => {
      (s.products || []).forEach(p => {
        if (p.deletedAt) result.push({ supplierId: s.id, supplierName: s.name, product: p });
      });
    });
    return result;
  }, [db.suppliers]);
  const trashCount = trashedTasks.length + trashedTransactions.length + trashedSuppliers.length + trashedProducts.length;
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Data with soft-deleted items hidden — this is what every tab actually renders.
  const visibleTasks = useMemo(() => db.tasks.filter(t => !t.deletedAt), [db.tasks]);
  const visibleTransactions = useMemo(() => (db.transactions || []).filter(t => !t.deletedAt), [db.transactions]);
  const visibleSuppliers = useMemo(() => {
    return (db.suppliers || [])
      .filter(s => !s.deletedAt)
      .map(s => ({ ...s, products: (s.products || []).filter(p => !p.deletedAt) }));
  }, [db.suppliers]);

  // Still resolving whether the stored session token is valid
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginGate
        onSuccess={async () => {
          const user = await fetchCurrentUser();
          setAppUser(user);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-400 flex flex-col font-sans">
      {/* Dynamic Navigation Topbar */}
      <header className="bg-[#111112] text-white border-b border-white/5 sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-lg shadow-inner text-white flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Game CRM</h1>
            </div>
          </div>

          {/* Quick Connection Status Info */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-semibold">
            {/* Offline cache indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                isOfflineMode
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              }`}
              title={isOfflineMode ? "Показано офлайн-копію з браузера, зміни не синхронізуються" : "Дані синхронізовано з сервером"}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Кеш: </span>
              <span className="font-mono">{isOfflineMode ? "ОФЛАЙН" : "OK"}</span>
            </div>

            {/* Real server connection status */}
            <div className="hidden sm:flex items-center gap-1.5 text-gray-300 bg-[#1A1A1C] px-2.5 py-1.5 rounded-lg border border-white/5">
              <Database className={`w-3.5 h-3.5 ${serverError || isOfflineMode ? "text-red-400" : "text-emerald-400"}`} />
              <span>Сервер: </span>
              <span className={`font-mono ${serverError || isOfflineMode ? "text-red-400" : "text-emerald-500"}`}>
                {serverError || isOfflineMode ? "НЕДОСТУПНИЙ" : "OK"}
              </span>
            </div>

            {/* Deadline notifications bell */}
            <button
              onClick={() => {
                if (!notificationsEnabled) handleEnableNotifications();
                setActiveTab("tasks");
              }}
              className="relative flex items-center gap-1.5 bg-[#1A1A1C] hover:bg-white/5 border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              title={
                notificationsEnabled
                  ? `Сповіщення увімкнено. Термінових завдань: ${urgentTasks.length}`
                  : "Натисніть, щоб увімкнути сповіщення про дедлайни"
              }
            >
              <Bell className={`w-3.5 h-3.5 ${notificationsEnabled ? "text-emerald-400" : "text-gray-400"}`} />
              {urgentTasks.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">
                  {urgentTasks.length > 9 ? "9+" : urgentTasks.length}
                </span>
              )}
            </button>

            {/* Price increase alerts */}
            <div className="relative">
              <button
                onClick={() => setIsPriceAlertsOpen(!isPriceAlertsOpen)}
                className="relative flex items-center gap-1.5 bg-[#1A1A1C] hover:bg-white/5 border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                title={unseenPriceAlerts.length > 0 ? `Подорожчали товари: ${unseenPriceAlerts.length}` : "Підвищень ціни немає"}
              >
                <TrendingUp className={`w-3.5 h-3.5 ${unseenPriceAlerts.length > 0 ? "text-amber-400" : "text-gray-400"}`} />
                {unseenPriceAlerts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">
                    {unseenPriceAlerts.length > 9 ? "9+" : unseenPriceAlerts.length}
                  </span>
                )}
              </button>

              {isPriceAlertsOpen && (
                <div className="absolute right-0 mt-1.5 w-80 bg-[#161618] border border-white/10 rounded-xl shadow-2xl z-30 max-h-96 overflow-hidden flex flex-col">
                  <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold text-white">Підвищення цін постачальників</span>
                    {unseenPriceAlerts.length > 0 && (
                      <button
                        onClick={markAllPriceAlertsSeen}
                        className="text-[10px] text-gray-500 hover:text-white underline cursor-pointer"
                      >
                        Позначити всі переглянутими
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {priceIncreaseAlerts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-6">Підвищень цін ще не зафіксовано.</p>
                    ) : (
                      priceIncreaseAlerts.map(alert => {
                        const isUnseen = !seenPriceAlertIds.has(alert.id);
                        const diff = alert.newPrice - alert.oldPrice;
                        const pct = alert.oldPrice > 0 ? Math.round((diff / alert.oldPrice) * 100) : 0;
                        return (
                          <div
                            key={alert.id}
                            className={`px-3 py-2.5 border-b border-white/5 last:border-0 ${isUnseen ? "bg-amber-500/5" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{alert.productTitle}</p>
                                <p className="text-[10px] text-gray-500 truncate">{alert.supplierName} · {formatDate(alert.changedAt)}</p>
                              </div>
                              {isUnseen && (
                                <button
                                  onClick={() => markPriceAlertSeen(alert.id)}
                                  className="text-[10px] text-gray-500 hover:text-white shrink-0 cursor-pointer"
                                  title="Позначити переглянутим"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <p className="text-xs font-mono mt-1">
                              <span className="text-gray-500">{alert.oldPrice}</span>
                              <span className="text-gray-600 mx-1">→</span>
                              <span className="text-amber-400 font-bold">{alert.newPrice} {alert.currency}</span>
                              <span className="text-amber-500/70 ml-1.5">(+{pct}%)</span>
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Trash bin */}
            <button
              onClick={() => setIsTrashOpen(true)}
              className="relative flex items-center gap-1.5 bg-[#1A1A1C] hover:bg-white/5 border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              title={`Кошик${trashCount > 0 ? ` (${trashCount})` : ""} — видалені елементи зберігаються 30 днів`}
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              {trashCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">
                  {trashCount > 9 ? "9+" : trashCount}
                </span>
              )}
            </button>

            {/* Reload button */}
            <button 
              onClick={loadDatabase} 
              className="p-1.5 sm:p-2 hover:bg-[#1A1A1C] text-gray-400 hover:text-white rounded-lg transition-colors border border-white/5 cursor-pointer"
              title="Перезавантажити дані"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Logged-in account (username + role); click opens user management for anyone logged in */}
            {appUser && (
              <button
                onClick={() => setIsUsersManagerOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/5 text-xs bg-[#1A1A1C] hover:bg-white/5 cursor-pointer"
                title="Керування користувачами"
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${appUser.role === "admin" ? "text-emerald-400" : "text-blue-400"}`} />
                <span className="text-gray-200">{appUser.username}</span>
                <span className="text-gray-500">· {appUser.role === "admin" ? "адмін" : "саппорт"}</span>
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-1.5 sm:p-2 hover:bg-[#1A1A1C] text-gray-400 hover:text-white rounded-lg transition-colors border border-white/5 cursor-pointer"
              title="Вийти"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* User management modal (any logged-in account, admin or support) */}
      {isUsersManagerOpen && appUser && (
        <UsersManager currentUserId={appUser.id} onClose={() => setIsUsersManagerOpen(false)} />
      )}

      {/* Main Container */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Global Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 150)}
            placeholder="Глобальний пошук: завдання, постачальники, транзакції..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-white/10 rounded-xl bg-[#111112] text-white focus:outline-hidden focus:border-emerald-500 placeholder:text-gray-600"
          />
          {isSearchFocused && globalSearchQuery.trim() && (
            <div className="absolute z-30 mt-1.5 w-full bg-[#161618] border border-white/10 rounded-xl shadow-2xl max-h-96 overflow-y-auto p-2 space-y-3">
              {hasSearchResults ? (
                <>
                  {searchResults.tasks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase px-2 mb-1">Завдання</p>
                      {searchResults.tasks.map(t => (
                        <button
                          key={t.id}
                          onMouseDown={() => handleSearchResultClick("tasks")}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">{t.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.suppliers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase px-2 mb-1">Постачальники</p>
                      {searchResults.suppliers.map(s => (
                        <button
                          key={s.id}
                          onMouseDown={() => handleSearchResultClick("suppliers")}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                          <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.transactions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase px-2 mb-1">Фінанси</p>
                      {searchResults.transactions.map(tx => (
                        <button
                          key={tx.id}
                          onMouseDown={() => handleSearchResultClick("finance")}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">{tx.category} · {tx.amount.toLocaleString()} {tx.currency || db.baseCurrency}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500 text-center py-3">Нічого не знайдено.</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation Tabs bar */}
        <div className="bg-[#111112] p-1 rounded-xl border border-white/5 flex justify-between sm:justify-start gap-1 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Огляд
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "tasks"
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Завдання
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "finance"
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Wallet className="w-4 h-4" />
            Фінанси
          </button>
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "suppliers"
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Package className="w-4 h-4" />
            Товари
          </button>
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="bg-[#111112] rounded-xl border border-white/5 py-24 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500 font-mono">Читання локальних файлів бази даних...</p>
          </div>
        ) : serverError ? (
          /* Server connection error box */
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-6 space-y-3 max-w-xl mx-auto text-sm">
            <div className="flex items-center gap-2 font-bold text-red-400">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Сервер не відповідає
            </div>
            <p>{serverError}</p>
            <button 
              onClick={loadDatabase}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Спробувати знову
            </button>
          </div>
        ) : (
          /* Active Tab View with Framer Motion Layout Transitions */
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <Suspense fallback={<TabLoadingFallback />}>
                {activeTab === "dashboard" && (
                  <Dashboard
                    tasks={visibleTasks}
                    transactions={visibleTransactions}
                    suppliers={visibleSuppliers}
                    assignableUsers={assignableUsers}
                    activityLog={db.activityLog || []}
                    baseCurrency={db.baseCurrency || "USD"}
                    onAddTask={() => setActiveTab("tasks")}
                    onGoToTab={(tab) => setActiveTab(tab)}
                  />
                )}

                {activeTab === "tasks" && (
                  <TaskManager
                    tasks={visibleTasks}
                    assignableUsers={assignableUsers}
                    currentUserId={appUser?.id || null}
                    taskTemplates={db.taskTemplates || []}
                    suppliers={visibleSuppliers}
                    onAddTask={handleAddTask}
                    onToggleTaskStatus={handleToggleTaskStatus}
                    onSetTaskStatus={handleSetTaskStatus}
                    onDeleteTask={handleDeleteTask}
                    onUpdateTask={handleUpdateTask}
                    onBulkSetStatus={handleBulkSetStatus}
                    onBulkSetAssignee={handleBulkSetAssignee}
                    onBulkDeleteTasks={handleBulkDeleteTasks}
                    onAddTemplate={handleAddTemplate}
                    onDeleteTemplate={handleDeleteTemplate}
                  />
                )}

                {activeTab === "finance" && (
                  <FinanceManager
                    transactions={visibleTransactions}
                    budgets={db.budgets || []}
                    tasks={visibleTasks}
                    suppliers={visibleSuppliers}
                    baseCurrency={db.baseCurrency || "USD"}
                    currencyRates={db.currencyRates || {}}
                    onUpdateCurrencyRates={handleUpdateCurrencyRates}
                    onSetBaseCurrency={handleSetBaseCurrency}
                    onAddTransaction={handleAddTransaction}
                    onUpdateTransaction={handleUpdateTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onAddBudget={handleAddBudget}
                    onDeleteBudget={handleDeleteBudget}
                  />
                )}

                {activeTab === "suppliers" && (
                  <SupplierManager
                    suppliers={visibleSuppliers}
                    tasks={visibleTasks}
                    onAddSupplier={handleAddSupplier}
                    onToggleSupplierStatus={handleToggleSupplierStatus}
                    onToggleSupplierLetsKeysLink={handleToggleSupplierLetsKeysLink}
                    onDeleteSupplier={handleDeleteSupplier}
                    onAddProduct={handleAddProduct}
                    onAddProducts={handleAddProducts}
                    onUpdateProduct={handleUpdateProduct}
                    onDeleteProduct={handleDeleteProduct}
                    onToggleProductAdded={handleToggleProductAdded}
                    onImportLetsKeysVariations={handleImportLetsKeysVariations}
                    onAddTask={handleAddTask}
                    onUpdateTask={handleUpdateTask}
                  />
                )}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#0D0D0E] border-t border-white/5 py-4 mt-10 flex-shrink-0 text-gray-500">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-3 text-xs">
          <p>© 2026 Game CRM. Дані зберігаються на сервері (SQLite).</p>
          <div className="flex gap-4">
            {isOfflineMode ? (
              <span className="font-semibold text-amber-400">Офлайн-режим — показано локальний кеш, зміни не синхронізуються</span>
            ) : (
              <span className="font-semibold text-emerald-400">Підключено до сервера</span>
            )}
          </div>
        </div>
      </footer>

      {/* Floating Toast Notification for local backups and feedback */}
      <AnimatePresence>
        {backupFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
              backupFeedback.type === "success" 
                ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/30" 
                : "bg-red-950/90 text-red-300 border-red-500/30"
            }`}
          >
            {backupFeedback.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0" />
            )}
            <span className="text-xs font-semibold">{backupFeedback.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trash bin modal */}
      {isTrashOpen && (
        <TrashBin
          tasks={trashedTasks}
          transactions={trashedTransactions}
          suppliers={trashedSuppliers}
          products={trashedProducts}
          retentionDays={TRASH_RETENTION_DAYS}
          baseCurrency={db.baseCurrency || "USD"}
          onClose={() => setIsTrashOpen(false)}
          onRestoreTask={handleRestoreTask}
          onPermanentlyDeleteTask={handlePermanentlyDeleteTask}
          onRestoreTransaction={handleRestoreTransaction}
          onPermanentlyDeleteTransaction={handlePermanentlyDeleteTransaction}
          onRestoreSupplier={handleRestoreSupplier}
          onPermanentlyDeleteSupplier={handlePermanentlyDeleteSupplier}
          onRestoreProduct={handleRestoreProduct}
          onPermanentlyDeleteProduct={handlePermanentlyDeleteProduct}
        />
      )}
    </div>
  );
}
