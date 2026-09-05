import React, { useState } from "react";
import { Wallet, Plus, Trash2, Save, Star } from "lucide-react";

interface CurrencyRatesPanelProps {
  baseCurrency: string;
  currencyRates: Record<string, number>;
  onUpdateCurrencyRates?: (rates: Record<string, number>) => void;
  onSetBaseCurrency?: (currency: string) => void;
}

export default function CurrencyRatesPanel({
  baseCurrency,
  currencyRates,
  onUpdateCurrencyRates,
  onSetBaseCurrency
}: CurrencyRatesPanelProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.keys(currencyRates).forEach((code) => {
      initial[code] = String(currencyRates[code]);
    });
    return initial;
  });
  const [newCode, setNewCode] = useState("");

  const codes = Object.keys(draft).sort((a, b) =>
    a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b)
  );

  const handleRateChange = (code: string, value: string) => {
    setDraft(prev => ({ ...prev, [code]: value }));
  };

  const handleAddCurrency = () => {
    const code = newCode.trim().toUpperCase();
    if (!code || draft[code]) return;
    setDraft(prev => ({ ...prev, [code]: "1" }));
    setNewCode("");
  };

  const handleRemoveCurrency = (code: string) => {
    if (code === baseCurrency) return;
    setDraft(prev => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  const handleSave = () => {
    const rates: Record<string, number> = { [baseCurrency]: 1 };
    Object.keys(draft).forEach((code) => {
      const value = draft[code];
      const num = parseFloat(value);
      if (code !== baseCurrency && !isNaN(num) && num > 0) {
        rates[code] = num;
      }
    });
    onUpdateCurrencyRates?.(rates);
  };

  const handleMakeBase = (code: string) => {
    if (code === baseCurrency || !onSetBaseCurrency) return;
    onSetBaseCurrency(code);
  };

  return (
    <div className="bg-[#111112] rounded-xl border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-white/5 flex-wrap">
        <Wallet className="w-4 h-4 text-emerald-400" />
        <h4 className="text-sm font-bold text-white">Курси валют</h4>
        <span className="text-[11px] text-gray-500">
          — базова валюта <span className="font-bold text-emerald-400">{baseCurrency}</span>, курси інших вказуються відносно неї
        </span>
      </div>

      <div className="space-y-2">
        {codes.map(code => (
          <div key={code} className="flex items-center gap-2">
            {onSetBaseCurrency && (
              <button
                onClick={() => handleMakeBase(code)}
                disabled={code === baseCurrency}
                title={code === baseCurrency ? "Це базова валюта" : `Зробити ${code} базовою валютою`}
                className={`p-1 rounded shrink-0 cursor-pointer disabled:cursor-default ${
                  code === baseCurrency ? "text-amber-400" : "text-gray-600 hover:text-amber-400"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${code === baseCurrency ? "fill-amber-400" : ""}`} />
              </button>
            )}
            <span className="w-14 text-xs font-mono font-bold text-gray-300 shrink-0">{code}</span>
            <span className="text-[11px] text-gray-500 shrink-0">1 {code} =</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={draft[code]}
              disabled={code === baseCurrency}
              onChange={(e) => handleRateChange(code, e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-mono"
            />
            <span className="text-[11px] text-gray-500 shrink-0">{baseCurrency}</span>
            {code !== baseCurrency && (
              <button
                onClick={() => handleRemoveCurrency(code)}
                className="p-1 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                title="Прибрати валюту"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <input
          type="text"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="Код валюти, напр. UAH, EUR"
          maxLength={6}
          className="flex-1 px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500 uppercase"
        />
        <button
          onClick={handleAddCurrency}
          disabled={!newCode.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-semibold rounded-lg cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Додати
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          Зберегти курси
        </button>
      </div>

      <p className="text-[10px] text-gray-600">
        Натисніть на зірку біля валюти, щоб зробити її базовою (тоді підсумки й бюджет рахуватимуться в ній).
      </p>
    </div>
  );
}
