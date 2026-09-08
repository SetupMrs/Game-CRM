import React, { useMemo, useState } from "react";
import { Supplier, ProductCard, PriceHistoryEntry, CategoryItem, SteamWatchItem } from "../types";
import { formatDate } from "../utils";
import { Search, TrendingUp, TrendingDown, X, ChevronRight, ArrowLeft, Zap, Hand, Gamepad2, RefreshCw, Plus } from "lucide-react";

const STEAM_COUNTRY_LABELS: Record<string, string> = {
  ru: "Росія", ua: "Україна", kz: "Казахстан", by: "Білорусь", us: "США", gb: "Британія",
  de: "Німеччина", fr: "Франція", tr: "Туреччина", pl: "Польща", cz: "Чехія", in: "Індія",
  br: "Бразилія", ar: "Аргентина", mx: "Мексика", cl: "Чилі", co: "Колумбія", pe: "Перу",
  id: "Індонезія", ph: "Філіппіни", my: "Малайзія", sg: "Сінгапур", th: "Таїланд", vn: "В'єтнам",
  cn: "Китай", hk: "Гонконг", tw: "Тайвань", jp: "Японія", kr: "Корея", au: "Австралія",
  nz: "Н. Зеландія", ca: "Канада", il: "Ізраїль", sa: "С. Аравія", ae: "ОАЕ", za: "ПАР",
  no: "Норвегія", se: "Швеція", ch: "Швейцарія"
};

interface PricesManagerProps {
  suppliers: Supplier[];
  steamWatches: SteamWatchItem[];
  onAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string }>;
  onRemoveSteamWatch: (id: string) => void;
  onSyncSteamWatchNow: () => Promise<boolean>;
}

interface FlatProduct {
  supplierId: string;
  supplierName: string;
  product: ProductCard;
  region: string;
  source: "letskeys" | "manual";
  itemsCount: number;
  upCount: number;
  downCount: number;
  lastSyncedAt?: string;
}

type Trend = "up" | "down" | "none";

// Whether the current price moved up/down compared to the most recent
// previous price recorded in priceHistory[0]. Mirrors the logic used for the
// header's price-increase bell in App.tsx, but also flags decreases.
function priceTrend(current?: number, prevEntry?: PriceHistoryEntry, currentCurrency?: string): Trend {
  if (typeof current !== "number" || !prevEntry) return "none";
  const sameCurrency = (prevEntry.currency || currentCurrency || "USD") === (currentCurrency || "USD");
  if (!sameCurrency) return "none";
  if (current > prevEntry.price) return "up";
  if (current < prevEntry.price) return "down";
  return "none";
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return formatDate(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hh}:${mm}`;
  } catch {
    return formatDate(iso);
  }
}

export default function PricesManager({ suppliers, steamWatches, onAddSteamWatch, onRemoveSteamWatch, onSyncSteamWatchNow }: PricesManagerProps) {
  const [search, setSearch] = useState("");
  const [openProductKey, setOpenProductKey] = useState<string | null>(null);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [openItemKey, setOpenItemKey] = useState<string | null>(null);

  const flatProducts = useMemo<FlatProduct[]>(() => {
    const list: FlatProduct[] = [];
    (suppliers || []).forEach(s => {
      if (s.deletedAt) return;
      (s.products || []).forEach(p => {
        if (p.deletedAt) return;
        const items = p.items || [];
        let up = 0;
        let down = 0;

        items.forEach(item => {
          const t = priceTrend(item.price, item.priceHistory?.[0], item.currency);
          if (t === "up") up++;
          if (t === "down") down++;
        });

        if (items.length === 0 && typeof p.price === "number") {
          const t = priceTrend(p.price, p.priceHistory?.[0], p.currency);
          if (t === "up") up++;
          if (t === "down") down++;
        }

        list.push({
          supplierId: s.id,
          supplierName: s.name,
          product: p,
          region: p.externalRegion || p.currency || "—",
          source: p.externalSource === "letskeys" ? "letskeys" : "manual",
          itemsCount: items.length,
          upCount: up,
          downCount: down,
          lastSyncedAt: p.lastSyncedAt
        });
      });
    });

    // Products with fresh price changes float to the top, otherwise alphabetical.
    return list.sort((a, b) => {
      const aChanged = a.upCount + a.downCount > 0 ? 1 : 0;
      const bChanged = b.upCount + b.downCount > 0 ? 1 : 0;
      if (aChanged !== bChanged) return bChanged - aChanged;
      return a.product.title.localeCompare(b.product.title, "uk");
    });
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatProducts;

    // Relevance rank: lower is better. 0 = exact title match, 1 = title
    // starts with the query, 2 = title contains it, 3 = only the supplier
    // name matches, 4 = only an item's code/title matches.
    const rank = (fp: FlatProduct): number => {
      const title = fp.product.title.toLowerCase();
      if (title === q) return 0;
      if (title.startsWith(q)) return 1;
      if (title.includes(q)) return 2;
      if (fp.supplierName.toLowerCase().includes(q)) return 3;
      return 4;
    };

    return flatProducts
      .filter(fp => {
        if (fp.product.title.toLowerCase().includes(q)) return true;
        if (fp.supplierName.toLowerCase().includes(q)) return true;
        return (fp.product.items || []).some(
          it => (it.code && it.code.toLowerCase().includes(q)) || (it.title && it.title.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.product.title.localeCompare(b.product.title, "uk");
      });
  }, [flatProducts, search]);

  const stats = useMemo(() => {
    let up = 0;
    let down = 0;
    flatProducts.forEach(fp => {
      up += fp.upCount;
      down += fp.downCount;
    });
    return { total: flatProducts.length, up, down };
  }, [flatProducts]);

  const openProduct = flatProducts.find(fp => `${fp.supplierId}:${fp.product.id}` === openProductKey) || null;

  const closeAll = () => {
    setOpenProductKey(null);
    setOpenGroupKey(null);
    setOpenItemKey(null);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase font-bold">Товарів під наглядом</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase font-bold">Подорожчали номінали</p>
          <p className="text-2xl font-bold text-amber-400 mt-1 flex items-center gap-1.5">
            <TrendingUp className="w-5 h-5" /> {stats.up}
          </p>
        </div>
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase font-bold">Подешевшали номінали</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <TrendingDown className="w-5 h-5" /> {stats.down}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Пошук товару, постачальника або коду номіналу..."
          className="w-full bg-[#111112] border border-white/5 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-600/50"
        />
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#111112] rounded-xl border border-dashed border-white/5 text-gray-500 text-sm">
          {flatProducts.length === 0
            ? "Поки що немає товарів для відстеження цін."
            : `Нічого не знайдено за запитом "${search}".`}
        </div>
      ) : (
        <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
          {filtered.map(fp => {
            const key = `${fp.supplierId}:${fp.product.id}`;
            const changed = fp.upCount + fp.downCount > 0;
            return (
              <button
                key={key}
                onClick={() => setOpenProductKey(key)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer ${
                  changed ? "bg-amber-500/[0.02]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm truncate max-w-[220px] sm:max-w-xs">{fp.product.title}</span>
                    <span className="bg-white/5 text-gray-400 border border-white/10 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0">
                      {fp.region}
                    </span>
                    {fp.source === "letskeys" ? (
                      <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm flex items-center gap-1 shrink-0">
                        <Zap className="w-2.5 h-2.5" /> LetsKeys API
                      </span>
                    ) : (
                      <span className="bg-white/5 text-gray-400 border border-white/10 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm flex items-center gap-1 shrink-0">
                        <Hand className="w-2.5 h-2.5" /> Вручну
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {fp.supplierName} ·{" "}
                    {fp.itemsCount > 0 ? `${fp.itemsCount} номінал${fp.itemsCount === 1 ? "" : fp.itemsCount < 5 ? "и" : "ів"}` : "ціна товару"}
                    {fp.lastSyncedAt && ` · синхр. ${formatDate(fp.lastSyncedAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {fp.upCount > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400 text-xs font-bold font-mono" title="Кількість номіналів, що подорожчали">
                      <TrendingUp className="w-3.5 h-3.5" /> {fp.upCount}
                    </span>
                  )}
                  {fp.downCount > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-bold font-mono" title="Кількість номіналів, що подешевшали">
                      <TrendingDown className="w-3.5 h-3.5" /> {fp.downCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Product nominals / price history modal */}
      {openProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeAll}>
          <div
            className="bg-[#161618] border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{openProduct.product.title}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {openProduct.supplierName} · {openProduct.region}
                </p>
              </div>
              <button onClick={closeAll} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer shrink-0">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {openItemKey ? (
                <ItemHistoryView
                  product={openProduct.product}
                  itemKey={openItemKey}
                  onBack={() => setOpenItemKey(null)}
                />
              ) : openGroupKey ? (
                <GroupSourcesView
                  product={openProduct.product}
                  groupKey={openGroupKey}
                  onSelectItem={key => setOpenItemKey(key)}
                  onBack={() => setOpenGroupKey(null)}
                />
              ) : (
                <NominalsList
                  product={openProduct.product}
                  onSelectItem={key => setOpenItemKey(key)}
                  onSelectGroup={key => setOpenGroupKey(key)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-white/5 pt-4">
        <SteamWatchSection
          steamWatches={steamWatches}
          onAdd={onAddSteamWatch}
          onRemove={onRemoveSteamWatch}
          onSyncNow={onSyncSteamWatchNow}
        />
      </div>
    </div>
  );
}

// --- Grouping identical nominals (same name/currency) coming from several
// underlying LetsKeys suppliers, so they don't look like accidental duplicates.

function nominalGroupKey(title: string, currency?: string): string {
  return `${title.trim().toLowerCase()}|${(currency || "USD").toLowerCase()}`;
}

interface NominalGroup {
  key: string;
  title: string;
  currency: string;
  items: CategoryItem[];
}

function buildNominalGroups(product: ProductCard): NominalGroup[] {
  const items = product.items || [];
  const byKey: Record<string, NominalGroup> = {};
  const order: string[] = [];
  items.forEach(item => {
    const title = item.title || product.title;
    const currency = item.currency || "USD";
    const key = nominalGroupKey(title, currency);
    if (!byKey[key]) {
      byKey[key] = { key, title, currency, items: [] };
      order.push(key);
    }
    byKey[key].items.push(item);
  });
  return order.map(k => byKey[k]);
}

// --- Nominals list inside the modal -----------------------------------------

function NominalsList({
  product,
  onSelectItem,
  onSelectGroup
}: {
  product: ProductCard;
  onSelectItem: (key: string) => void;
  onSelectGroup: (key: string) => void;
}) {
  const items = product.items || [];

  if (items.length === 0) {
    if (typeof product.price === "number") {
      const trend = priceTrend(product.price, product.priceHistory?.[0], product.currency);
      return (
        <div className="p-2">
          <PriceRow
            title={product.title}
            price={product.price}
            currency={product.currency}
            trend={trend}
            prevEntry={product.priceHistory?.[0]}
            source={product.externalSource === "letskeys" ? "letskeys" : "manual"}
            onClick={() => onSelectItem("own")}
          />
        </div>
      );
    }
    return <p className="text-center text-gray-500 text-sm py-10">У цього товару ще немає ціни.</p>;
  }

  const groups = buildNominalGroups(product);

  return (
    <div className="divide-y divide-white/5">
      {groups.map(group => {
        if (group.items.length === 1) {
          const item = group.items[0];
          const trend = priceTrend(item.price, item.priceHistory?.[0], item.currency);
          return (
            <PriceRow
              key={group.key}
              title={item.title || product.title}
              code={item.code}
              price={item.price}
              currency={item.currency}
              trend={trend}
              prevEntry={item.priceHistory?.[0]}
              source={Boolean(item.externalVariationId) && product.externalSource === "letskeys" ? "letskeys" : "manual"}
              onClick={() => onSelectItem(item.id)}
            />
          );
        }

        // Several LetsKeys variations share this exact denomination — show the
        // cheapest current offer and let the person drill into "who has it".
        const cheapest = group.items.reduce((min, it) =>
          typeof it.price === "number" && (typeof min.price !== "number" || it.price < min.price) ? it : min
        , group.items[0]);
        const trend = priceTrend(cheapest.price, cheapest.priceHistory?.[0], cheapest.currency);
        return (
          <PriceRow
            key={group.key}
            title={group.title}
            price={cheapest.price}
            currency={group.currency}
            trend={trend}
            prevEntry={cheapest.priceHistory?.[0]}
            source="letskeys"
            sourceCount={group.items.length}
            onClick={() => onSelectGroup(group.key)}
          />
        );
      })}
    </div>
  );
}

// --- Pick which of several suppliers behind one nominal to inspect ----------

function GroupSourcesView({
  product,
  groupKey,
  onSelectItem,
  onBack
}: {
  product: ProductCard;
  groupKey: string;
  onSelectItem: (key: string) => void;
  onBack: () => void;
}) {
  const groups = useMemo(() => buildNominalGroups(product), [product]);
  const group = groups.find(g => g.key === groupKey);

  if (!group) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Назад до номіналів
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Назад до номіналів
      </button>
      <div>
        <p className="text-sm font-bold text-white">{group.title}</p>
        <p className="text-[11px] text-gray-500">
          Цей номінал доступний одразу від {group.items.length} постачальників LetsKeys — оберіть, чию ціну переглянути.
        </p>
      </div>
      <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
        {group.items.map(item => {
          const trend = priceTrend(item.price, item.priceHistory?.[0], item.currency);
          return (
            <PriceRow
              key={item.id}
              title={item.title || group.title}
              code={item.code}
              price={item.price}
              currency={item.currency}
              trend={trend}
              prevEntry={item.priceHistory?.[0]}
              source={Boolean(item.externalVariationId) && product.externalSource === "letskeys" ? "letskeys" : "manual"}
              onClick={() => onSelectItem(item.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface PriceRowProps {
  key?: React.Key;
  title: string;
  code?: string;
  price?: number;
  currency?: string;
  trend: Trend;
  prevEntry?: PriceHistoryEntry;
  source: "letskeys" | "manual" | "steam";
  sourceCount?: number;
  onClick: () => void;
}

function PriceRow({ title, code, price, currency, trend, prevEntry, source, sourceCount, onClick }: PriceRowProps) {
  const diff = trend !== "none" && prevEntry && typeof price === "number" ? price - prevEntry.price : 0;
  const pct = trend !== "none" && prevEntry && prevEntry.price > 0 ? Math.round((diff / prevEntry.price) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer rounded-lg ${
        trend === "up" ? "bg-amber-500/5" : trend === "down" ? "bg-emerald-500/5" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium truncate max-w-[220px]">{title}</span>
          {source === "letskeys" ? (
            <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0">
              API
            </span>
          ) : source === "steam" ? (
            <span className="bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0">
              Steam
            </span>
          ) : (
            <span className="bg-white/5 text-gray-400 border border-white/10 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0">
              Вручну
            </span>
          )}
          {sourceCount && sourceCount > 1 && (
            <span
              className="bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0"
              title="Скільки різних постачальників LetsKeys продають цей самий номінал"
            >
              {sourceCount} постачальники
            </span>
          )}
        </div>
        {code && <span className="text-[10px] font-mono text-gray-500">{code}</span>}
      </div>
      <div className="text-right shrink-0">
        {typeof price === "number" ? (
          <>
            <p
              className={`text-sm font-bold font-mono ${
                trend === "up" ? "text-amber-400" : trend === "down" ? "text-emerald-400" : "text-white"
              }`}
            >
              {price} {currency || "USD"}
            </p>
            {trend !== "none" && (
              <p className={`text-[10px] font-mono ${trend === "up" ? "text-amber-500/70" : "text-emerald-500/70"}`}>
                {trend === "up" ? "↑" : "↓"} {trend === "up" ? "+" : ""}
                {diff} ({trend === "up" ? "+" : ""}
                {pct}%)
              </p>
            )}
            {sourceCount && sourceCount > 1 && trend === "none" && <p className="text-[10px] text-gray-600">найдешевше</p>}
          </>
        ) : (
          <p className="text-xs text-gray-600">—</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
    </button>
  );
}

// --- Price history + chart for a single nominal -----------------------------

function ItemHistoryView({ product, itemKey, onBack }: { product: ProductCard; itemKey: string; onBack: () => void }) {
  const item = itemKey === "own" ? null : (product.items || []).find(i => i.id === itemKey) || null;
  const title = itemKey === "own" ? product.title : item?.title || product.title;
  const code = itemKey === "own" ? undefined : item?.code;
  const currentPrice = itemKey === "own" ? product.price : item?.price;
  const currency = (itemKey === "own" ? product.currency : item?.currency) || "USD";
  const history = (itemKey === "own" ? product.priceHistory : item?.priceHistory) || [];

  // priceHistory[0] is the most recent *previous* price, with changedAt being
  // the moment it stopped being the price — so oldest-first here gives a
  // correct chronological read, ending with "today" at the current price.
  const points = useMemo(() => {
    const sorted = [...history].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    const pts = sorted.map(h => ({ date: h.changedAt, price: h.price }));
    if (typeof currentPrice === "number") {
      pts.push({ date: new Date().toISOString(), price: currentPrice });
    }
    return pts;
  }, [history, currentPrice]);

  // Newest-first, for the chronology list under the chart.
  const timelineDesc = useMemo(() => [...points].reverse(), [points]);

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Назад до номіналів
      </button>

      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        {code && <p className="text-[10px] font-mono text-gray-500">{code}</p>}
      </div>

      {points.length < 2 ? (
        <p className="text-center text-gray-500 text-sm py-8">
          Історія змін ціни поки що порожня — зміни зʼявляться тут після першого коригування ціни.
        </p>
      ) : (
        <PriceChart points={points} currency={currency} />
      )}

      {points.length > 0 && (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-[#111112] text-[9px] font-bold text-gray-400 uppercase border-b border-white/5">
            Хронологія (від сьогодні)
          </div>
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
            {timelineDesc.map((p, i) => {
              // points is oldest-first, timelineDesc is newest-first — the
              // chronologically-previous price sits right after this one here.
              const prevChrono = timelineDesc[i + 1];
              const diff = prevChrono ? p.price - prevChrono.price : 0;
              return (
                <div key={p.date + i} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-gray-400">{i === 0 ? "Сьогодні / поточна" : formatDateTime(p.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-white">
                      {p.price} {currency}
                    </span>
                    {prevChrono && diff !== 0 && (
                      <span className={`text-[10px] font-mono ${diff > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {diff > 0 ? "↑" : "↓"} {diff > 0 ? "+" : ""}
                        {diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Minimal dependency-free SVG line chart ---------------------------------

function PriceChart({ points, currency }: { points: { date: string; price: number }[]; currency: string }) {
  const width = 560;
  const height = 160;
  const padding = 28;

  const prices = points.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const coords = points.map((p, i) => {
    const x = points.length > 1 ? padding + (i / (points.length - 1)) * (width - padding * 2) : width / 2;
    const y = height - padding - ((p.price - minP) / range) * (height - padding * 2);
    return { x, y, price: p.price };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const lastUp = coords.length > 1 && coords[coords.length - 1].price >= coords[coords.length - 2].price;
  const lineColor = lastUp ? "#f59e0b" : "#10b981";

  return (
    <div className="bg-[#111112] border border-white/5 rounded-xl p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 3.5 : 2.5}
            fill={i === coords.length - 1 ? lineColor : "#6b7280"}
          />
        ))}
        <text x={padding} y={14} fontSize="9" fill="#6b7280">
          {maxP} {currency}
        </text>
        <text x={padding} y={height - padding + 12} fontSize="9" fill="#6b7280">
          {minP} {currency}
        </text>
      </svg>
      <div className="flex justify-between text-[9px] text-gray-600 px-1 mt-1">
        <span>{formatDate(points[0].date)}</span>
        <span>сьогодні</span>
      </div>
    </div>
  );
}

// --- External Steam price watch (separate data source, not tied to suppliers) ---

function SteamWatchSection({
  steamWatches,
  onAdd,
  onRemove,
  onSyncNow
}: {
  steamWatches: SteamWatchItem[];
  onAdd: (input: string) => Promise<{ success: boolean; message?: string }>;
  onRemove: (id: string) => void;
  onSyncNow: () => Promise<boolean>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openWatchId, setOpenWatchId] = useState<string | null>(null);
  const [openCountryId, setOpenCountryId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await onAdd(input.trim());
    setBusy(false);
    if (result.success) {
      setInput("");
      setShowAddForm(false);
    } else {
      setError(result.message || "Не вдалося додати товар.");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await onSyncNow();
    // The sync runs in the background on the server — this is just a short
    // visual acknowledgement, not a wait for the actual result.
    setTimeout(() => setSyncing(false), 1500);
  };

  const openWatch = steamWatches.find(w => w.id === openWatchId) || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-gray-500" />
          <p className="text-sm font-bold text-white">Зовнішні ціни (Steam)</p>
        </div>
        <div className="flex items-center gap-3">
          {steamWatches.length > 0 && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> Оновити зараз
            </button>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="text-xs bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Додати
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-[#111112] border border-white/5 rounded-xl p-3 space-y-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Встав посилання store.steampowered.com/sub/... або сам package id"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-600/50"
            onKeyDown={e => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {busy ? "Шукаю..." : "Додати"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setError(null);
              }}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {steamWatches.length === 0 && !showAddForm ? (
        <p className="text-xs text-gray-500 py-2">Ще немає товарів у спостереженні.</p>
      ) : (
        <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
          {steamWatches.map(watch => {
            let up = 0;
            let down = 0;
            (watch.prices || []).forEach(p => {
              const t = priceTrend(p.price, p.priceHistory?.[0], p.currency);
              if (t === "up") up++;
              if (t === "down") down++;
            });
            return (
              <div key={watch.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <button onClick={() => setOpenWatchId(watch.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm truncate max-w-[220px] sm:max-w-xs">{watch.title}</span>
                    <span className="bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0">
                      Steam
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {(watch.prices || []).length} кра{(watch.prices || []).length === 1 ? "їна" : "їн"}
                    {watch.lastSyncedAt && ` · синхр. ${formatDate(watch.lastSyncedAt)}`}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {up > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400 text-xs font-bold font-mono">
                      <TrendingUp className="w-3.5 h-3.5" /> {up}
                    </span>
                  )}
                  {down > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-bold font-mono">
                      <TrendingDown className="w-3.5 h-3.5" /> {down}
                    </span>
                  )}
                  <button
                    onClick={() => onRemove(watch.id)}
                    className="p-1 hover:bg-white/5 rounded cursor-pointer"
                    title="Прибрати зі спостереження"
                  >
                    <X className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-600 cursor-pointer" onClick={() => setOpenWatchId(watch.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openWatch && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setOpenWatchId(null);
            setOpenCountryId(null);
          }}
        >
          <div
            className="bg-[#161618] border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{openWatch.title}</p>
                <p className="text-[11px] text-gray-500">Steam package #{openWatch.packageId}</p>
              </div>
              <button
                onClick={() => {
                  setOpenWatchId(null);
                  setOpenCountryId(null);
                }}
                className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {openCountryId ? (
                (() => {
                  const entry = (openWatch.prices || []).find(p => p.id === openCountryId);
                  if (!entry) return null;
                  const label = STEAM_COUNTRY_LABELS[entry.countryCode] || entry.countryCode.toUpperCase();
                  return (
                    <GenericHistoryView
                      title={`${openWatch.title} · ${label}`}
                      currency={entry.currency || "USD"}
                      currentPrice={entry.price}
                      history={entry.priceHistory || []}
                      onBack={() => setOpenCountryId(null)}
                    />
                  );
                })()
              ) : (
                <div className="divide-y divide-white/5">
                  {(openWatch.prices || []).map(entry => {
                    const trend = priceTrend(entry.price, entry.priceHistory?.[0], entry.currency);
                    const label = STEAM_COUNTRY_LABELS[entry.countryCode] || entry.countryCode.toUpperCase();
                    return (
                      <PriceRow
                        key={entry.id}
                        title={label}
                        price={entry.price}
                        currency={entry.currency}
                        trend={trend}
                        prevEntry={entry.priceHistory?.[0]}
                        source="steam"
                        onClick={() => setOpenCountryId(entry.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Generic price history view (source-agnostic version of ItemHistoryView,
// used for Steam watch entries which aren't tied to a ProductCard/CategoryItem) ---

function GenericHistoryView({
  title,
  currency,
  currentPrice,
  history,
  onBack
}: {
  title: string;
  currency: string;
  currentPrice?: number;
  history: PriceHistoryEntry[];
  onBack: () => void;
}) {
  const points = useMemo(() => {
    const sorted = [...history].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    const pts = sorted.map(h => ({ date: h.changedAt, price: h.price }));
    if (typeof currentPrice === "number") {
      pts.push({ date: new Date().toISOString(), price: currentPrice });
    }
    return pts;
  }, [history, currentPrice]);

  const timelineDesc = useMemo(() => [...points].reverse(), [points]);

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Назад
      </button>

      <p className="text-sm font-bold text-white">{title}</p>

      {points.length < 2 ? (
        <p className="text-center text-gray-500 text-sm py-8">
          Історія змін ціни поки що порожня — зміни зʼявляться тут після першого коригування ціни.
        </p>
      ) : (
        <PriceChart points={points} currency={currency} />
      )}

      {points.length > 0 && (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-[#111112] text-[9px] font-bold text-gray-400 uppercase border-b border-white/5">
            Хронологія (від сьогодні)
          </div>
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
            {timelineDesc.map((p, i) => {
              const prevChrono = timelineDesc[i + 1];
              const diff = prevChrono ? p.price - prevChrono.price : 0;
              return (
                <div key={p.date + i} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-gray-400">{i === 0 ? "Сьогодні / поточна" : formatDateTime(p.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-white">
                      {p.price} {currency}
                    </span>
                    {prevChrono && diff !== 0 && (
                      <span className={`text-[10px] font-mono ${diff > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {diff > 0 ? "↑" : "↓"} {diff > 0 ? "+" : ""}
                        {diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

