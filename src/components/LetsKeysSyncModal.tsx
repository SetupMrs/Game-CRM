import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, RefreshCw, Check, AlertCircle, Package, Zap, StopCircle } from "lucide-react";
import { fetchLetsKeysProducts, fetchLetsKeysVariations, LetsKeysProduct, LetsKeysVariation } from "../apiClient";

interface LetsKeysSyncModalProps {
  supplierId: string;
  onClose: () => void;
  onImport: (supplierId: string, jobs: { productId: number; productName: string; region: string; variations: LetsKeysVariation[] }[]) => Promise<{ addedCount: number; updatedCount: number; priceChangedCount: number; success: boolean }>;
}

interface BulkSummary {
  addedCount: number;
  updatedCount: number;
  priceChangedCount: number;
  failedCount: number;
  saveFailed?: boolean;
}

export default function LetsKeysSyncModal({ supplierId, onClose, onImport }: LetsKeysSyncModalProps) {
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<LetsKeysProduct[]>([]);

  // --- Bulk "sync everything" flow (the default, primary action) ---
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSummary | null>(null);
  const cancelRef = useRef(false);

  // --- Manual "one specific product" flow (secondary, for a targeted update) ---
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<LetsKeysProduct | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [isLoadingVariations, setIsLoadingVariations] = useState(false);
  const [variationsError, setVariationsError] = useState<string | null>(null);
  const [variations, setVariations] = useState<LetsKeysVariation[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ addedCount: number; updatedCount: number; priceChangedCount: number; success: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingProducts(true);
      const result = await fetchLetsKeysProducts();
      if (result.success && result.products) {
        // Defensive: guard against any product missing expected fields, so
        // one malformed entry from the supplier's API can't crash the app.
        const cleaned = result.products
          .filter(p => p && typeof p.id !== "undefined")
          .map(p => ({
            ...p,
            name: p.name || `Товар #${p.id}`,
            regions: Array.isArray(p.regions) ? p.regions : [],
            category_type: p.category_type || ""
          }));
        setAllProducts(cleaned);
      } else {
        setProductsError(result.message || "Не вдалося завантажити каталог LetsKeys.");
      }
      setIsLoadingProducts(false);
    })();
    return () => { cancelRef.current = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 15);
  }, [allProducts, query]);

  const totalJobsCount = useMemo(
    () => allProducts.reduce((sum, p) => sum + (p.regions?.length || 0), 0),
    [allProducts]
  );

  const handleBulkSyncAll = async () => {
    if (allProducts.length === 0 || isBulkSyncing) return;
    if (!window.confirm(
      `Синхронізувати весь каталог LetsKeys (${allProducts.length} товарів, ${totalJobsCount} запитів по регіонах)? Це може зайняти кілька хвилин.`
    )) {
      return;
    }

    cancelRef.current = false;
    setIsBulkSyncing(true);
    setBulkResult(null);

    const jobs: { product: LetsKeysProduct; region: string }[] = [];
    allProducts.forEach(p => {
      (p.regions || []).forEach(region => jobs.push({ product: p, region }));
    });

    // Accumulate every job's fetched variations locally first — we only
    // touch shared app state / save to the server ONCE, at the very end.
    // Calling onImport per job would mean hundreds of full-database saves
    // (extremely slow) and a real risk of lost updates if two jobs' saves
    // raced against each other.
    const collected: { productId: number; productName: string; region: string; variations: LetsKeysVariation[] }[] = [];
    let failedCount = 0;
    let completedCount = 0;
    const CONCURRENCY = 5; // a handful of requests in flight at once, not one-by-one

    const runJob = async (job: { product: LetsKeysProduct; region: string }) => {
      if (cancelRef.current) return;
      try {
        const result = await fetchLetsKeysVariations(job.product.id, job.region);
        if (result.success && result.variations && result.variations.length > 0) {
          collected.push({ productId: job.product.id, productName: job.product.name, region: job.region, variations: result.variations });
        } else if (!result.success) {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
      completedCount++;
      setBulkProgress({ current: completedCount, total: jobs.length, label: `${job.product.name} — ${job.region}` });
    };

    // Simple concurrency pool: CONCURRENCY workers each pull the next job
    // off the shared queue until it's empty or the user cancels.
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < jobs.length && !cancelRef.current) {
        const job = jobs[nextIndex++];
        await runJob(job);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));

    const summary = collected.length > 0
      ? await onImport(supplierId, collected)
      : { addedCount: 0, updatedCount: 0, priceChangedCount: 0, success: true };

    setBulkResult({
      addedCount: summary.addedCount,
      updatedCount: summary.updatedCount,
      priceChangedCount: summary.priceChangedCount,
      failedCount,
      saveFailed: !summary.success
    });
    setBulkProgress(null);
    setIsBulkSyncing(false);
  };

  const handleCancelBulkSync = () => {
    cancelRef.current = true;
  };

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

  const handleImport = async () => {
    if (!selectedProduct || variations.length === 0) return;
    setIsImporting(true);
    const result = await onImport(supplierId, [{ productId: selectedProduct.id, productName: selectedProduct.name, region: selectedRegion || "", variations }]);
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

          {/* Primary action: sync the entire catalog automatically */}
          <div className="bg-[#161618] border border-white/5 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">Синхронізувати весь каталог</p>
                <p className="text-[11px] text-gray-500">
                  Автоматично завантажить усі {allProducts.length || "…"} товарів з усіма регіонами і цінами — без ручного вибору.
                </p>
              </div>
            </div>

            {isBulkSyncing && bulkProgress ? (
              <div className="space-y-2">
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 truncate">
                  {bulkProgress.current}/{bulkProgress.total} · {bulkProgress.label}
                </p>
                <button
                  onClick={handleCancelBulkSync}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-600/15 border border-red-500/20 hover:bg-red-600/25 text-red-400 text-xs font-bold py-2 rounded-lg cursor-pointer"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  Зупинити
                </button>
              </div>
            ) : (
              <button
                onClick={handleBulkSyncAll}
                disabled={isLoadingProducts || allProducts.length === 0}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-lg cursor-pointer"
              >
                {isLoadingProducts ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Завантаження каталогу...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Синхронізувати все ({allProducts.length} товарів)
                  </>
                )}
              </button>
            )}

            {bulkResult && (
              bulkResult.saveFailed ? (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Товари завантажились з LetsKeys, але **не збереглися на сервері** — інші користувачі їх не побачать, і при перезавантаженні сторінки вони зникнуть і у вас. Перевірте з'єднання і повторіть синхронізацію.
                  </span>
                </div>
              ) : (
                <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Готово, збережено на сервері! Додано: {bulkResult.addedCount}, оновлено: {bulkResult.updatedCount}
                    {bulkResult.priceChangedCount > 0 && `, зміна ціни: ${bulkResult.priceChangedCount}`}
                    {bulkResult.failedCount > 0 && `. Не вдалось обробити: ${bulkResult.failedCount}`}.
                  </span>
                </div>
              )
            )}
          </div>

          {/* Secondary: manual search for a single product, e.g. for a quick one-off update */}
          <div className="pt-1">
            <button
              onClick={() => setShowManualPicker(!showManualPicker)}
              className="text-[11px] text-gray-500 hover:text-white underline cursor-pointer"
              disabled={isBulkSyncing}
            >
              {showManualPicker ? "Сховати ручний вибір" : "Або оновити лише один конкретний товар"}
            </button>
          </div>

          {showManualPicker && (
            <div className="space-y-3 border-t border-white/5 pt-3">
              {!selectedProduct && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Знайдіть товар (гру/сервіс)
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
                            <p className="text-[10px] text-gray-500">{p.category_type} · {p.regions?.length || 0} регіонів</p>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 text-center py-4">Нічого не знайдено.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                      Оберіть регіон
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedProduct.regions || []).map(region => (
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

                  {selectedRegion && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Варіації для імпорту
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
                            importResult.success ? (
                              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-2">
                                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                  Готово, збережено на сервері! Додано: {importResult.addedCount}, оновлено: {importResult.updatedCount}
                                  {importResult.priceChangedCount > 0 && `, зміна ціни: ${importResult.priceChangedCount}`}.
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                  Дані порахувались локально, але **не збереглися на сервері** — інші користувачі їх не побачать. Перевірте з'єднання і спробуйте ще раз.
                                </span>
                              </div>
                            )
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
          )}
        </div>
      </div>
    </div>
  );
}
