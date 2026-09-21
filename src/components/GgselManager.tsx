import React, { useEffect, useState } from "react";
import { GgselCategory, GgselWatchItem, SteamWatchItem, PriceHistoryEntry, Supplier, ProductCard, CategoryItem } from "../types";
import { computeGgselSuggestedPrice } from "../utils";
import { apiFetch } from "../apiClient";
import { Plus, X, Check, Trash2, AlertTriangle, Pencil, Search, ChevronRight, ArrowLeft, Package, Pause, Play, Star, Calculator, RefreshCw } from "lucide-react";

const STEAM_COUNTRY_LABELS: Record<string, string> = {
  ru: "Росія", ua: "Україна", kz: "Казахстан", by: "Білорусь", us: "США", gb: "Британія",
  de: "Німеччина", fr: "Франція", tr: "Туреччина", pl: "Польща", cz: "Чехія", in: "Індія",
  br: "Бразилія", ar: "Аргентина", mx: "Мексика", cl: "Чилі", co: "Колумбія", pe: "Перу",
  id: "Індонезія", ph: "Філіппіни", my: "Малайзія", sg: "Сінгапур", th: "Таїланд", vn: "В'єтнам",
  cn: "Китай", hk: "Гонконг", tw: "Тайвань", jp: "Японія", kr: "Корея", au: "Австралія",
  nz: "Н. Зеландія", ca: "Канада", il: "Ізраїль", sa: "С. Аравія", ae: "ОАЕ", za: "ПАР",
  no: "Норвегія", se: "Швеція", ch: "Швейцарія"
};

interface GgselManagerProps {
  categories: GgselCategory[];
  items: GgselWatchItem[];
  steamWatches: SteamWatchItem[];
  suppliers: Supplier[];
  onAddCategory: (name: string, defaultUsdToRubRate?: number) => void;
  onUpdateCategoryRate: (id: string, defaultUsdToRubRate: number | undefined) => void;
  onRemoveCategory: (id: string) => void;
  onAddItem: (item: Omit<GgselWatchItem, "id" | "addedAt">) => void;
  onAddItems: (items: Omit<GgselWatchItem, "id" | "addedAt">[]) => void;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      title?: string;
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemoveItem: (id: string) => void;
  onTogglePaused: (id: string) => void;
  onSetMainNominal: (id: string) => void;
  onUpdateGroupTitle: (itemIds: string[], newTitle: string) => void;
  onSyncOneSteamWatch: (packageId: string) => Promise<{ success: boolean; changed?: boolean; message?: string }>;
  onLookupOrAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string; watch?: SteamWatchItem }>;
}

function steamPriceTrend(current?: number, prevEntry?: PriceHistoryEntry): "up" | "down" | "none" {
  if (typeof current !== "number" || !prevEntry) return "none";
  if (current > prevEntry.price) return "up";
  if (current < prevEntry.price) return "down";
  return "none";
}

// USD deliberately stays manual — the person tracks their own ggsel exchange
// rate for it. Every other currency converts automatically via a live rate
// when we have one, falling back to a manual override if we don't.
// Знаходить поточну ціну/валюту/історію товару ggsel незалежно від того, чи
// він прив'язаний до Steam, чи до власного каталогу (LetsKeys). Це єдина
// точка правди, звідки картка й розрахунок беруть "живі" дані.
function resolveGgselPriceSource(
  item: GgselWatchItem,
  steamWatches: SteamWatchItem[],
  suppliers: Supplier[]
): { price?: number; currency: string; priceHistory?: PriceHistoryEntry[]; label: string; inStock?: boolean } {
  if (item.sourceType === "catalog") {
    const supplier = suppliers.find(s => s.id === item.catalogSupplierId);
    const product = supplier?.products.find(p => p.id === item.catalogProductId);
    const nominal = product?.items?.find(i => i.id === item.catalogItemId);
    return {
      price: nominal?.price,
      currency: nominal?.currency || product?.currency || "USD",
      priceHistory: nominal?.priceHistory,
      label: product ? `${product.title}${supplier ? " · " + supplier.name : ""}` : "Товар видалено з каталогу",
      inStock: nominal?.externalInStock
    };
  }
  const watch = steamWatches.find(w => w.packageId === item.steamPackageId);
  const entry = watch?.prices.find(p => p.countryCode === item.steamCountryCode);
  return {
    price: entry?.price,
    currency: entry?.currency || "USD",
    priceHistory: entry?.priceHistory,
    label: watch ? `Steam (${STEAM_COUNTRY_LABELS[item.steamCountryCode || ""] || item.steamCountryCode})` : "Steam"
  };
}

function convertToRub(
  price: number,
  currency: string,
  manualRate: number | undefined,
  rubRates: Record<string, number>
): number | undefined {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "RUB") return price;
  if (cur === "USD") return typeof manualRate === "number" ? price * manualRate : undefined;
  const liveRate = rubRates[cur];
  if (typeof liveRate === "number") return price * liveRate;
  return typeof manualRate === "number" ? price * manualRate : undefined;
}

function usesManualRate(currency: string, rubRates: Record<string, number>): boolean {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "RUB") return false;
  if (cur === "USD") return true;
  return typeof rubRates[cur] !== "number";
}

// Рекомендована ціна товару в рублях за курсом+комісіями+% — та сама
// формула, що й у картці, винесена окремо для групового калькулятора.
function computeItemSuggestedRub(
  item: GgselWatchItem,
  steamWatches: SteamWatchItem[],
  suppliers: Supplier[],
  rubRates: Record<string, number>,
  categoryDefaultRate: number | undefined
): number | undefined {
  const source = resolveGgselPriceSource(item, steamWatches, suppliers);
  if (typeof source.price !== "number") return undefined;
  const effectiveRate = item.exchangeRate ?? categoryDefaultRate;
  const baseRub = convertToRub(source.price, source.currency, effectiveRate, rubRates);
  if (typeof baseRub !== "number") return undefined;
  return computeGgselSuggestedPrice(baseRub, item.commission1Percent, item.commission2Percent, item.myMarginPercent);
}

function ggselGroupKey(item: GgselWatchItem): string {
  return item.sourceType === "catalog" ? `catalog:${item.catalogProductId}` : `steam:${item.steamPackageId}`;
}

// Для списку вибору країни: показуємо одразу в рублях, де можемо
// автоматично конвертувати (усе, крім долара). Долар лишається у своїй
// валюті, бо курс для нього користувач вводить вручну сам — заздалегідь
// авто-конвертувати нема з чого.
function formatDropdownPrice(price: number, currency: string, rubRates: Record<string, number>): string {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "RUB") return `${price.toFixed(2)} ₽`;
  if (cur === "USD") return `${price} USD (курс вручну)`;
  const liveRate = rubRates[cur];
  if (typeof liveRate === "number") return `≈${(price * liveRate).toFixed(2)} ₽`;
  return `${price} ${cur} (курс вручну)`;
}

const inputClass =
  "w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-600/50";
const labelClass = "text-[9px] text-gray-500 uppercase font-bold block mb-1";

export default function GgselManager({
  categories,
  items,
  steamWatches,
  suppliers,
  onAddCategory,
  onUpdateCategoryRate,
  onRemoveCategory,
  onAddItem,
  onAddItems,
  onUpdateItem,
  onUpdatePrice,
  onSaveItemDetails,
  onRemoveItem,
  onTogglePaused,
  onSetMainNominal,
  onUpdateGroupTitle,
  onSyncOneSteamWatch,
  onLookupOrAddSteamWatch
}: GgselManagerProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categories[0]?.id || null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [viewMode, setViewMode] = useState<"categories" | "calculator">("categories");
  const [rubRates, setRubRates] = useState<Record<string, number>>({});

  useEffect(() => {
    apiFetch("/api/steam-watch/rub-rates")
      .then(res => res.json())
      .then(data => {
        if (data?.status === "success" && data.rates) setRubRates(data.rates);
      })
      .catch(() => {
        /* if this fails, the calculator just falls back to manual rates everywhere */
      });
  }, []);

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    } else if (selectedCategoryId && !categories.find(c => c.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0]?.id || null);
    }
  }, [categories, selectedCategoryId]);

  const allCategoryItems = items.filter(i => i.categoryId === selectedCategoryId);
  const pausedCategoryItems = allCategoryItems.filter(i => i.isPaused);
  const activeCategoryItems = allCategoryItems.filter(i => !i.isPaused);
  const categoryItems = showPaused ? pausedCategoryItems : activeCategoryItems;
  const selectedCategory = categories.find(c => c.id === selectedCategoryId) || null;
  const [newCategoryRate, setNewCategoryRate] = useState("");
  const [isEditingCategoryRate, setIsEditingCategoryRate] = useState(false);
  const [categoryRateInput, setCategoryRateInput] = useState("");

  const handleAddCategorySubmit = () => {
    if (!newCategoryName.trim()) return;
    const rate = newCategoryRate ? parseFloat(newCategoryRate.replace(",", ".")) : undefined;
    onAddCategory(newCategoryName.trim(), rate && !isNaN(rate) ? rate : undefined);
    setNewCategoryName("");
    setNewCategoryRate("");
    setShowAddCategory(false);
  };

  const handleRemoveCategory = () => {
    if (!selectedCategoryId) return;
    const cat = categories.find(c => c.id === selectedCategoryId);
    const count = items.filter(i => i.categoryId === selectedCategoryId).length;
    const msg = count > 0
      ? `Видалити категорію "${cat?.name}" разом з ${count} товар(ами) у ній? Це незворотно.`
      : `Видалити категорію "${cat?.name}"?`;
    if (window.confirm(msg)) {
      onRemoveCategory(selectedCategoryId);
    }
  };

  const openCategoryRateEditor = () => {
    setCategoryRateInput(selectedCategory?.defaultUsdToRubRate != null ? String(selectedCategory.defaultUsdToRubRate) : "");
    setIsEditingCategoryRate(true);
  };

  const saveCategoryRate = () => {
    if (!selectedCategoryId) return;
    const rate = categoryRateInput ? parseFloat(categoryRateInput.replace(",", ".")) : undefined;
    onUpdateCategoryRate(selectedCategoryId, rate && !isNaN(rate) ? rate : undefined);
    setIsEditingCategoryRate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button
          onClick={() => setViewMode("categories")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold ${
            viewMode === "categories" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          Категорії
        </button>
        <button
          onClick={() => setViewMode("calculator")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold flex items-center gap-1.5 ${
            viewMode === "calculator" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          <Calculator className="w-3.5 h-3.5" /> Калькулятор
        </button>
      </div>

      {viewMode === "calculator" ? (
        <GgselStandaloneCalculator suppliers={suppliers} steamWatches={steamWatches} rubRates={rubRates} onLookupOrAddSteamWatch={onLookupOrAddSteamWatch} />
      ) : (
      <>
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategoryId(cat.id);
              setShowPaused(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              selectedCategoryId === cat.id
                ? "bg-emerald-600 text-white"
                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            {cat.name}
          </button>
        ))}

        {showAddCategory ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleAddCategorySubmit();
                if (e.key === "Escape") {
                  setShowAddCategory(false);
                  setNewCategoryName("");
                  setNewCategoryRate("");
                }
              }}
              placeholder="Назва категорії"
              className="bg-[#111112] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-600/50 w-36"
            />
            <input
              value={newCategoryRate}
              onChange={e => setNewCategoryRate(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleAddCategorySubmit();
              }}
              placeholder="Курс $→₽ (необов'язково)"
              inputMode="decimal"
              title="Спільний курс долара до рубля для всіх товарів цієї категорії — щоб не вводити на кожному товарі окремо. Можна задати або змінити пізніше."
              className="bg-[#111112] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-600/50 w-40"
            />
            <button onClick={handleAddCategorySubmit} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer">
              <Check className="w-3.5 h-3.5 text-white" />
            </button>
            <button
              onClick={() => {
                setShowAddCategory(false);
                setNewCategoryName("");
                setNewCategoryRate("");
              }}
              className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddCategory(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Категорія
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          Спочатку додай категорію (наприклад "Steam Gift"), щоб почати додавати товари.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => setShowPaused(false)}
                  className={`text-xs px-2.5 py-1 rounded-md cursor-pointer font-semibold transition-colors ${
                    !showPaused ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Активні ({activeCategoryItems.length})
                </button>
                <button
                  onClick={() => setShowPaused(true)}
                  className={`text-xs px-2.5 py-1 rounded-md cursor-pointer font-semibold transition-colors ${
                    showPaused ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Призупинені ({pausedCategoryItems.length})
                </button>
              </div>
              {isEditingCategoryRate ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">Курс $→₽:</span>
                  <input
                    autoFocus
                    value={categoryRateInput}
                    onChange={e => setCategoryRateInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveCategoryRate();
                      if (e.key === "Escape") setIsEditingCategoryRate(false);
                    }}
                    placeholder="напр. 95"
                    inputMode="decimal"
                    className="bg-black/30 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white w-20 focus:outline-none focus:border-emerald-600/50"
                  />
                  <button onClick={saveCategoryRate} className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded cursor-pointer">
                    <Check className="w-3 h-3 text-white" />
                  </button>
                  <button onClick={() => setIsEditingCategoryRate(false)} className="p-1 hover:bg-white/5 rounded cursor-pointer">
                    <X className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={openCategoryRateEditor}
                  className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1 cursor-pointer"
                  title="Спільний курс долара до рубля для всіх товарів цієї категорії"
                >
                  <Pencil className="w-3 h-3" />
                  {selectedCategory?.defaultUsdToRubRate
                    ? `Курс категорії: $1 = ${selectedCategory.defaultUsdToRubRate} ₽`
                    : "Задати курс $→₽ для категорії"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRemoveCategory}
                className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Видалити категорію
              </button>
              <button
                onClick={() => setShowAddItem(v => !v)}
                className="text-xs bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Додати товар
              </button>
            </div>
          </div>

          {showAddItem && selectedCategoryId && (
            <AddGgselItemPanel
              categoryId={selectedCategoryId}
              rubRates={rubRates}
              categoryDefaultRate={selectedCategory?.defaultUsdToRubRate}
              suppliers={suppliers}
              onLookupOrAddSteamWatch={onLookupOrAddSteamWatch}
              onAddItem={onAddItem}
              onAddItems={onAddItems}
              onClose={() => setShowAddItem(false)}
            />
          )}

          {categoryItems.length === 0 && !showAddItem ? (
            <p className="text-xs text-gray-500 py-6 text-center">
              {showPaused ? "Немає призупинених товарів." : "Ще немає товарів у цій категорії."}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
              {(() => {
                // Групуємо номінали одного й того ж товару/пакета в одну
                // об'єднану картку замість того, щоб розсипати їх окремими
                // картками по сітці. У режимі "Активні" призупинений номінал
                // усередині товару, де є хоч один активний, не зникає — його
                // видно приглушеним прямо в тій самій картці товару.
                const sourceItems = showPaused ? categoryItems : allCategoryItems;
                const groups: Record<string, GgselWatchItem[]> = {};
                const order: string[] = [];
                sourceItems.forEach(item => {
                  const key = ggselGroupKey(item);
                  if (!groups[key]) {
                    groups[key] = [];
                    order.push(key);
                  }
                  groups[key].push(item);
                });
                const visibleKeys = order.filter(key => {
                  const groupItems = groups[key];
                  return showPaused ? groupItems.some(i => i.isPaused) : groupItems.some(i => !i.isPaused);
                });
                return visibleKeys.map(key => {
                  const groupItems = groups[key];
                  if (groupItems.length === 1) {
                    const item = groupItems[0];
                    return (
                      <GgselItemCard
                        key={item.id}
                        item={item}
                        steamWatches={steamWatches}
                        suppliers={suppliers}
                        rubRates={rubRates}
                        categoryDefaultRate={selectedCategory?.defaultUsdToRubRate}
                        onUpdateItem={onUpdateItem}
                        onSaveItemDetails={onSaveItemDetails}
                        onRemove={onRemoveItem}
                        onTogglePaused={onTogglePaused}
                        onSetMainNominal={onSetMainNominal}
                        onSyncOneSteamWatch={onSyncOneSteamWatch}
                      />
                    );
                  }
                  return (
                    <GgselProductGroupCard
                      key={key}
                      items={groupItems}
                      steamWatches={steamWatches}
                      suppliers={suppliers}
                      rubRates={rubRates}
                      categoryDefaultRate={selectedCategory?.defaultUsdToRubRate}
                      onUpdateItem={onUpdateItem}
                      onSaveItemDetails={onSaveItemDetails}
                      onRemove={onRemoveItem}
                      onTogglePaused={onTogglePaused}
                      onSetMainNominal={onSetMainNominal}
                      onUpdateGroupTitle={onUpdateGroupTitle}
                      onSyncOneSteamWatch={onSyncOneSteamWatch}
                    />
                  );
                });
              })()}
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

// --- Add-item flow: look up a Steam package, then configure the calculator ---

function AddGgselItemPanel({
  categoryId,
  rubRates,
  categoryDefaultRate,
  suppliers,
  onLookupOrAddSteamWatch,
  onAddItem,
  onAddItems,
  onClose
}: {
  categoryId: string;
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  suppliers: Supplier[];
  onLookupOrAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string; watch?: SteamWatchItem }>;
  onAddItem: (item: Omit<GgselWatchItem, "id" | "addedAt">) => void;
  onAddItems: (items: Omit<GgselWatchItem, "id" | "addedAt">[]) => void;
  onClose: () => void;
}) {
  const [sourceMode, setSourceMode] = useState<"steam" | "catalog">("steam");

  return (
    <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3">
      <div className="flex gap-1.5">
        <button
          onClick={() => setSourceMode("steam")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold ${
            sourceMode === "steam" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          Steam
        </button>
        <button
          onClick={() => setSourceMode("catalog")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold ${
            sourceMode === "catalog" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          Наш каталог
        </button>
      </div>

      {sourceMode === "steam" ? (
        <AddSteamItemFlow
          categoryId={categoryId}
          rubRates={rubRates}
          categoryDefaultRate={categoryDefaultRate}
          onLookupOrAddSteamWatch={onLookupOrAddSteamWatch}
          onAddItem={onAddItem}
          onClose={onClose}
        />
      ) : (
        <AddCatalogItemFlow
          categoryId={categoryId}
          rubRates={rubRates}
          categoryDefaultRate={categoryDefaultRate}
          suppliers={suppliers}
          onAddItems={onAddItems}
          onClose={onClose}
        />
      )}
    </div>
  );
}

// --- Steam add flow (lookup a package, pick a country, configure) ---------

function AddSteamItemFlow({
  categoryId,
  rubRates,
  categoryDefaultRate,
  onLookupOrAddSteamWatch,
  onAddItem,
  onClose
}: {
  categoryId: string;
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  onLookupOrAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string; watch?: SteamWatchItem }>;
  onAddItem: (item: Omit<GgselWatchItem, "id" | "addedAt">) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"lookup" | "configure">("lookup");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<SteamWatchItem | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [title, setTitle] = useState("");
  const [commission1, setCommission1] = useState("0");
  const [commission2, setCommission2] = useState("0");
  const [margin, setMargin] = useState("0");
  const [exchangeRate, setExchangeRate] = useState("");

  const handleLookup = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await onLookupOrAddSteamWatch(input.trim());
    setBusy(false);
    if (!result.success || !result.watch) {
      setError(result.message || "Не вдалося знайти товар.");
      return;
    }
    setWatch(result.watch);
    setTitle(result.watch.title);
    const firstWithPrice = result.watch.prices.find(p => typeof p.price === "number");
    if (firstWithPrice) setCountryCode(firstWithPrice.countryCode);
    setStep("configure");
  };

  const selectedEntry = watch?.prices.find(p => p.countryCode === countryCode);
  const needsRate = Boolean(selectedEntry?.currency) && usesManualRate(selectedEntry!.currency!, rubRates);

  const handleSave = () => {
    if (!watch || !countryCode || !title.trim()) return;
    onAddItem({
      categoryId,
      title: title.trim(),
      sourceType: "steam",
      steamPackageId: watch.packageId,
      steamCountryCode: countryCode,
      exchangeRate: exchangeRate ? parseFloat(exchangeRate.replace(",", ".")) : undefined,
      commission1Percent: parseFloat(commission1.replace(",", ".")) || 0,
      commission2Percent: parseFloat(commission2.replace(",", ".")) || 0,
      myMarginPercent: parseFloat(margin.replace(",", ".")) || 0,
      ggselPrice: undefined,
      ggselPriceHistory: []
    });
    onClose();
  };

  return step === "lookup" ? (
    <>
      <p className="text-xs text-gray-400">Встав посилання на Steam-товар (sub) або його id</p>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="store.steampowered.com/sub/... або id"
        className={inputClass}
        onKeyDown={e => {
          if (e.key === "Enter") handleLookup();
        }}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleLookup}
          disabled={busy}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
        >
          {busy ? "Шукаю..." : "Знайти"}
        </button>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer">
          Скасувати
        </button>
      </div>
    </>
  ) : (
    <>
      {watch?.headerImage && (
        <img src={watch.headerImage} alt="" className="w-full max-w-[240px] h-auto rounded-lg border border-white/10" />
      )}
      <div>
        <label className={labelClass}>Назва товару</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Яку ціну Steam відстежувати</label>
        <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className={inputClass}>
          {(watch?.prices || [])
            .filter(p => typeof p.price === "number")
            .map(p => (
              <option key={p.countryCode} value={p.countryCode}>
                {STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase()} — {formatDropdownPrice(p.price!, p.currency || "USD", rubRates)}
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {needsRate && (
          <div>
            <label className={labelClass}>Курс {selectedEntry?.currency}→₽</label>
            <input
              value={exchangeRate}
              onChange={e => setExchangeRate(e.target.value)}
              placeholder={categoryDefaultRate ? `курс категорії: ${categoryDefaultRate}` : "напр. 95"}
              inputMode="decimal"
              className={inputClass}
            />
            {categoryDefaultRate && (
              <p className="text-[9px] text-gray-600 mt-0.5">Лишиш порожнім — візьме курс категорії ({categoryDefaultRate})</p>
            )}
          </div>
        )}
        <div>
          <label className={labelClass}>Комісія 1, %</label>
          <input value={commission1} onChange={e => setCommission1(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Комісія 2, %</label>
          <input value={commission2} onChange={e => setCommission2(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Мій %</label>
          <input value={margin} onChange={e => setMargin(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!countryCode || !title.trim()}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
        >
          Зберегти
        </button>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer">
          Скасувати
        </button>
      </div>
    </>
  );
}

// --- Catalog add flow (search our own products, pick one or more nominals) ---

function AddCatalogItemFlow({
  categoryId,
  rubRates,
  categoryDefaultRate,
  suppliers,
  onAddItems,
  onClose
}: {
  categoryId: string;
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  suppliers: Supplier[];
  onAddItems: (items: Omit<GgselWatchItem, "id" | "addedAt">[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ supplier: Supplier; product: ProductCard } | null>(null);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [commission1, setCommission1] = useState("0");
  const [commission2, setCommission2] = useState("0");
  const [margin, setMargin] = useState("0");
  const [exchangeRate, setExchangeRate] = useState("");

  const matches = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: { supplier: Supplier; product: ProductCard }[] = [];
    for (const supplier of suppliers) {
      if (supplier.deletedAt) continue;
      for (const product of supplier.products || []) {
        if (product.deletedAt) continue;
        if (product.title.toLowerCase().includes(q)) {
          results.push({ supplier, product });
          if (results.length >= 20) return results;
        }
      }
    }
    return results;
  })();

  const nominals = selectedProduct?.product.items || [];
  const toggleItem = (id: string) => {
    setCheckedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Показує "потрібен курс?" по першому позначеному номіналу — достатньо як
  // орієнтир, бо зазвичай усі номінали товару в одній валюті.
  const sampleNominal = nominals.find(n => checkedItemIds.has(n.id)) || nominals[0];
  const needsRate = Boolean(sampleNominal) && usesManualRate(sampleNominal!.currency || selectedProduct?.product.currency || "USD", rubRates);
  const sampleCurrency = sampleNominal?.currency || selectedProduct?.product.currency || "USD";

  const handleAdd = () => {
    if (!selectedProduct || checkedItemIds.size === 0) return;
    const rate = exchangeRate ? parseFloat(exchangeRate.replace(",", ".")) : undefined;
    const c1 = parseFloat(commission1.replace(",", ".")) || 0;
    const c2 = parseFloat(commission2.replace(",", ".")) || 0;
    const m = parseFloat(margin.replace(",", ".")) || 0;

    const newItems: Omit<GgselWatchItem, "id" | "addedAt">[] = nominals
      .filter(n => checkedItemIds.has(n.id))
      .map(n => {
        const productTitle = selectedProduct.product.title.trim();
        const nominalLabel = (n.title || n.code || "").trim();
        const isSameAsProduct = !nominalLabel || nominalLabel.toLowerCase() === productTitle.toLowerCase();
        return {
          categoryId,
          title: isSameAsProduct ? productTitle : `${productTitle} · ${nominalLabel}`,
          sourceType: "catalog" as const,
          catalogSupplierId: selectedProduct.supplier.id,
          catalogProductId: selectedProduct.product.id,
          catalogItemId: n.id,
          exchangeRate: rate,
          commission1Percent: c1,
          commission2Percent: c2,
          myMarginPercent: m,
          ggselPrice: undefined,
          ggselPriceHistory: []
        };
      });

    onAddItems(newItems);
    onClose();
  };

  if (!selectedProduct) {
    return (
      <>
        <p className="text-xs text-gray-400">Введи назву товару з розділу "Товари"</p>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="напр. Xbox"
            className={`${inputClass} pl-8`}
          />
        </div>
        {query.trim() && (
          <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
            {matches.length === 0 ? (
              <p className="text-xs text-gray-500 px-3 py-3">Нічого не знайдено.</p>
            ) : (
              matches.map(m => (
                <button
                  key={m.product.id}
                  onClick={() => setSelectedProduct(m)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-white truncate">{m.product.title}</p>
                    <p className="text-[10px] text-gray-500 truncate">{m.supplier.name}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer">
          Скасувати
        </button>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setSelectedProduct(null);
          setCheckedItemIds(new Set());
        }}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Інший товар
      </button>

      <div>
        <p className="text-sm font-bold text-white">{selectedProduct.product.title}</p>
        <p className="text-[11px] text-gray-500">{selectedProduct.supplier.name}</p>
      </div>

      {nominals.length === 0 ? (
        <p className="text-xs text-gray-500">У цього товару ще немає номіналів.</p>
      ) : (
        <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
          {nominals.map(n => (
            <label key={n.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer">
              <input
                type="checkbox"
                checked={checkedItemIds.has(n.id)}
                onChange={() => toggleItem(n.id)}
                className="cursor-pointer accent-emerald-600"
              />
              <span className="text-xs text-white flex-1 truncate">{n.title || n.code || "Номінал"}</span>
              <span className="text-xs font-mono text-gray-400">
                {typeof n.price === "number" ? `${n.price} ${n.currency || selectedProduct.product.currency || "USD"}` : "—"}
              </span>
            </label>
          ))}
        </div>
      )}

      {checkedItemIds.size > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {needsRate && (
            <div>
              <label className={labelClass}>Курс {sampleCurrency}→₽</label>
              <input
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                placeholder={categoryDefaultRate ? `курс категорії: ${categoryDefaultRate}` : "напр. 95"}
                inputMode="decimal"
                className={inputClass}
              />
              {categoryDefaultRate && (
                <p className="text-[9px] text-gray-600 mt-0.5">Лишиш порожнім — візьме курс категорії ({categoryDefaultRate})</p>
              )}
            </div>
          )}
          <div>
            <label className={labelClass}>Комісія 1, %</label>
            <input value={commission1} onChange={e => setCommission1(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Комісія 2, %</label>
            <input value={commission2} onChange={e => setCommission2(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Мій %</label>
            <input value={margin} onChange={e => setMargin(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={checkedItemIds.size === 0}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
        >
          Додати ({checkedItemIds.size})
        </button>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer">
          Скасувати
        </button>
      </div>
    </>
  );
}

// --- One tracked ggsel item: compact card + edit modal --------------------

// --- Groups items that share the same underlying product/package and shows
// "base price + increase per nominal" exactly the way ggsel's own admin
// panel expects it (Цена товара / Увеличение цены на, which can be negative) ---

// --- Standalone calculator: search a product, pick nominals, mark one as
// base, see "price + increase (can be negative)" — nothing gets saved into
// any category, this is a pure on-the-fly lookup tool. ---------------------

function GgselStandaloneCalculator({
  suppliers,
  steamWatches,
  rubRates,
  onLookupOrAddSteamWatch
}: {
  suppliers: Supplier[];
  steamWatches: SteamWatchItem[];
  rubRates: Record<string, number>;
  onLookupOrAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string; watch?: SteamWatchItem }>;
}) {
  const [sourceMode, setSourceMode] = useState<"steam" | "catalog">("catalog");

  // Shared calculator settings
  const [commission1, setCommission1] = useState("0");
  const [commission2, setCommission2] = useState("0");
  const [margin, setMargin] = useState("0");
  const [rate, setRate] = useState("");

  // Catalog search
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ supplier: Supplier; product: ProductCard } | null>(null);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [mainId, setMainId] = useState<string | null>(null);

  // Steam search
  const [steamInput, setSteamInput] = useState("");
  const [steamBusy, setSteamBusy] = useState(false);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [steamWatch, setSteamWatch] = useState<SteamWatchItem | null>(null);
  const [checkedCountries, setCheckedCountries] = useState<Set<string>>(new Set());
  const [steamQuery, setSteamQuery] = useState("");
  const [showAddNewSteam, setShowAddNewSteam] = useState(false);

  const steamMatches = (() => {
    const q = steamQuery.trim().toLowerCase();
    if (!q) return steamWatches;
    return steamWatches.filter(w => w.title.toLowerCase().includes(q));
  })();

  const matches = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: { supplier: Supplier; product: ProductCard }[] = [];
    for (const supplier of suppliers) {
      if (supplier.deletedAt) continue;
      for (const product of supplier.products || []) {
        if (product.deletedAt) continue;
        if (product.title.toLowerCase().includes(q)) {
          results.push({ supplier, product });
          if (results.length >= 20) return results;
        }
      }
    }
    return results;
  })();

  const handleSteamLookup = async () => {
    if (!steamInput.trim() || steamBusy) return;
    setSteamBusy(true);
    setSteamError(null);
    const result = await onLookupOrAddSteamWatch(steamInput.trim());
    setSteamBusy(false);
    if (!result.success || !result.watch) {
      setSteamError(result.message || "Не вдалося знайти товар.");
      return;
    }
    setSteamWatch(result.watch);
    setCheckedCountries(new Set());
    setMainId(null);
  };

  // Build a flat list of "rows" to calculate, whichever source is active.
  type Row = { id: string; title: string; price?: number; currency: string };
  let rows: Row[] = [];
  if (sourceMode === "catalog" && selectedProduct) {
    rows = (selectedProduct.product.items || [])
      .filter(n => checkedItemIds.has(n.id))
      .map(n => ({ id: n.id, title: n.title || n.code || "Номінал", price: n.price, currency: n.currency || selectedProduct.product.currency || "USD" }));
  } else if (sourceMode === "steam" && steamWatch) {
    rows = steamWatch.prices
      .filter(p => checkedCountries.has(p.countryCode) && typeof p.price === "number")
      .map(p => ({ id: p.countryCode, title: STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase(), price: p.price, currency: p.currency || "USD" }));
  }

  const rateNum = rate ? parseFloat(rate.replace(",", ".")) : undefined;
  const c1 = parseFloat(commission1.replace(",", ".")) || 0;
  const c2 = parseFloat(commission2.replace(",", ".")) || 0;
  const m = parseFloat(margin.replace(",", ".")) || 0;

  const computed = rows.map(r => {
    const baseRub = typeof r.price === "number" ? convertToRub(r.price, r.currency, rateNum, rubRates) : undefined;
    const suggested = typeof baseRub === "number" ? computeGgselSuggestedPrice(baseRub, c1, c2, m) : undefined;
    return { ...r, suggested };
  });

  const effectiveMainId = mainId && computed.some(r => r.id === mainId) ? mainId : computed[0]?.id || null;
  const mainRow = computed.find(r => r.id === effectiveMainId);
  const anyNeedsRate = rows.some(r => usesManualRate(r.currency, rubRates));

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button
          onClick={() => setSourceMode("catalog")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold ${
            sourceMode === "catalog" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          Наш каталог
        </button>
        <button
          onClick={() => setSourceMode("steam")}
          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer font-semibold ${
            sourceMode === "steam" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          Steam
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
      {sourceMode === "catalog" ? (
        !selectedProduct ? (
          <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3 w-full lg:w-96 lg:shrink-0">
            <p className="text-xs text-gray-400">Введи назву товару з розділу "Товари"</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="напр. Brawl Stars"
                className={`${inputClass} pl-8`}
              />
            </div>
            {query.trim() && (
              <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
                {matches.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-3">Нічого не знайдено.</p>
                ) : (
                  matches.map(m => (
                    <button
                      key={m.product.id}
                      onClick={() => {
                        setSelectedProduct(m);
                        setCheckedItemIds(new Set());
                        setMainId(null);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{m.product.title}</p>
                        <p className="text-[10px] text-gray-500 truncate">{m.supplier.name}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3 w-full lg:w-96 lg:shrink-0">
            <button
              onClick={() => {
                setSelectedProduct(null);
                setCheckedItemIds(new Set());
              }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Інший товар
            </button>
            <div>
              <p className="text-sm font-bold text-white">{selectedProduct.product.title}</p>
              <p className="text-[11px] text-gray-500">{selectedProduct.supplier.name}</p>
            </div>
            <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
              {(selectedProduct.product.items || []).map(n => (
                <label key={n.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedItemIds.has(n.id)}
                    onChange={() => {
                      setCheckedItemIds(prev => {
                        const next = new Set(prev);
                        if (next.has(n.id)) next.delete(n.id);
                        else next.add(n.id);
                        return next;
                      });
                    }}
                    className="cursor-pointer accent-emerald-600"
                  />
                  <span className="text-xs text-white flex-1 truncate">{n.title || n.code || "Номінал"}</span>
                  <span className="text-xs font-mono text-gray-400">
                    {typeof n.price === "number" ? `${n.price} ${n.currency || selectedProduct.product.currency || "USD"}` : "—"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      ) : !steamWatch ? (
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3 w-full lg:w-96 lg:shrink-0">
          {!showAddNewSteam ? (
            <>
              <p className="text-xs text-gray-400">Пошук серед уже доданих Steam-товарів</p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={steamQuery}
                  onChange={e => setSteamQuery(e.target.value)}
                  placeholder="напр. Arma"
                  className={`${inputClass} pl-8`}
                />
              </div>
              <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
                {steamMatches.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-3">
                    {steamWatches.length === 0 ? "Ще немає доданих Steam-товарів." : "Нічого не знайдено."}
                  </p>
                ) : (
                  steamMatches.map(w => (
                    <button
                      key={w.packageId}
                      onClick={() => {
                        setSteamWatch(w);
                        setCheckedCountries(new Set());
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 cursor-pointer"
                    >
                      <span className="text-xs text-white truncate">{w.title}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setShowAddNewSteam(true)}
                className="text-[11px] text-gray-500 hover:text-white cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Товару нема в списку — додати новим посиланням
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowAddNewSteam(false);
                  setSteamError(null);
                }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Назад до пошуку
              </button>
              <p className="text-xs text-gray-400">Встав посилання на Steam-товар (sub) або його id</p>
              <input
                value={steamInput}
                onChange={e => setSteamInput(e.target.value)}
                placeholder="store.steampowered.com/sub/... або id"
                className={inputClass}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSteamLookup();
                }}
              />
              {steamError && <p className="text-xs text-red-400">{steamError}</p>}
              <button
                onClick={handleSteamLookup}
                disabled={steamBusy}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {steamBusy ? "Шукаю..." : "Знайти"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3 w-full lg:w-96 lg:shrink-0">
          <button
            onClick={() => {
              setSteamWatch(null);
              setCheckedCountries(new Set());
              setShowAddNewSteam(false);
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Інший товар
          </button>
          <p className="text-sm font-bold text-white">{steamWatch.title}</p>
          <div className="border border-white/5 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
            {steamWatch.prices
              .filter(p => typeof p.price === "number")
              .map(p => (
                <label key={p.countryCode} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedCountries.has(p.countryCode)}
                    onChange={() => {
                      setCheckedCountries(prev => {
                        const next = new Set(prev);
                        if (next.has(p.countryCode)) next.delete(p.countryCode);
                        else next.add(p.countryCode);
                        return next;
                      });
                    }}
                    className="cursor-pointer accent-emerald-600"
                  />
                  <span className="text-xs text-white flex-1 truncate">{STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase()}</span>
                  <span className="text-xs font-mono text-gray-400">{p.price} {p.currency}</span>
                </label>
              ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3 flex-1 w-full lg:max-w-2xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {anyNeedsRate && (
              <div>
                <label className={labelClass}>Курс →₽</label>
                <input value={rate} onChange={e => setRate(e.target.value)} placeholder="напр. 95" inputMode="decimal" className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Комісія 1, %</label>
              <input value={commission1} onChange={e => setCommission1(e.target.value)} inputMode="decimal" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Комісія 2, %</label>
              <input value={commission2} onChange={e => setCommission2(e.target.value)} inputMode="decimal" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Мій %</label>
              <input value={margin} onChange={e => setMargin(e.target.value)} inputMode="decimal" className={inputClass} />
            </div>
          </div>

          <div className="px-1 text-[11px] text-gray-400">
            Цена товара (база): <span className="font-mono font-bold text-white">{typeof mainRow?.suggested === "number" ? mainRow.suggested.toFixed(2) : "—"} ₽</span>
            {mainRow && ` — з номіналу «${mainRow.title}»`}
          </div>

          <div className="border border-white/5 rounded-lg overflow-hidden divide-y divide-white/5">
            {computed.map(r => {
              const isMain = r.id === effectiveMainId;
              const increase = typeof r.suggested === "number" && typeof mainRow?.suggested === "number" ? r.suggested - mainRow.suggested : undefined;
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button onClick={() => setMainId(r.id)} className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left">
                    <Star className={`w-3 h-3 shrink-0 ${isMain ? "text-amber-400 fill-amber-400" : "text-gray-600"}`} />
                    <span className="text-xs text-white truncate">{r.title}</span>
                  </button>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs font-mono text-gray-400">{typeof r.suggested === "number" ? `${r.suggested.toFixed(2)} ₽` : "—"}</span>
                    <span
                      className={`text-xs font-mono font-bold w-20 text-right ${
                        isMain ? "text-gray-500" : typeof increase === "number" && increase < 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {isMain ? "база" : typeof increase === "number" ? `${increase > 0 ? "+" : ""}${increase.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}


function GgselGroupCalculator({
  categoryItems,
  steamWatches,
  suppliers,
  rubRates,
  categoryDefaultRate,
  onSetMainNominal
}: {
  categoryItems: GgselWatchItem[];
  steamWatches: SteamWatchItem[];
  suppliers: Supplier[];
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  onSetMainNominal: (id: string) => void;
}) {
  const groups: Record<string, GgselWatchItem[]> = {};
  categoryItems.forEach(item => {
    const key = ggselGroupKey(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  const groupEntries = Object.values(groups).filter(g => g.length > 1);

  if (groupEntries.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Calculator className="w-3.5 h-3.5" /> Калькулятор для ggsel — база + "Збільшення ціни" на варіант
      </p>
      {groupEntries.map(groupItems => {
        const mainItem = groupItems.find(i => i.isMainNominal) || groupItems[0];
        const mainPrice = computeItemSuggestedRub(mainItem, steamWatches, suppliers, rubRates, categoryDefaultRate);
        return (
          <div key={ggselGroupKey(mainItem)} className="border border-white/5 rounded-xl overflow-hidden bg-[#111112]">
            <div className="px-3 py-2 bg-black/20 text-[11px] text-gray-400 border-b border-white/5">
              Цена товара (база): <span className="font-mono font-bold text-white">{typeof mainPrice === "number" ? mainPrice.toFixed(2) : "—"} ₽</span>
              {" "}— з номіналу «{mainItem.title}»
            </div>
            <div className="divide-y divide-white/5">
              {groupItems.map(item => {
                const price = computeItemSuggestedRub(item, steamWatches, suppliers, rubRates, categoryDefaultRate);
                const increase =
                  typeof price === "number" && typeof mainPrice === "number" ? price - mainPrice : undefined;
                const isMain = item.id === mainItem.id;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      onClick={() => onSetMainNominal(item.id)}
                      className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left"
                      title={isMain ? "Прибрати позначку головного" : "Зробити головним"}
                    >
                      <Star className={`w-3 h-3 shrink-0 ${isMain ? "text-amber-400 fill-amber-400" : "text-gray-600"}`} />
                      <span className="text-xs text-white truncate">{item.title}</span>
                    </button>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-mono text-gray-400">{typeof price === "number" ? `${price.toFixed(2)} ₽` : "—"}</span>
                      <span
                        className={`text-xs font-mono font-bold w-20 text-right ${
                          isMain
                            ? "text-gray-500"
                            : typeof increase === "number" && increase < 0
                              ? "text-emerald-400"
                              : "text-amber-400"
                        }`}
                      >
                        {isMain ? "база" : typeof increase === "number" ? `${increase > 0 ? "+" : ""}${increase.toFixed(2)}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// --- Кілька номіналів одного й того ж товару/пакета — одна об'єднана
// картка замість того, щоб розсипати їх окремими картками по сітці. ------

function GgselProductGroupCard({
  items,
  steamWatches,
  suppliers,
  rubRates,
  categoryDefaultRate,
  onUpdateItem,
  onSaveItemDetails,
  onRemove,
  onTogglePaused,
  onSetMainNominal,
  onUpdateGroupTitle,
  onSyncOneSteamWatch
}: {
  key?: React.Key;
  items: GgselWatchItem[];
  steamWatches: SteamWatchItem[];
  suppliers: Supplier[];
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      title?: string;
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemove: (id: string) => void;
  onTogglePaused: (id: string) => void;
  onSetMainNominal: (id: string) => void;
  onUpdateGroupTitle: (itemIds: string[], newTitle: string) => void;
  onSyncOneSteamWatch: (packageId: string) => Promise<{ success: boolean; changed?: boolean; message?: string }>;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const first = items[0];
  const isCatalog = first.sourceType === "catalog";
  const supplier = suppliers.find(s => s.id === first.catalogSupplierId);
  const product = supplier?.products.find(p => p.id === first.catalogProductId);
  const watch = steamWatches.find(w => w.packageId === first.steamPackageId);
  const overrideTitle = items.find(i => i.groupTitleOverride)?.groupTitleOverride;
  const headerTitle = overrideTitle || (isCatalog ? product?.title || first.title : watch?.title || first.title);
  const headerSubtitle = isCatalog ? supplier?.name : "Steam";
  const [titleInput, setTitleInput] = useState(headerTitle);

  const mainItem = items.find(i => i.isMainNominal) || items[0];
  const mainPrice = computeItemSuggestedRub(mainItem, steamWatches, suppliers, rubRates, categoryDefaultRate);

  let upCount = 0;
  let downCount = 0;
  let outOfStockCount = 0;
  items.forEach(item => {
    const src = resolveGgselPriceSource(item, steamWatches, suppliers);
    const trend = steamPriceTrend(src.price, src.priceHistory?.[0]);
    if (trend === "up") upCount++;
    if (trend === "down") downCount++;
    if (src.inStock === false) outOfStockCount++;
  });

  const saveTitle = () => {
    onUpdateGroupTitle(items.map(i => i.id), titleInput);
    setIsEditingTitle(false);
  };

  return (
    <div className="border border-white/5 rounded-xl bg-[#111112] p-4 space-y-3 lg:col-span-2 2xl:col-span-3">
      <div className="flex items-center gap-3">
        {!isCatalog && watch?.headerImage && (
          <img src={watch.headerImage} alt="" className="w-16 h-8 object-cover rounded-md border border-white/10 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") {
                    setTitleInput(headerTitle);
                    setIsEditingTitle(false);
                  }
                }}
                className="bg-black/30 border border-white/10 rounded-md px-2 py-1 text-sm text-white w-full max-w-xs focus:outline-none focus:border-emerald-600/50"
              />
              <button onClick={saveTitle} className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded cursor-pointer">
                <Check className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={() => {
                  setTitleInput(headerTitle);
                  setIsEditingTitle(false);
                }}
                className="p-1 hover:bg-white/5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ) : (
            <p className="text-sm font-bold text-white truncate flex items-center gap-1.5 group">
              {headerTitle}
              <button
                onClick={() => {
                  setTitleInput(headerTitle);
                  setIsEditingTitle(true);
                }}
                className="p-0.5 hover:bg-white/5 rounded cursor-pointer shrink-0"
                title="Перейменувати товар"
              >
                <Pencil className="w-3 h-3 text-gray-600" />
              </button>
            </p>
          )}
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
            {isCatalog ? <Package className="w-3 h-3" /> : null}
            {headerSubtitle} · {items.length} номіналів
            {upCount > 0 && <span className="text-amber-400 font-mono">↑{upCount}</span>}
            {downCount > 0 && <span className="text-emerald-400 font-mono">↓{downCount}</span>}
            {outOfStockCount > 0 && (
              <span
                className="text-[9px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-1 py-0.5"
                title="Стільки номіналів немає в наявності за даними LetsKeys"
              >
                нема в наявності: {outOfStockCount}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] text-gray-500 uppercase font-bold">Цена товара (база)</p>
          <p className="text-sm font-mono font-bold text-white">{typeof mainPrice === "number" ? mainPrice.toFixed(2) : "—"} ₽</p>
        </div>
      </div>

      <div className="border border-white/5 rounded-lg overflow-hidden divide-y divide-white/5">
        {items.map(item => (
          <GgselGroupRow
            key={item.id}
            item={item}
            isMain={item.id === mainItem.id}
            mainPrice={mainPrice}
            steamWatches={steamWatches}
            suppliers={suppliers}
            rubRates={rubRates}
            categoryDefaultRate={categoryDefaultRate}
            onUpdateItem={onUpdateItem}
            onSaveItemDetails={onSaveItemDetails}
            onRemove={onRemove}
            onTogglePaused={onTogglePaused}
            onSetMainNominal={onSetMainNominal}
            onSyncOneSteamWatch={onSyncOneSteamWatch}
          />
        ))}
      </div>
    </div>
  );
}

function GgselGroupRow({
  item,
  isMain,
  mainPrice,
  steamWatches,
  suppliers,
  rubRates,
  categoryDefaultRate,
  onUpdateItem,
  onSaveItemDetails,
  onRemove,
  onTogglePaused,
  onSetMainNominal,
  onSyncOneSteamWatch
}: {
  key?: React.Key;
  item: GgselWatchItem;
  isMain: boolean;
  mainPrice: number | undefined;
  steamWatches: SteamWatchItem[];
  suppliers: Supplier[];
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      title?: string;
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemove: (id: string) => void;
  onTogglePaused: (id: string) => void;
  onSetMainNominal: (id: string) => void;
  onSyncOneSteamWatch: (packageId: string) => Promise<{ success: boolean; changed?: boolean; message?: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isCatalog = item.sourceType === "catalog";
  const handleSyncPrice = async () => {
    if (!item.steamPackageId || isSyncing) return;
    setIsSyncing(true);
    await onSyncOneSteamWatch(item.steamPackageId);
    setIsSyncing(false);
  };
  const source = resolveGgselPriceSource(item, steamWatches, suppliers);
  const needsRate = usesManualRate(source.currency, rubRates);
  const suggested = computeItemSuggestedRub(item, steamWatches, suppliers, rubRates, categoryDefaultRate);
  const increase = typeof suggested === "number" && typeof mainPrice === "number" ? suggested - mainPrice : undefined;
  const needsPriceIncrease = typeof suggested === "number" && typeof item.ggselPrice === "number" && suggested - item.ggselPrice > 1;
  const priceTrendValue = steamPriceTrend(source.price, source.priceHistory?.[0]);

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${item.isPaused ? "opacity-50" : ""} ${needsPriceIncrease && !item.isPaused ? "bg-amber-500/5" : ""}`}>
      <button onClick={() => onSetMainNominal(item.id)} className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left">
        <Star className={`w-3 h-3 shrink-0 ${isMain ? "text-amber-400 fill-amber-400" : "text-gray-600"}`} />
        <span className="text-xs text-white truncate">{item.title}</span>
        {priceTrendValue === "up" && <span className="text-amber-400 text-[10px] shrink-0">↑</span>}
        {priceTrendValue === "down" && <span className="text-emerald-400 text-[10px] shrink-0">↓</span>}
        {source.inStock === false && (
          <span
            className="text-[8px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-1 py-0.5 shrink-0"
            title="За даними LetsKeys цього номіналу немає в наявності"
          >
            нема в наявності
          </span>
        )}
        {item.isPaused && <span className="text-[8px] font-bold uppercase text-amber-400 shrink-0">пауза</span>}
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[10px] font-mono text-gray-500 w-20 text-right">
          {typeof source.price === "number" ? `${source.price} ${source.currency}` : "—"}
        </span>
        <span className="text-[10px] font-mono text-gray-400 w-16 text-right">
          {typeof item.ggselPrice === "number" ? `${item.ggselPrice.toFixed(2)}₽` : "—"}
        </span>
        <span className={`text-xs font-mono font-bold w-20 text-right ${isMain ? "text-gray-500" : typeof increase === "number" && increase < 0 ? "text-emerald-400" : "text-amber-400"}`}>
          {isMain ? "база" : typeof increase === "number" ? `${increase > 0 ? "+" : ""}${increase.toFixed(2)}` : "—"}
        </span>
        {!isCatalog && (
          <button
            onClick={handleSyncPrice}
            disabled={isSyncing}
            className="p-1 hover:bg-white/5 rounded cursor-pointer disabled:opacity-50"
            title="Оновити ціну Steam для цього номіналу зараз"
          >
            <RefreshCw className={`w-3 h-3 text-gray-500 ${isSyncing ? "animate-spin" : ""}`} />
          </button>
        )}
        <button onClick={() => onTogglePaused(item.id)} className="p-1 hover:bg-white/5 rounded cursor-pointer" title={item.isPaused ? "Відновити" : "Призупинити"}>
          {item.isPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-gray-500" />}
        </button>
        <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-white/5 rounded cursor-pointer" title="Редагувати">
          <Pencil className="w-3 h-3 text-gray-500" />
        </button>
        <button onClick={() => onRemove(item.id)} className="p-1 hover:bg-white/5 rounded cursor-pointer" title="Прибрати">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {isEditing && (
        <EditGgselItemModal
          item={item}
          needsRate={needsRate}
          steamCurrency={source.currency}
          categoryDefaultRate={categoryDefaultRate}
          onSaveItemDetails={onSaveItemDetails}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}

function GgselItemCard({
  item,
  steamWatches,
  suppliers,
  rubRates,
  categoryDefaultRate,
  onUpdateItem,
  onSaveItemDetails,
  onRemove,
  onTogglePaused,
  onSetMainNominal,
  onSyncOneSteamWatch
}: {
  key?: React.Key;
  item: GgselWatchItem;
  steamWatches: SteamWatchItem[];
  suppliers: Supplier[];
  rubRates: Record<string, number>;
  categoryDefaultRate?: number;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      title?: string;
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemove: (id: string) => void;
  onTogglePaused: (id: string) => void;
  onSetMainNominal: (id: string) => void;
  onSyncOneSteamWatch: (packageId: string) => Promise<{ success: boolean; changed?: boolean; message?: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isCatalog = item.sourceType === "catalog";

  const handleSyncPrice = async () => {
    if (!item.steamPackageId || isSyncing) return;
    setIsSyncing(true);
    await onSyncOneSteamWatch(item.steamPackageId);
    setIsSyncing(false);
  };

  const watch = steamWatches.find(w => w.packageId === item.steamPackageId);
  const source = resolveGgselPriceSource(item, steamWatches, suppliers);
  const price = source.price;
  const currency = source.currency;
  const needsRate = usesManualRate(currency, rubRates);
  const effectiveRate = item.exchangeRate ?? categoryDefaultRate;
  const baseRub = typeof price === "number" ? convertToRub(price, currency, effectiveRate, rubRates) : undefined;
  const suggested =
    typeof baseRub === "number"
      ? computeGgselSuggestedPrice(baseRub, item.commission1Percent, item.commission2Percent, item.myMarginPercent)
      : undefined;
  const priceTrendValue = steamPriceTrend(price, source.priceHistory?.[0]);

  // Загорається лише коли розрахована ціна ВИЩА за ту, що вже стоїть на
  // ggsel (тобто ціну треба підняти). Якщо користувач сам поставив ціну
  // вище розрахованої — це його свідомий вибір, попередження не потрібне.
  const needsPriceIncrease =
    typeof suggested === "number" && typeof item.ggselPrice === "number" && suggested - item.ggselPrice > 1;

  return (
    <div
      className={`border rounded-xl p-4 space-y-3 h-full ${item.isPaused ? "opacity-60" : ""} ${
        needsPriceIncrease && !item.isPaused ? "border-amber-500/30 bg-amber-500/5" : "border-white/5 bg-[#111112]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {!isCatalog && watch?.headerImage && (
          <img
            src={watch.headerImage}
            alt=""
            className="w-16 h-8 sm:w-20 sm:h-9 object-cover rounded-md border border-white/10 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">
            {item.title}
            {item.isMainNominal && (
              <span className="ml-2 text-[9px] font-bold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-sm px-1.5 py-0.5 align-middle">
                ★ Головний
              </span>
            )}
            {source.inStock === false && (
              <span
                className="ml-2 text-[9px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-1.5 py-0.5 align-middle"
                title="За даними LetsKeys цього номіналу немає в наявності"
              >
                Нема в наявності
              </span>
            )}
            {item.isPaused && (
              <span className="ml-2 text-[9px] font-bold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-sm px-1.5 py-0.5 align-middle">
                Призупинено
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {isCatalog ? (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Package className="w-3 h-3" /> {source.label}
              </span>
            ) : (
              <>
                <span className="text-[11px] text-gray-500">Ціна Steam з країни:</span>
                <select
                  value={item.steamCountryCode}
                  onChange={e => onUpdateItem(item.id, { steamCountryCode: e.target.value, exchangeRate: undefined })}
                  className="bg-black/30 border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:border-emerald-600/50 cursor-pointer"
                >
                  {(watch?.prices || [])
                    .filter(p => typeof p.price === "number")
                    .map(p => (
                      <option key={p.countryCode} value={p.countryCode}>
                        {STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase()} — {formatDropdownPrice(p.price!, p.currency || "USD", rubRates)}
                      </option>
                    ))}
                </select>
              </>
            )}
            {priceTrendValue === "up" && <span className="text-amber-400 text-[11px]">↑ подорожчав</span>}
            {priceTrendValue === "down" && <span className="text-emerald-400 text-[11px]">↓ подешевшав</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isCatalog && (
            <button
              onClick={handleSyncPrice}
              disabled={isSyncing}
              className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer disabled:opacity-50"
              title="Оновити ціну Steam для цього товару зараз"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => onSetMainNominal(item.id)}
            className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer"
            title={item.isMainNominal ? "Прибрати позначку головного номіналу" : "Позначити головним номіналом (база для \"Збільшення ціни\" в ggsel)"}
          >
            <Star className={`w-3.5 h-3.5 ${item.isMainNominal ? "text-amber-400 fill-amber-400" : "text-gray-500"}`} />
          </button>
          <button
            onClick={() => onTogglePaused(item.id)}
            className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer"
            title={item.isPaused ? "Відновити спостереження" : "Призупинити (напр. номінал закінчився)"}
          >
            {item.isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer" title="Редагувати">
            <Pencil className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button onClick={() => onRemove(item.id)} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer" title="Прибрати">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {needsPriceIncrease && !item.isPaused && typeof suggested === "number" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Ціна джерела зросла — рекомендована ціна на ggsel тепер <b>{suggested.toFixed(2)} ₽</b> (у тебе стоїть{" "}
            {item.ggselPrice?.toFixed(2)} ₽) — підніми ціну на ggsel.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>{isCatalog ? "Ціна в каталозі" : "Ціна Steam"}</label>
          <div className="text-sm font-mono font-bold text-white">
            {typeof price === "number" ? `${price} ${currency}` : "—"}
          </div>
        </div>
        <div>
          <label className={labelClass}>Ціна на ggsel, ₽</label>
          <div className="text-sm font-mono font-bold text-white">
            {typeof item.ggselPrice === "number" ? item.ggselPrice.toFixed(2) : "не вказано"}
          </div>
        </div>
        <div>
          <label className={labelClass}>Розрахована ціна, ₽</label>
          <div className={`text-sm font-mono font-bold ${needsPriceIncrease ? "text-amber-400" : "text-emerald-400"}`}>
            {typeof suggested === "number" ? suggested.toFixed(2) : "—"}
          </div>
          {currency !== "RUB" && (
            <p className="text-[9px] text-gray-600 mt-0.5">
              {needsRate
                ? item.exchangeRate
                  ? `курс вручну: ${item.exchangeRate}`
                  : categoryDefaultRate
                    ? `курс категорії: ${categoryDefaultRate}`
                    : "постав курс"
                : "курс: авто (ЦБ)"}
            </p>
          )}
        </div>
      </div>

      {isEditing && (
        <EditGgselItemModal
          item={item}
          needsRate={needsRate}
          steamCurrency={currency}
          categoryDefaultRate={categoryDefaultRate}
          onSaveItemDetails={onSaveItemDetails}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}

// --- Modal: enter/edit ggsel price, exchange rate, commissions, margin ----

function EditGgselItemModal({
  item,
  needsRate,
  steamCurrency,
  categoryDefaultRate,
  onSaveItemDetails,
  onClose
}: {
  item: GgselWatchItem;
  needsRate: boolean;
  steamCurrency: string;
  categoryDefaultRate?: number;
  onSaveItemDetails: (
    id: string,
    patch: {
      title?: string;
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onClose: () => void;
}) {
  const [titleInput, setTitleInput] = useState(item.title);
  const [priceInput, setPriceInput] = useState(item.ggselPrice != null ? String(item.ggselPrice) : "");
  const [rateInput, setRateInput] = useState(item.exchangeRate != null ? String(item.exchangeRate) : "");
  const [c1Input, setC1Input] = useState(String(item.commission1Percent));
  const [c2Input, setC2Input] = useState(String(item.commission2Percent));
  const [marginInput, setMarginInput] = useState(String(item.myMarginPercent));

  const handleSave = () => {
    const priceNum = parseFloat(priceInput.replace(",", "."));
    onSaveItemDetails(item.id, {
      title: titleInput,
      ggselPrice: !isNaN(priceNum) ? priceNum : undefined,
      exchangeRate: rateInput ? parseFloat(rateInput.replace(",", ".")) || undefined : undefined,
      commission1Percent: parseFloat(c1Input.replace(",", ".")) || 0,
      commission2Percent: parseFloat(c2Input.replace(",", ".")) || 0,
      myMarginPercent: parseFloat(marginInput.replace(",", ".")) || 0
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#161618] border border-white/10 rounded-xl w-full max-w-md p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Редагувати товар</p>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div>
          <label className={labelClass}>Назва</label>
          <input value={titleInput} onChange={e => setTitleInput(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Ціна на ggsel, ₽</label>
          <input
            autoFocus
            value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        {needsRate && (
          <div>
            <label className={labelClass}>Курс {steamCurrency} → ₽</label>
            <input
              value={rateInput}
              onChange={e => setRateInput(e.target.value)}
              placeholder={categoryDefaultRate ? `курс категорії: ${categoryDefaultRate}` : "напр. 95"}
              inputMode="decimal"
              className={inputClass}
            />
            {categoryDefaultRate && (
              <p className="text-[9px] text-gray-600 mt-0.5">Лишиш порожнім — візьме курс категорії ({categoryDefaultRate})</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Комісія 1, %</label>
            <input value={c1Input} onChange={e => setC1Input(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Комісія 2, %</label>
            <input value={c2Input} onChange={e => setC2Input(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Мій %</label>
          <input value={marginInput} onChange={e => setMarginInput(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg cursor-pointer">
            Зберегти
          </button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-4 py-2 cursor-pointer">
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
