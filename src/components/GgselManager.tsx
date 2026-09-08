import React, { useEffect, useState } from "react";
import { GgselCategory, GgselWatchItem, SteamWatchItem, PriceHistoryEntry } from "../types";
import { computeGgselSuggestedPrice } from "../utils";
import { apiFetch } from "../apiClient";
import { Plus, X, Check, Trash2, AlertTriangle, Pencil } from "lucide-react";

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
  onAddCategory: (name: string) => void;
  onRemoveCategory: (id: string) => void;
  onAddItem: (item: Omit<GgselWatchItem, "id" | "addedAt">) => void;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemoveItem: (id: string) => void;
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

const inputClass =
  "w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-600/50";
const labelClass = "text-[9px] text-gray-500 uppercase font-bold block mb-1";

export default function GgselManager({
  categories,
  items,
  steamWatches,
  onAddCategory,
  onRemoveCategory,
  onAddItem,
  onUpdateItem,
  onUpdatePrice,
  onSaveItemDetails,
  onRemoveItem,
  onLookupOrAddSteamWatch
}: GgselManagerProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categories[0]?.id || null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
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

  const categoryItems = items.filter(i => i.categoryId === selectedCategoryId);

  const handleAddCategorySubmit = () => {
    if (!newCategoryName.trim()) return;
    onAddCategory(newCategoryName.trim());
    setNewCategoryName("");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
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
                }
              }}
              placeholder="Назва категорії"
              className="bg-[#111112] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-600/50 w-36"
            />
            <button onClick={handleAddCategorySubmit} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer">
              <Check className="w-3.5 h-3.5 text-white" />
            </button>
            <button
              onClick={() => {
                setShowAddCategory(false);
                setNewCategoryName("");
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
            <p className="text-xs text-gray-500">{categoryItems.length} товар(ів) у категорії</p>
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
              onLookupOrAddSteamWatch={onLookupOrAddSteamWatch}
              onAddItem={onAddItem}
              onClose={() => setShowAddItem(false)}
            />
          )}

          {categoryItems.length === 0 && !showAddItem ? (
            <p className="text-xs text-gray-500 py-6 text-center">Ще немає товарів у цій категорії.</p>
          ) : (
            <div className="space-y-3">
              {categoryItems.map(item => (
                <GgselItemCard
                  key={item.id}
                  item={item}
                  steamWatches={steamWatches}
                  rubRates={rubRates}
                  onUpdateItem={onUpdateItem}
                  onSaveItemDetails={onSaveItemDetails}
                  onRemove={onRemoveItem}
                />
              ))}
            </div>
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
  onLookupOrAddSteamWatch,
  onAddItem,
  onClose
}: {
  categoryId: string;
  rubRates: Record<string, number>;
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

  return (
    <div className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3">
      {step === "lookup" ? (
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
                    {STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase()} — {p.price} {p.currency}
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
                  placeholder="напр. 95"
                  inputMode="decimal"
                  className={inputClass}
                />
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
      )}
    </div>
  );
}

// --- One tracked ggsel item: compact card + edit modal --------------------

function GgselItemCard({
  item,
  steamWatches,
  rubRates,
  onUpdateItem,
  onSaveItemDetails,
  onRemove
}: {
  key?: React.Key;
  item: GgselWatchItem;
  steamWatches: SteamWatchItem[];
  rubRates: Record<string, number>;
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onSaveItemDetails: (
    id: string,
    patch: {
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const watch = steamWatches.find(w => w.packageId === item.steamPackageId);
  const entry = watch?.prices.find(p => p.countryCode === item.steamCountryCode);
  const steamPrice = entry?.price;
  const steamCurrency = entry?.currency || "USD";
  const needsRate = usesManualRate(steamCurrency, rubRates);
  const baseRub = typeof steamPrice === "number" ? convertToRub(steamPrice, steamCurrency, item.exchangeRate, rubRates) : undefined;
  const suggested =
    typeof baseRub === "number"
      ? computeGgselSuggestedPrice(baseRub, item.commission1Percent, item.commission2Percent, item.myMarginPercent)
      : undefined;
  const steamTrend = steamPriceTrend(steamPrice, entry?.priceHistory?.[0]);

  // Загорається лише коли розрахована ціна ВИЩА за ту, що вже стоїть на
  // ggsel (тобто ціну треба підняти). Якщо користувач сам поставив ціну
  // вище розрахованої — це його свідомий вибір, попередження не потрібне.
  const needsPriceIncrease =
    typeof suggested === "number" && typeof item.ggselPrice === "number" && suggested - item.ggselPrice > 1;

  return (
    <div
      className={`border rounded-xl p-4 space-y-3 max-w-xl ${
        needsPriceIncrease ? "border-amber-500/30 bg-amber-500/5" : "border-white/5 bg-[#111112]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{item.title}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
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
                    {STEAM_COUNTRY_LABELS[p.countryCode] || p.countryCode.toUpperCase()} — {p.price} {p.currency}
                  </option>
                ))}
            </select>
            {steamTrend === "up" && <span className="text-amber-400 text-[11px]">↑ подорожчав</span>}
            {steamTrend === "down" && <span className="text-emerald-400 text-[11px]">↓ подешевшав</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer" title="Редагувати">
            <Pencil className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button onClick={() => onRemove(item.id)} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer" title="Прибрати">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {needsPriceIncrease && typeof suggested === "number" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Steam подорожчав — рекомендована ціна на ggsel тепер <b>{suggested.toFixed(2)} ₽</b> (у тебе стоїть{" "}
            {item.ggselPrice?.toFixed(2)} ₽) — підніми ціну на ggsel.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Ціна Steam</label>
          <div className="text-sm font-mono font-bold text-white">
            {typeof steamPrice === "number" ? `${steamPrice} ${steamCurrency}` : "—"}
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
          {steamCurrency !== "RUB" && (
            <p className="text-[9px] text-gray-600 mt-0.5">
              {needsRate
                ? item.exchangeRate
                  ? `курс вручну: ${item.exchangeRate}`
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
          steamCurrency={steamCurrency}
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
  onSaveItemDetails,
  onClose
}: {
  item: GgselWatchItem;
  needsRate: boolean;
  steamCurrency: string;
  onSaveItemDetails: (
    id: string,
    patch: {
      ggselPrice?: number;
      exchangeRate?: number;
      commission1Percent: number;
      commission2Percent: number;
      myMarginPercent: number;
    }
  ) => void;
  onClose: () => void;
}) {
  const [priceInput, setPriceInput] = useState(item.ggselPrice != null ? String(item.ggselPrice) : "");
  const [rateInput, setRateInput] = useState(item.exchangeRate != null ? String(item.exchangeRate) : "");
  const [c1Input, setC1Input] = useState(String(item.commission1Percent));
  const [c2Input, setC2Input] = useState(String(item.commission2Percent));
  const [marginInput, setMarginInput] = useState(String(item.myMarginPercent));

  const handleSave = () => {
    const priceNum = parseFloat(priceInput.replace(",", "."));
    onSaveItemDetails(item.id, {
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
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white truncate">{item.title}</p>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg cursor-pointer shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
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
            <input value={rateInput} onChange={e => setRateInput(e.target.value)} placeholder="напр. 95" inputMode="decimal" className={inputClass} />
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
