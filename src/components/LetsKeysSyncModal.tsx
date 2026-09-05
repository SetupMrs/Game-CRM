import React, { useEffect, useMemo, useState } from "react";
import { Search, X, RefreshCw, Check, AlertCircle, Package } from "lucide-react";
import { fetchLetsKeysProducts, fetchLetsKeysVariations, LetsKeysProduct, LetsKeysVariation } from "../apiClient";

interface LetsKeysSyncModalProps {
  supplierId: string;
  onClose: () => void;
  onImport: (supplierId: string, productId: number, variations: LetsKeysVariation[]) => { addedCount: number; updatedCount: number; priceChangedCount: number };
}

export default function LetsKeysSyncModal({ supplierId, onClose, onImport }: LetsKeysSyncModalProps) {
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<LetsKeysProduct[]>([]);
  const [query, setQuery] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<LetsKeysProduct | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const [isLoadingVariations, setIsLoadingVariations] = useState(false);
  const [variationsError, setVariationsError] = useState<string | null>(null);
  const [variations, setVariations] = useState<LetsKeysVariation[]>([]);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ addedCount: number; updatedCount: number; priceChangedCount: number } | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingProducts(true);
      const result = await fetchLetsKeysProducts();
      if (result.success && result.products) {
        setAllProducts(result.products);
      } else {
        setProductsError(result.message || "Не вдалося завантажити каталог LetsKeys.");
      }
      setIsLoadingProducts(false);
    })();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 15);
  }, [allProducts, query]);

  const handleSelectProduct = (product: LetsKeysProduct) => {
    setSelectedProduct(product);
    setSelectedRegion(null);
    setVariations([]);
    setImportResult(null);
    setQuery("");
  };

  const handleSelectRegion = async (region: string) => {
    if (!selectedProduct) return;
    setSelectedRegion(region);
    setVariations([]);
    setImportResult(null);
    setIsLoadingVariations(true);
    setVariationsError(null);

    const result = await fetchLetsKeysVariations(selectedProduct.id, region);
    if (result.success && result.variations) {
      setVariations(result.variations);
    } else {
      setVariationsError(result.message || "Не вдалося завантажити варіації товару.");
    }
    setIsLoadingVariations(false);
  };

  const handleImport = () => {
    if (!selectedProduct || variations.length === 0) return;
    setIsImporting(true);
    const result = onImport(supplierId, selectedProduct.id, variations);
    setImportResult(result);
    setIsImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
        <div className="px-6 py-4 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-400" />
            Синхронізація з LetsKeys
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {productsError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{productsError}</span>
            </div>
          )}

          {/* Step 1: search + pick a product */}
          {!selectedProduct && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                1. Знайдіть товар (гру/сервіс)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isLoadingProducts ? "Завантаження каталогу..." : "напр. Xbox Game Pass"}
                  disabled={isLoadingProducts}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500 disabled:opacity-50"
                />
              </div>
              {query.trim() && (
                <div className="border border-white/10 rounded-lg max-h-64 overflow-y-auto divide-y divide-white/5">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 cursor-pointer"
                      >
                        <p className="text-xs text-white font-semibold">{p.name}</p>
                        <p className="text-[10px] text-gray-500">{p.category_type} · {p.regions.length} регіонів</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 text-center py-4">Нічого не знайдено.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: pick a region */}
          {selectedProduct && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#161618] border border-white/5 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-white">{selectedProduct.name}</p>
                  <p className="text-[10px] text-gray-500">{selectedProduct.category_type}</p>
                </div>
                <button
                  onClick={() => { setSelectedProduct(null); setSelectedRegion(null); setVariations([]); setImportResult(null); }}
                  className="text-[10px] text-gray-500 hover:text-white underline cursor-pointer shrink-0"
                >
                  Обрати інший товар
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  2. Оберіть регіон
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProduct.regions.map(region => (
                    <button
                      key={region}
                      onClick={() => handleSelectRegion(region)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        selectedRegion === region
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "bg-white/[0.01] border-white/10 text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: variations preview + import */}
              {selectedRegion && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    3. Варіації для імпорту
                  </label>

                  {isLoadingVariations ? (
                    <p className="text-xs text-gray-500 text-center py-4">Завантаження...</p>
                  ) : variationsError ? (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      {variationsError}
                    </div>
                  ) : variations.length > 0 ? (
                    <>
                      <div className="border border-white/10 rounded-lg max-h-56 overflow-y-auto divide-y divide-white/5">
                        {variations.map(v => (
                          <div key={v.id} className="flex items-center justify-between px-3 py-2 text-xs">
                            <div className="min-w-0">
                              <p className="text-white truncate">{v.name}</p>
                              <p className={`text-[10px] ${v.in_stock ? "text-emerald-400" : "text-red-400"}`}>
                                {v.in_stock ? "в наявності" : "немає в наявності"}
                              </p>
                            </div>
                            <span className="font-mono font-bold text-gray-300 shrink-0">{v.price}</span>
                          </div>
                        ))}
                      </div>

                      {importResult ? (
                        <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-2">
                          <Check className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            Готово! Додано: {importResult.addedCount}, оновлено: {importResult.updatedCount}
                            {importResult.priceChangedCount > 0 && `, зміна ціни: ${importResult.priceChangedCount}`}.
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={handleImport}
                          disabled={isImporting}
                          className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-lg cursor-pointer"
                        >
                          {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Імпортувати {variations.length} варіацій
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 text-center py-4">Для цього регіону немає варіацій.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
