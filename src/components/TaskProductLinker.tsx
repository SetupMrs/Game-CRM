import React, { useMemo, useState } from "react";
import { Package, Plus, X, AlertTriangle, Search, Truck } from "lucide-react";
import { Supplier, TaskLinkedProduct } from "../types";
import { generateId } from "../utils";

interface TaskProductLinkerProps {
  suppliers: Supplier[];
  linkedProducts: TaskLinkedProduct[];
  onChange: (linkedProducts: TaskLinkedProduct[]) => void;
}

interface SearchEntry {
  key: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productTitle: string;
  itemId?: string;
  itemCode?: string;
  itemStatus?: "Available" | "Sold";
}

const MAX_RESULTS = 8;

export default function TaskProductLinker({ suppliers, linkedProducts, onChange }: TaskProductLinkerProps) {
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [staged, setStaged] = useState<SearchEntry | null>(null);
  const [issueNote, setIssueNote] = useState("");

  // Flattened, searchable index: one entry per product, plus one entry per
  // individual code/item (so a specific sold code can be found directly).
  const allEntries = useMemo(() => {
    const entries: SearchEntry[] = [];
    suppliers.forEach(s => {
      s.products.forEach(p => {
        entries.push({
          key: `p-${p.id}`,
          supplierId: s.id,
          supplierName: s.name,
          productId: p.id,
          productTitle: p.title
        });
        (p.items || []).forEach(item => {
          entries.push({
            key: `i-${item.id}`,
            supplierId: s.id,
            supplierName: s.name,
            productId: p.id,
            productTitle: p.title,
            itemId: item.id,
            itemCode: item.code,
            itemStatus: item.status
          });
        });
      });
    });
    return entries;
  }, [suppliers]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allEntries
      .filter(e =>
        e.productTitle.toLowerCase().includes(q) ||
        e.supplierName.toLowerCase().includes(q) ||
        (e.itemCode && e.itemCode.toLowerCase().includes(q))
      )
      .slice(0, MAX_RESULTS);
  }, [allEntries, query]);

  const handleSelectEntry = (entry: SearchEntry) => {
    setStaged(entry);
    setQuery("");
    setIsDropdownOpen(false);
  };

  const handleAdd = () => {
    if (!staged) return;
    const newLink: TaskLinkedProduct = {
      id: generateId("link"),
      supplierId: staged.supplierId,
      supplierName: staged.supplierName,
      productId: staged.productId,
      productTitle: staged.productTitle,
      itemId: staged.itemId,
      itemCode: staged.itemCode,
      issueNote: issueNote.trim() || undefined
    };
    onChange([...linkedProducts, newLink]);
    setStaged(null);
    setIssueNote("");
  };

  const handleRemove = (id: string) => {
    onChange(linkedProducts.filter(l => l.id !== id));
  };

  const hasCatalog = allEntries.length > 0;

  return (
    <div className="space-y-2.5">
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" />
        Прив'язані товари (опціонально)
      </label>

      {/* Existing linked products */}
      {linkedProducts.length > 0 && (
        <div className="space-y-1.5">
          {linkedProducts.map((link) => (
            <div
              key={link.id}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs ${
                link.issueNote
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-white/[0.02] border-white/10"
              }`}
            >
              {link.issueNote ? (
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              ) : (
                <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-semibold truncate">
                  {link.productTitle}
                  {link.itemCode && <span className="text-gray-500 font-mono"> · {link.itemCode}</span>}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {link.supplierName}
                  {link.issueNote && <span className="text-red-400"> · {link.issueNote}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(link.id)}
                className="p-1 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new link */}
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-lg p-2.5 space-y-2">
        {!hasCatalog ? (
          <p className="text-[11px] text-gray-500 py-1">
            У постачальників ще немає жодного товару, щоб прив'язати.
          </p>
        ) : staged ? (
          /* Selected product preview, ready to attach */
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-2">
            <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-100 font-semibold truncate">
                {staged.productTitle}
                {staged.itemCode && <span className="text-gray-400 font-mono"> · {staged.itemCode}</span>}
              </p>
              <p className="text-[10px] text-gray-500 truncate">{staged.supplierName}</p>
            </div>
            <button
              type="button"
              onClick={() => setStaged(null)}
              className="p-1 text-gray-500 hover:text-white cursor-pointer shrink-0"
              title="Обрати інший товар"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Search box */
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsDropdownOpen(true); }}
              onFocus={() => setIsDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsDropdownOpen(false), 150)}
              placeholder='Пошук товару, коду або постачальника, напр. "Xbox RU"...'
              className="w-full pl-8 pr-3 py-2 text-xs border border-white/10 rounded-lg bg-[#161618] text-white focus:outline-hidden focus:border-emerald-500"
            />
            {isDropdownOpen && query.trim() && (
              <div className="absolute z-20 mt-1 w-full bg-[#1c1c1f] border border-white/10 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
                {results.length > 0 ? (
                  results.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      onMouseDown={() => handleSelectEntry(entry)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 text-left cursor-pointer border-b border-white/5 last:border-0"
                    >
                      <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-100 truncate">
                          {entry.productTitle}
                          {entry.itemCode && <span className="text-gray-400 font-mono"> · {entry.itemCode}</span>}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                          <Truck className="w-2.5 h-2.5" />
                          {entry.supplierName}
                          {entry.itemStatus && (
                            <span className={entry.itemStatus === "Sold" ? "text-amber-500" : "text-emerald-500"}>
                              · {entry.itemStatus === "Sold" ? "продано" : "в наявності"}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-[11px] text-gray-500 px-2.5 py-3 text-center">Нічого не знайдено.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            placeholder='Проблема, напр. "Не працює", "Клієнт скаржиться на бан"...'
            className="flex-1 px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!staged}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Додати
          </button>
        </div>
      </div>
    </div>
  );
}
