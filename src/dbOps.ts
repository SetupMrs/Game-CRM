// Обчислення «що змінилось» між двома станами бази — для збереження лише
// змінених записів (POST /api/db/ops), а не всієї бази цілком.
//
// Працює на порівнянні посилань: усі обробники в застосунку оновлюють стан
// імутабельно ({ ...db, transactions: [...] }), тож незмінений запис має те
// саме посилання, а змінений/новий — нове. Це дешево навіть для великих баз.
//
// Важлива властивість: видаляються лише ті записи, які були в попередньому
// підтвердженому сервером стані (base) і зникли в новому. Записи, яких клієнт
// ніколи не бачив (додані іншими людьми чи фоновою синхронізацією), він
// видалити не може в принципі.
import { DatabaseState } from "./types";

// Колекції, які зберігаються на сервері (мають збігатися з DB_ARRAY_KEYS у server.ts).
export const DB_COLLECTION_KEYS = [
  "tasks",
  "transactions",
  "suppliers",
  "activityLog",
  "budgets",
  "taskTemplates",
  "steamWatches",
  "ggselCategories",
  "ggselItems",
  "financeAccounts",
  "transactionTemplates",
  "orders"
] as const;

export type CollectionOps = {
  upsert: any[];
  delete: string[];
  prepend: string[];
};

export type DbOpsPayload = {
  ops: Partial<Record<(typeof DB_COLLECTION_KEYS)[number], CollectionOps>>;
  settings?: { baseCurrency: string; currencyRates: Record<string, number> };
};

const hasId = (x: any): x is { id: string } =>
  !!x && typeof x === "object" && typeof x.id === "string" && x.id.length > 0;

export function buildDbOps(base: DatabaseState | null, target: DatabaseState): DbOpsPayload | null {
  const ops: DbOpsPayload["ops"] = {};

  for (const key of DB_COLLECTION_KEYS) {
    const after = (target as any)[key];
    const before = base ? (base as any)[key] : undefined;
    if (after === before) continue; // той самий масив — нічого не змінилось

    const afterArr: any[] = Array.isArray(after) ? after : [];
    const beforeArr: any[] = Array.isArray(before) ? before : [];

    const beforeById = new Map<string, any>();
    for (const item of beforeArr) if (hasId(item)) beforeById.set(item.id, item);

    const afterIds = new Set<string>();
    const upsert: any[] = [];
    for (const item of afterArr) {
      if (!hasId(item)) continue;
      afterIds.add(item.id);
      if (beforeById.get(item.id) !== item) upsert.push(item);
    }

    const del: string[] = [];
    for (const id of beforeById.keys()) if (!afterIds.has(id)) del.push(id);

    // Нові записи, які стоять ПЕРЕД першим уже відомим записом, — клієнт додав
    // їх «на початок» (журнал дій, нові товари ggsel/Steam). Сервер збереже цей порядок.
    const prepend: string[] = [];
    if (beforeById.size > 0) {
      for (const item of afterArr) {
        if (!hasId(item)) continue;
        if (beforeById.has(item.id)) break;
        prepend.push(item.id);
      }
    }

    if (upsert.length > 0 || del.length > 0) {
      ops[key] = { upsert, delete: del, prepend };
    }
  }

  const payload: DbOpsPayload = { ops };
  // Налаштування валют шлемо лише коли є з чим порівнювати й вони змінились —
  // щоб незавантажений стан ніколи не перезаписав справжні курси типовими.
  if (base && (base.baseCurrency !== target.baseCurrency || base.currencyRates !== target.currencyRates)) {
    payload.settings = { baseCurrency: target.baseCurrency, currencyRates: target.currencyRates };
  }

  if (Object.keys(ops).length === 0 && !payload.settings) return null;
  return payload;
}
