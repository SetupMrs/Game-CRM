import React, { useEffect, useState } from "react";
import { GgselCategory, GgselWatchItem, SteamWatchItem, PriceHistoryEntry } from "../types";
import { Plus, X, Check, Trash2, AlertTriangle } from "lucide-react";

const STEAM_COUNTRY_LABELS: Record<string, string> = {
  us: "США", ua: "Україна", ru: "Росія", br: "Бразилія", cn: "Китай", cl: "Чилі",
  id: "Індонезія", ph: "Філіппіни", in: "Індія", tr: "Туреччина", kz: "Казахстан", pl: "Польща"
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
  onRemoveItem: (id: string) => void;
  onLookupOrAddSteamWatch: (input: string) => Promise<{ success: boolean; message?: string; watch?: SteamWatchItem }>;
}

// Ціна на ggsel = базова ціна Steam у рублях, послідовно збільшена на кожен
// відсоток: (1+комісія1%)·(1+комісія2%)·(1+мій%) — саме так, як порахував
// користувач вручну (1527 → 1652.238432 при 2%+4%+2%).
function computeSuggestedPrice(baseRub: number, c1: number, c2: number, margin: number): number {
  return baseRub * (1 + c1 / 100) * (1 + c2 / 100) * (1 + margin / 100);
}

function steamPriceTrend(current?: number, prevEntry?: PriceHistoryEntry): "up" | "down" | "none" {
  if (typeof current !== "number" || !prevEntry) return "none";
  if (current > prevEntry.price) return "up";
  if (current < prevEntry.price) return "down";
  return "none";
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
  onRemoveItem,
  onLookupOrAddSteamWatch
}: GgselManagerProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categories[0]?.id || null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);

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
                  onUpdateItem={onUpdateItem}
                  onUpdatePrice={onUpdatePrice}
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
  onLookupOrAddSteamWatch,
  onAddItem,
  onClose
}: {
  categoryId: string;
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
  const needsRate = Boolean(selectedEntry && selectedEntry.currency && selectedEntry.currency !== "RUB");

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

// --- One tracked ggsel item: live Steam price, calculator, editable fields ---

function GgselItemCard({
  item,
  steamWatches,
  onUpdateItem,
  onUpdatePrice,
  onRemove
}: {
  key?: React.Key;
  item: GgselWatchItem;
  steamWatches: SteamWatchItem[];
  onUpdateItem: (id: string, patch: Partial<GgselWatchItem>) => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onRemove: (id: string) => void;
}) {
  const watch = steamWatches.find(w => w.packageId === item.steamPackageId);
  const entry = watch?.prices.find(p => p.countryCode === item.steamCountryCode);
  const steamPrice = entry?.price;
  const steamCurrency = entry?.currency || "USD";
  const needsRate = steamCurrency !== "RUB";
  const rate = item.exchangeRate || 1;
  const baseRub = typeof steamPrice === "number" ? (needsRate ? steamPrice * rate : steamPrice) : undefined;
  const suggested =
    typeof baseRub === "number"
      ? computeSuggestedPrice(baseRub, item.commission1Percent, item.commission2Percent, item.myMarginPercent)
      : undefined;
  const steamTrend = steamPriceTrend(steamPrice, entry?.priceHistory?.[0]);

  const [priceInput, setPriceInput] = useState(item.ggselPrice != null ? String(item.ggselPrice) : "");
  const [rateInput, setRateInput] = useState(item.exchangeRate != null ? String(item.exchangeRate) : "");
  const [c1Input, setC1Input] = useState(String(item.commission1Percent));
  const [c2Input, setC2Input] = useState(String(item.commission2Percent));
  const [marginInput, setMarginInput] = useState(String(item.myMarginPercent));

  useEffect(() => setPriceInput(item.ggselPrice != null ? String(item.ggselPrice) : ""), [item.ggselPrice]);
  useEffect(() => setRateInput(item.exchangeRate != null ? String(item.exchangeRate) : ""), [item.exchangeRate]);
  useEffect(() => setC1Input(String(item.commission1Percent)), [item.commission1Percent]);
  useEffect(() => setC2Input(String(item.commission2Percent)), [item.commission2Percent]);
  useEffect(() => setMarginInput(String(item.myMarginPercent)), [item.myMarginPercent]);

  const commitPrice = () => {
    const num = parseFloat(priceInput.replace(",", "."));
    if (!isNaN(num)) onUpdatePrice(item.id, num);
  };

  const commitFields = () => {
    onUpdateItem(item.id, {
      exchangeRate: rateInput ? parseFloat(rateInput.replace(",", ".")) || undefined : undefined,
      commission1Percent: parseFloat(c1Input.replace(",", ".")) || 0,
      commission2Percent: parseFloat(c2Input.replace(",", ".")) || 0,
      myMarginPercent: parseFloat(marginInput.replace(",", ".")) || 0
    });
  };

  const diff = typeof suggested === "number" && typeof item.ggselPrice === "number" ? suggested - item.ggselPrice : undefined;
  const isStale = typeof diff === "number" && Math.abs(diff) > 1;

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isStale ? "border-amber-500/30 bg-amber-500/5" : "border-white/5 bg-[#111112]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{item.title}</p>
          <p className="text-[11px] text-gray-500">
            Steam ({STEAM_COUNTRY_LABELS[item.steamCountryCode] || item.steamCountryCode.toUpperCase()}):{" "}
            {typeof steamPrice === "number" ? `${steamPrice} ${steamCurrency}` : "немає даних"}
            {steamTrend === "up" && <span className="text-amber-400 ml-1">↑ подорожчав</span>}
            {steamTrend === "down" && <span className="text-emerald-400 ml-1">↓ подешевшав</span>}
          </p>
        </div>
        <button onClick={() => onRemove(item.id)} className="p-1 hover:bg-white/5 rounded cursor-pointer shrink-0" title="Прибрати">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {isStale && typeof suggested === "number" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Рекомендована ціна на ggsel: <b>{suggested.toFixed(2)} ₽</b> (зараз {item.ggselPrice?.toFixed(2)} ₽) — онови вручну на ggsel.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div>
          <label className={labelClass}>Ціна на ggsel, ₽</label>
          <input value={priceInput} onChange={e => setPriceInput(e.target.value)} onBlur={commitPrice} inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Розрахована ціна, ₽</label>
          <div className="px-2 py-1.5 text-sm font-mono font-bold text-emerald-400">
            {typeof suggested === "number" ? suggested.toFixed(2) : "—"}
          </div>
        </div>
        {needsRate && (
          <div>
            <label className={labelClass}>Курс {steamCurrency}→₽</label>
            <input value={rateInput} onChange={e => setRateInput(e.target.value)} onBlur={commitFields} inputMode="decimal" className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>Комісія 1, %</label>
          <input value={c1Input} onChange={e => setC1Input(e.target.value)} onBlur={commitFields} inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Комісія 2, %</label>
          <input value={c2Input} onChange={e => setC2Input(e.target.value)} onBlur={commitFields} inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Мій %</label>
          <input value={marginInput} onChange={e => setMarginInput(e.target.value)} onBlur={commitFields} inputMode="decimal" className={inputClass} />
        </div>
      </div>
    </div>
  );
}
