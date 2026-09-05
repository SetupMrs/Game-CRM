export type TaskStatus = "Pending" | "Accepted" | "In Progress" | "Review" | "Completed" | "Cancelled";
export type PriorityLevel = "Low" | "Medium" | "High";

export interface TaskStatusConfig {
  key: TaskStatus;
  label: string;
  badgeClass: string;
  dotClass: string;
  borderClass: string;
  bgClass: string;
}

export const TASK_STATUS_CONFIGS: Record<TaskStatus, TaskStatusConfig> = {
  "Pending": {
    key: "Pending",
    label: "Очікує",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    dotClass: "bg-blue-400",
    borderClass: "border-blue-500/40",
    bgClass: "hover:bg-blue-500/20"
  },
  "Accepted": {
    key: "Accepted",
    label: "Прийнято",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    dotClass: "bg-indigo-400",
    borderClass: "border-indigo-500/40",
    bgClass: "hover:bg-indigo-500/20"
  },
  "In Progress": {
    key: "In Progress",
    label: "В роботі",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dotClass: "bg-amber-400",
    borderClass: "border-amber-500/40",
    bgClass: "hover:bg-amber-500/20"
  },
  "Review": {
    key: "Review",
    label: "На перевірці",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    dotClass: "bg-purple-400",
    borderClass: "border-purple-500/40",
    bgClass: "hover:bg-purple-500/20"
  },
  "Completed": {
    key: "Completed",
    label: "Виконано",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dotClass: "bg-emerald-400",
    borderClass: "border-emerald-500/40",
    bgClass: "hover:bg-emerald-500/20"
  },
  "Cancelled": {
    key: "Cancelled",
    label: "Скасовано",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dotClass: "bg-rose-400",
    borderClass: "border-rose-500/40",
    bgClass: "hover:bg-rose-500/20"
  }
};

export const TASK_STATUS_LIST: TaskStatus[] = [
  "Pending",
  "Accepted",
  "In Progress",
  "Review",
  "Completed",
  "Cancelled"
];

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface VoiceNote {
  id: string;
  audioUrl: string;
  duration: number;
  createdAt: string;
  name?: string;
}

export interface TaskImage {
  id: string;
  url: string;
  name: string;
  createdAt: string;
  size?: number;
  fileType?: string;
}

export interface TaskChatMessage {
  id: string;
  senderName: string;
  senderRole?: string; // "Керівник", "Модератор", "Розробник", "Клієнт", "Менеджер", "Виконавець" тощо
  senderAvatar?: string;
  text?: string;
  createdAt: string;
  voiceNote?: VoiceNote;
  images?: TaskImage[];
  isPinned?: boolean;
  teamMemberId?: string; // якщо повідомлення від реального учасника команди (не вільного контакту)
}

export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly";

// A specific product (and optionally a specific sold code/item) from a
// supplier, attached to a task — e.g. "Xbox RU — код ABC123, клієнт каже не працює".
// Values are denormalized (supplierName/productTitle/itemCode) so the link still
// reads correctly even if the supplier or product is later renamed or removed.
export interface TaskLinkedProduct {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productTitle: string;
  itemId?: string; // конкретний код/ключ з items постачальника, якщо є
  itemCode?: string;
  issueNote?: string; // напр. "Не працює", "Клієнт скаржиться на бан"
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  priority: PriorityLevel;
  subTasks?: SubTask[];
  description?: string;
  counterparty?: string; // Опціональний вільний ввід імені контрагента
  images?: TaskImage[];
  voiceNotes?: VoiceNote[];
  tags?: string[]; // Теги ролей/відповідальних (напр. "Модератор", "Розробник")
  chatMessages?: TaskChatMessage[];
  assigneeId?: string; // ID члена команди, відповідального за завдання
  recurrence?: RecurrenceFrequency; // якщо задано (не "none"), при завершенні створюється наступне завдання
  linkedProducts?: TaskLinkedProduct[]; // прив'язані товари/коди від постачальників
  deletedAt?: string; // якщо задано — завдання у кошику, не показується в основних списках
}

export type TransactionType = "Income" | "Expense";

// Курс валюти вказується як "скільки [базової валюти] коштує 1 одиниця цієї
// валюти". Базова валюта завжди має курс 1 і зберігається в DatabaseState.baseCurrency.
export const DEFAULT_BASE_CURRENCY = "USD";
export const DEFAULT_CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  RUB: 0.0105, // орієнтовний курс, редагується в налаштуваннях валют
  UAH: 0.024
};

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency?: string; // за замовчуванням базова валюта, якщо не вказано
  category: string;
  description: string;
  date: string;
  counterparty?: string; // Опціональний вільний ввід імені контрагента
  taskId?: string; // Прив'язка до конкретного завдання
  supplierId?: string; // Прив'язка до конкретного постачальника
  deletedAt?: string; // якщо задано — транзакція у кошику
}

export interface CategoryItem {
  id: string;
  code: string;
  title?: string;
  currency?: string;
  price?: number;
  status: "Available" | "Sold";
  isAdded?: boolean;
  createdAt?: string;
  platform?: string;
}

export interface PriceHistoryEntry {
  id: string;
  price: number;
  currency?: string;
  changedAt: string; // ISO
}

export interface ProductCard {
  id: string;
  title: string;
  sku?: string;
  price?: number;
  notes?: string;
  currency?: string;
  count?: number;
  isAdded?: boolean;
  items?: CategoryItem[];
  platform?: string;
  priceHistory?: PriceHistoryEntry[]; // попередні ціни, найновіша перша
  deletedAt?: string; // якщо задано — товар у кошику, не показується в основних списках
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isClosed: boolean;
  products: ProductCard[];
  deletedAt?: string; // якщо задано — постачальник у кошику
}

// --- Team ---

export const TEAM_MEMBER_COLORS: string[] = [
  "#10B981", // emerald
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#A855F7", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#EF4444", // red
  "#84CC16"  // lime
];

export interface TeamMember {
  id: string;
  name: string;
  role: string; // вільний текст: посада/роль в команді
  color: string; // hex-колір аватарки, з TEAM_MEMBER_COLORS
}

// --- Activity Log ---

export type ActivityEntityType = "task" | "transaction" | "supplier" | "product" | "team" | "budget";

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO
  actorName: string; // ім'я члена команди на момент дії (або "Система")
  action: string; // напр. "Створив завдання", "Змінив статус"
  entityType: ActivityEntityType;
  entityTitle: string; // людяна назва того, що змінилось
  details?: string; // напр. "Очікує → В роботі"
}

// --- Budget planning ---

export interface BudgetPlan {
  id: string;
  month: string; // "YYYY-MM"
  category: string;
  type: TransactionType;
  plannedAmount: number;
}

// --- Task templates ---

export interface TaskTemplate {
  id: string;
  name: string; // назва шаблону, напр. "Прийняти партію товару"
  title: string; // заголовок завдання, що створюється
  description?: string;
  priority: PriorityLevel;
  subTaskTitles: string[]; // пункти чек-листа
  tags?: string[];
}

export interface DatabaseState {
  tasks: Task[];
  transactions: Transaction[];
  suppliers: Supplier[];
  teamMembers: TeamMember[];
  activityLog: ActivityLogEntry[];
  budgets: BudgetPlan[];
  taskTemplates: TaskTemplate[];
  baseCurrency: string; // валюта, до якої конвертуються всі підсумки (курс = 1)
  currencyRates: Record<string, number>; // "скільки baseCurrency коштує 1 одиниця валюти", ключ — код валюти
}
