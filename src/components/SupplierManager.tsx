import React, { useState, useMemo, useEffect } from "react";
import { 
  Truck, 
  User, 
  Phone, 
  Mail, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Circle, 
  Search, 
  Tag, 
  AlertCircle, 
  Layers,
  X,
  Globe,
  DollarSign,
  CheckCircle2,
  Filter,
  ClipboardList,
  Database,
  Copy,
  Check,
  Settings,
  RefreshCw,
  Package
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Supplier, ProductCard, Task, CategoryItem } from "../types";
import { generateId, formatDate } from "../utils";
import { fetchLetsKeysProducts, fetchLetsKeysVariations, LetsKeysProduct, LetsKeysVariation } from "../apiClient";
import LetsKeysSyncModal from "./LetsKeysSyncModal";

interface SupplierManagerProps {
  suppliers: Supplier[];
  tasks?: Task[];
  onAddSupplier: (supplier: Omit<Supplier, "id" | "isClosed" | "products">) => void;
  onToggleSupplierStatus: (id: string) => void;
  onToggleSupplierLetsKeysLink?: (id: string) => void;
  onDeleteSupplier: (id: string) => void;
  onAddProduct: (supplierId: string, product: Omit<ProductCard, "id">) => void;
  onAddProducts?: (supplierId: string, products: Omit<ProductCard, "id">[]) => void;
  onUpdateProduct?: (supplierId: string, productId: string, product: ProductCard) => void;
  onDeleteProduct: (supplierId: string, productId: string) => void;
  onToggleProductAdded?: (supplierId: string, productId: string) => void;
  onImportLetsKeysVariations?: (supplierId: string, jobs: { productId: number; productName: string; region: string; variations: LetsKeysVariation[] }[]) => { addedCount: number; updatedCount: number; priceChangedCount: number };
  onAddTask?: (task: Omit<Task, "id">) => void;
  onUpdateTask?: (task: Task) => void;
}

// Smart batch parsing helper
const REGIONS_AND_CURRENCIES = new Set([
  "USD", "EUR", "TRY", "PLN", "UAH", "GBP", "RUB", "CNY", "KZT", "GEL", "BRL",
  "AED", "HKD", "CAD", "AUD", "DKK", "NOK", "SEK", "CHF", "HUF", "RON", "JPY",
  "SAR", "QAR", "KWD", "SGD", "PEN", "COP", "VND", "KRW", "CLP", "MXN", "THB",
  "INR", "PKR", "NZD", "TWD", "ZAR", "IDR", "PHP", "MYR", "US", "EU", "ASIA",
  "GLOBAL", "USDT"
]);

const isPureCurrencyOrRegion = (s: string): string | null => {
  const clean = s.replace(/[\[\]\(\)\$\:\,\;]/g, "").trim().toUpperCase();
  if (REGIONS_AND_CURRENCIES.has(clean)) {
    return clean;
  }
  return null;
};

const isPureQuantityOrPrice = (s: string): number | null => {
  const clean = s.replace(/[\(\)\[\]]/g, "").trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    const val = parseInt(clean, 10);
    if (!isNaN(val) && val >= 0) return val;
  }
  const qtyMatch = clean.match(/^(\d+)\s*(шт|шт\.|pcs|pc|x|k)$/i);
  if (qtyMatch) {
    let val = parseInt(qtyMatch[1], 10);
    if (qtyMatch[2].toLowerCase() === "k") val *= 1000;
    return val;
  }
  const priceMatch = clean.match(/^(\$|usdt|usd|eur|uah|try|pln|sek)?\s*(\d+)\s*(\$|usdt|usd|eur|uah|try|pln|sek)?$/i);
  if (priceMatch) {
    const val = parseInt(priceMatch[2], 10);
    if (!isNaN(val)) return val;
  }
  return null;
};

const isIgnoredLine = (s: string): boolean => {
  const clean = s.trim().toUpperCase();
  if (!clean) return true;
  if (clean === "BASIC" || clean === "ADD" || clean.includes("ДОБАВИТЬ") || clean.includes("ДОДАТИ") || clean === "●" || clean === "•" || clean === "+") return true;
  if (clean.startsWith("HTTP://") || clean.startsWith("HTTPS://")) return true;
  return false;
};

const extractEmbeddedCurrency = (line: string): string | null => {
  const tokens = line.split(/[\s\(\)\[\]\-\:\,\;]+/);
  for (const token of tokens) {
    const upper = token.trim().toUpperCase();
    if (REGIONS_AND_CURRENCIES.has(upper)) {
      return upper;
    }
  }
  return null;
};

const parseBatchText = (text: string): { title: string; currency: string; count: number }[] => {
  const results: { title: string; currency: string; count: number }[] = [];
  if (!text.trim()) return results;

  let blocks: string[] = [];
  if (text.includes("●") || text.includes("•")) {
    blocks = text.split(/[●•]+/).map(b => b.trim()).filter(Boolean);
  } else if (/\n\s*\n/.test(text)) {
    blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  } else {
    blocks = [text.trim()];
  }

  for (const block of blocks) {
    const rawLines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) continue;

    let currentItem: { title: string; currency: string; count: number; explicitCurrency: boolean; explicitCount: boolean } | null = null;
    let pendingCurrency: string | null = null;
    let pendingCount: number | null = null;

    for (const line of rawLines) {
      if (isIgnoredLine(line)) continue;

      // Handle piped / tab / semicolon delimited line
      if (/[\|\t;]/.test(line)) {
        const parts = line.split(/[\|\t;]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (currentItem) {
            results.push({ title: currentItem.title, currency: currentItem.currency, count: currentItem.count });
            currentItem = null;
          }
          const title = parts[0];
          let currency = "USD";
          let count = 1;
          for (let i = 1; i < parts.length; i++) {
            const pCurr = isPureCurrencyOrRegion(parts[i]);
            if (pCurr) currency = pCurr;
            const pQty = isPureQuantityOrPrice(parts[i]);
            if (pQty !== null) count = pQty;
          }
          results.push({ title, currency, count });
          continue;
        }
      }

      const pureCurr = isPureCurrencyOrRegion(line);
      if (pureCurr) {
        if (currentItem) {
          if (currentItem.explicitCurrency && currentItem.explicitCount) {
            results.push({ title: currentItem.title, currency: currentItem.currency, count: currentItem.count });
            currentItem = null;
            pendingCurrency = pureCurr;
          } else {
            currentItem.currency = pureCurr;
            currentItem.explicitCurrency = true;
          }
        } else {
          pendingCurrency = pureCurr;
        }
        continue;
      }

      const pureQty = isPureQuantityOrPrice(line);
      if (pureQty !== null) {
        if (currentItem) {
          if (currentItem.explicitCurrency && currentItem.explicitCount) {
            results.push({ title: currentItem.title, currency: currentItem.currency, count: currentItem.count });
            currentItem = null;
            pendingCount = pureQty;
          } else {
            currentItem.count = pureQty;
            currentItem.explicitCount = true;
          }
        } else {
          pendingCount = pureQty;
        }
        continue;
      }

      // Line is a title / product name line!
      if (currentItem) {
        results.push({ title: currentItem.title, currency: currentItem.currency, count: currentItem.count });
        currentItem = null;
      }

      const embeddedCurr = extractEmbeddedCurrency(line);
      const currency = embeddedCurr || pendingCurrency || "USD";
      const count = pendingCount !== null ? pendingCount : 1;

      const cleanTitle = line.replace(/^[●•\s\-+]+/, "").trim();

      currentItem = {
        title: cleanTitle,
        currency,
        count,
        explicitCurrency: !!embeddedCurr || !!pendingCurrency,
        explicitCount: pendingCount !== null
      };

      pendingCurrency = null;
      pendingCount = null;
    }

    if (currentItem) {
      results.push({ title: currentItem.title, currency: currentItem.currency, count: currentItem.count });
    }
  }

  return results;
};

// Clean and extract actual product codes/licenses, names, and regions from a raw batch text block
interface ParsedCategoryItem {
  code: string;
  title?: string;
  currency?: string;
}

const parseCategoryItemsText = (text: string, categoryTitle: string): ParsedCategoryItem[] => {
  const results: ParsedCategoryItem[] = [];
  const regions = ["USD","EUR","TRY","PLN","UAH","GBP","RUB","CNY","KZT","GEL","BRL","AED","HKD","CAD","AUD","DKK","NOK","SEK","CHF","HUF","RON","JPY","SAR","QAR","KWD","SGD","PEN","COP","VND","KRW","CLP","MXN","THB","INR","PKR","NZD","TWD","ZAR","IDR","PHP","MYR","US","EU","ASIA","GLOBAL"];
  
  const isRegion = (s: string) => {
    const clean = s.trim().toUpperCase();
    return regions.includes(clean);
  };

  const findCodeInLine = (s: string): string => {
    const uuidMatch = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) return uuidMatch[0];
    const genericKeyMatch = s.match(/[a-z0-9]{4,}-[a-z0-9]{4,}-[a-z0-9]{4,}-[a-z0-9]{4,}/i);
    if (genericKeyMatch) return genericKeyMatch[0];
    return "";
  };

  // Determine if it looks like multi-line blocks separated by bullet points
  const hasBullets = text.includes("●") || text.includes("•");
  
  let blocks: string[] = [];
  if (hasBullets) {
    // Split by bullets (● or •)
    blocks = text.split(/[●•]+/).map(b => b.trim()).filter(Boolean);
  } else {
    // If no bullets, check if there are blocks separated by empty lines
    const doubleNewlineBlocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const averageLineCount = doubleNewlineBlocks.length > 0 
      ? doubleNewlineBlocks.reduce((acc, b) => acc + b.split("\n").length, 0) / doubleNewlineBlocks.length 
      : 0;
    if (doubleNewlineBlocks.length > 1 && averageLineCount >= 2) {
      blocks = doubleNewlineBlocks;
    }
  }

  if (blocks.length > 0) {
    // BLOCK PARSING MODE
    for (const block of blocks) {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      let title = "";
      let code = "";
      let currency = "";

      // The title is usually the first line that is NOT metadata or a code
      const candidateTitleLines = lines.filter(line => {
        const up = line.toUpperCase();
        return up !== "BASIC" && 
               !up.includes("ДОБАВИТЬ") && 
               !up.includes("ADD") && 
               !isRegion(line) && 
               !findCodeInLine(line);
      });

      if (candidateTitleLines.length > 0) {
        title = candidateTitleLines[0];
      }

      // Look through lines for code and currency/region
      for (const line of lines) {
        // 1. Try to find standard UUID/key code
        const detectedCode = findCodeInLine(line);
        if (detectedCode) {
          code = detectedCode;
          continue;
        }

        // 2. Try to find region/currency
        const words = line.split(/\s+/);
        const regionWord = words.find(w => isRegion(w));
        if (regionWord) {
          currency = regionWord.toUpperCase();
          continue;
        }
      }

      // If we didn't find a code through UUID/regex, look for any line that is a potential alphanumeric code
      if (!code) {
        for (const line of lines) {
          const up = line.toUpperCase();
          if (line.length >= 8 && 
              !line.includes(" ") && 
              !isRegion(line) && 
              up !== "BASIC" && 
              !line.includes("+") && 
              !line.includes("добавить") && 
              !line.includes("USDT")) {
            code = line;
            break;
          }
        }
      }

      // If we still don't have a title, fallback to categoryTitle
      if (!title) {
        title = categoryTitle;
      }

      // Only add if we found a code or title
      if (code || title) {
        results.push({
          code: code || "N/A",
          title: title,
          currency: currency || undefined
        });
      }
    }
  } else {
    // LINE-BY-LINE PARSING MODE (FALLBACK)
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      let cleanLine = line.replace(/^[●•\s\-+]+/, "").trim();
      if (!cleanLine) continue;

      const up = cleanLine.toUpperCase();
      if (up === "BASIC" || up.includes("ДОБАВИТЬ") || up.includes("ADD") || isRegion(cleanLine) || /^\d{1,3}$/.test(cleanLine) || /^\d+\s*(шт|pcs|pc)$/i.test(cleanLine)) {
        continue;
      }

      const code = findCodeInLine(cleanLine);
      let title = "";
      let currency = "";

      if (code) {
        let remaining = cleanLine.replace(code, "").trim();
        const words = remaining.split(/\s+/);
        const regionWord = words.find(w => isRegion(w));
        if (regionWord) {
          currency = regionWord.toUpperCase();
          remaining = remaining.replace(new RegExp(`\\b${regionWord}\\b`, "i"), "").trim();
        }
        remaining = remaining.replace(/^[\|\-\s:,;[\]()]+|[\|\-\s:,;[\]()]+$/g, "").trim();
        title = remaining || categoryTitle;
      } else {
        const splitDelim = cleanLine.split(/\s*[\-\|:;]\s*/).filter(Boolean);
        if (splitDelim.length >= 2) {
          const possibleCode = splitDelim[splitDelim.length - 1].trim();
          const possibleTitle = splitDelim.slice(0, -1).join(" ").trim();
          results.push({
            code: possibleCode,
            title: possibleTitle,
            currency: undefined
          });
          continue;
        } else {
          results.push({
            code: cleanLine,
            title: categoryTitle,
            currency: undefined
          });
          continue;
        }
      }

      results.push({
        code: code,
        title: title || undefined,
        currency: currency || undefined
      });
    }
  }

  return results;
};

const DEFAULT_PLATFORMS = ["GGsel", "LetsKeys", "FunPay", "Plati.market", "Steam", "Eneba", "Kinguin"];

interface MultiPlatformSelectorProps {
  value: string | undefined;
  onChange: (newValue: string) => void;
  size?: "xs" | "sm" | "md";
  className?: string;
}

function MultiPlatformSelector({ value = "", onChange, size = "sm", className = "" }: MultiPlatformSelectorProps) {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const selectedPlats = useMemo(() => {
    return (value || "").split(",").map(s => s.trim()).filter(Boolean);
  }, [value]);

  const allPlatforms = useMemo(() => {
    const list = [...DEFAULT_PLATFORMS];
    selectedPlats.forEach(p => {
      if (!list.includes(p)) {
        list.push(p);
      }
    });
    return list;
  }, [selectedPlats]);

  const togglePlatform = (plat: string) => {
    let updated: string[];
    if (selectedPlats.includes(plat)) {
      updated = selectedPlats.filter(p => p !== plat);
    } else {
      updated = [...selectedPlats, plat];
    }
    onChange(updated.join(", "));
  };

  const handleAddCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customInput.trim();
    if (trimmed && !selectedPlats.includes(trimmed)) {
      const updated = [...selectedPlats, trimmed];
      onChange(updated.join(", "));
    }
    setCustomInput("");
    setIsAddingCustom(false);
  };

  const isXs = size === "xs";

  return (
    <div className={`flex flex-wrap gap-1 items-center ${className}`}>
      {allPlatforms.map((plat) => {
        const isSelected = selectedPlats.includes(plat);
        return (
          <button
            key={plat}
            type="button"
            onClick={() => togglePlatform(plat)}
            className={`font-bold border transition-all cursor-pointer rounded-xs ${
              isXs
                ? "px-1.5 py-0.5 text-[8px]"
                : size === "sm"
                ? "px-2 py-0.5 text-[9px]"
                : "px-2.5 py-1 text-[10px]"
            } ${
              isSelected
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-500/30"
                : "bg-[#0E0E0F]/50 text-gray-500 border-white/5 hover:text-gray-300 hover:border-white/10"
            }`}
          >
            {plat}
          </button>
        );
      })}

      {isAddingCustom ? (
        <form onSubmit={handleAddCustom} className="flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsAddingCustom(false);
            }}
            placeholder="Назва..."
            className={`border border-indigo-500/50 bg-[#0E0E0F] text-white font-medium rounded-xs focus:outline-hidden ${
              isXs ? "px-1.5 py-0.5 text-[8px] w-16" : "px-2 py-0.5 text-[9px] w-20"
            }`}
          />
          <button
            type="submit"
            className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xs text-[9px] cursor-pointer"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setIsAddingCustom(false)}
            className="px-1 text-gray-400 hover:text-white text-[9px]"
          >
            ✕
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingCustom(true)}
          className={`border border-dashed border-indigo-500/30 text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/60 transition-all font-bold cursor-pointer rounded-xs ${
            isXs ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]"
          }`}
          title="Додати власну назву платформи"
        >
          ＋ Своя
        </button>
      )}
    </div>
  );
}

export default function SupplierManager({
  suppliers = [],
  tasks = [],
  onAddSupplier,
  onToggleSupplierStatus,
  onToggleSupplierLetsKeysLink,
  onDeleteSupplier,
  onAddProduct,
  onAddProducts,
  onUpdateProduct,
  onDeleteProduct,
  onToggleProductAdded,
  onImportLetsKeysVariations,
  onAddTask,
  onUpdateTask
}: SupplierManagerProps) {
  const [isLetsKeysSyncOpen, setIsLetsKeysSyncOpen] = useState(false);

  // Selection and navigation
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    return suppliers.length > 0 ? suppliers[0].id : "";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Closed">("All");
  
  // Catalog-specific filter: All, Added (Додані), Not Added (Не додані)
  const [catalogFilter, setCatalogFilter] = useState<"All" | "Added" | "NotAdded">("All");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  // Large synced catalogs can have thousands of products — rendering them
  // all as animated DOM pills at once makes the whole page janky/slow, so
  // we only render a page at a time and let the user load more on demand.
  const [visibleProductsCount, setVisibleProductsCount] = useState(60);

  // Track which supplier requires deletion confirmation
  const [supplierDeleteConfirmId, setSupplierDeleteConfirmId] = useState<string | null>(null);

  // Add Supplier Modal state
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    notes: ""
  });

  // Add Category/Product Form state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [addProductTab, setAddProductTab] = useState<"single" | "batch">("single");
  const [batchText, setBatchText] = useState("");
  const [newProduct, setNewProduct] = useState({
    title: "",
    currency: "USD",
    count: "10",
    notes: "",
    platform: ""
  });

  // Category Items Modal State
  const [selectedCategoryForItems, setSelectedCategoryForItems] = useState<ProductCard | null>(null);
  const [newItemCode, setNewItemCode] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemRegion, setNewItemRegion] = useState("");
  const [newItemPlatform, setNewItemPlatform] = useState("");
  const [batchItemsText, setBatchItemsText] = useState("");
  const [batchItemsTab, setBatchItemsTab] = useState<"single" | "batch">("single");
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState("");

  // Inline price editor (per product pill) — records price history on save.
  const [editingPriceProductId, setEditingPriceProductId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  // Open Items Manager Modal and initialize inputs
  const handleOpenItemsModal = (prod: ProductCard) => {
    setSelectedCategoryForItems(prod);
    setNewItemTitle("");
    setNewItemRegion(prod.currency || "USD");
    setNewItemCode("");
    setNewItemPlatform(prod.platform || "");
    setModalSearchQuery(catalogSearchQuery);
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedItemId(id);
    setTimeout(() => {
      setCopiedItemId(null);
    }, 1500);
  };

  // Find currently selected supplier
  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0] || null;
  }, [suppliers, selectedSupplierId]);

  // Memoized current open category details
  const currentCategory = useMemo(() => {
    if (!selectedCategoryForItems || !selectedSupplier) return null;
    return (selectedSupplier.products || []).find(p => p.id === selectedCategoryForItems.id) || null;
  }, [selectedCategoryForItems, selectedSupplier]);

  // Add individual item to category
  const handleAddItemToCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !currentCategory || !newItemCode.trim() || !onUpdateProduct) return;

    const newItem = {
      id: generateId("item"),
      code: newItemCode.trim(),
      title: newItemTitle.trim() || currentCategory.title,
      currency: newItemRegion.trim().toUpperCase() || currentCategory.currency || "USD",
      status: "Available" as const,
      isAdded: false,
      createdAt: new Date().toLocaleDateString("uk-UA"),
      platform: newItemPlatform.trim() || undefined
    };

    const updatedCategory = {
      ...currentCategory,
      items: [...(currentCategory.items || []), newItem],
      count: (currentCategory.items || []).length + 1
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
    setNewItemCode("");
    setNewItemTitle("");
  };

  // Add batch items to category
  const handleBatchAddItemsToCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !currentCategory || !batchItemsText.trim() || !onUpdateProduct) return;

    const parsedItems = parseCategoryItemsText(batchItemsText, currentCategory.title);
    if (parsedItems.length === 0) return;

    const newItems = parsedItems.map((item, index) => ({
      id: generateId("item"),
      code: item.code,
      title: item.title || currentCategory.title,
      currency: item.currency || currentCategory.currency || "USD",
      status: "Available" as const,
      isAdded: false,
      createdAt: new Date().toLocaleDateString("uk-UA"),
      platform: newItemPlatform.trim() || undefined
    }));

    const updatedCategory = {
      ...currentCategory,
      items: [...(currentCategory.items || []), ...newItems],
      count: (currentCategory.items || []).length + newItems.length
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
    setBatchItemsText("");
  };

  // Delete individual item from category
  const handleDeleteItemFromCategory = (itemId: string) => {
    if (!selectedSupplier || !currentCategory || !onUpdateProduct) return;

    const updatedItems = (currentCategory.items || []).filter(item => item.id !== itemId);
    const updatedCategory = {
      ...currentCategory,
      items: updatedItems,
      count: updatedItems.length
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
  };

  // Toggle item status (Available / Sold)
  const handleToggleItemStatus = (itemId: string) => {
    if (!selectedSupplier || !currentCategory || !onUpdateProduct) return;

    const updatedItems = (currentCategory.items || []).map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          status: item.status === "Available" ? ("Sold" as const) : ("Available" as const)
        };
      }
      return item;
    });

    const updatedCategory = {
      ...currentCategory,
      items: updatedItems
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
  };

  // Update platform for an individual item
  const handleUpdateItemPlatform = (itemId: string, platform: string) => {
    if (!selectedSupplier || !currentCategory || !onUpdateProduct) return;

    const updatedItems = (currentCategory.items || []).map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          platform: platform || undefined
        };
      }
      return item;
    });

    const updatedCategory = {
      ...currentCategory,
      items: updatedItems
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
  };

  // Update category general fields (title, currency, platform)
  const handleUpdateCategoryDetails = (updatedFields: Partial<ProductCard>) => {
    if (!selectedSupplier || !currentCategory || !onUpdateProduct) return;

    const updatedCategory = {
      ...currentCategory,
      ...updatedFields
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);
  };

  // Toggle item addition mark (Done/Not Done)
  const handleToggleItemAdded = (itemId: string) => {
    if (!selectedSupplier || !currentCategory || !onUpdateProduct) return;

    const targetItem = (currentCategory.items || []).find(item => item.id === itemId);
    if (!targetItem) return;
    const nextIsAdded = !targetItem.isAdded;

    const updatedItems = (currentCategory.items || []).map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          isAdded: nextIsAdded
        };
      }
      return item;
    });

    const allItemsAdded = updatedItems.length > 0 && updatedItems.every(i => i.isAdded);

    const updatedCategory = {
      ...currentCategory,
      isAdded: allItemsAdded,
      items: updatedItems
    };

    onUpdateProduct(selectedSupplier.id, currentCategory.id, updatedCategory);

    if (onUpdateTask) {
      const displayTitle = targetItem.title || `${currentCategory.title} (Код: ${targetItem.code})`;
      const matchedTask = (tasks || []).find(
        t => (t.title.includes(displayTitle) || t.title.includes(targetItem.code) || (t.description && t.description.includes(targetItem.code))) &&
             t.counterparty === selectedSupplier.name
      );
      if (matchedTask) {
        onUpdateTask({
          ...matchedTask,
          status: nextIsAdded ? "Completed" : "In Progress"
        });
      }
    }
  };

  // Toggle item addition mark (Done/Not Done) for a specific product
  const handleToggleItemAddedForProduct = (productId: string, itemId: string) => {
    if (!selectedSupplier || !onUpdateProduct) return;
    const prod = (selectedSupplier.products || []).find(p => p.id === productId);
    if (!prod) return;

    const targetItem = (prod.items || []).find(item => item.id === itemId);
    if (!targetItem) return;
    const nextIsAdded = !targetItem.isAdded;

    const updatedItems = (prod.items || []).map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          isAdded: nextIsAdded
        };
      }
      return item;
    });

    const allItemsAdded = updatedItems.length > 0 && updatedItems.every(i => i.isAdded);

    const updatedCategory = {
      ...prod,
      isAdded: allItemsAdded,
      items: updatedItems
    };

    onUpdateProduct(selectedSupplier.id, productId, updatedCategory);

    if (onUpdateTask) {
      const displayTitle = targetItem.title || `${prod.title} (Код: ${targetItem.code})`;
      const matchedTask = (tasks || []).find(
        t => (t.title.includes(displayTitle) || t.title.includes(targetItem.code) || (t.description && t.description.includes(targetItem.code))) &&
             t.counterparty === selectedSupplier.name
      );
      if (matchedTask) {
        onUpdateTask({
          ...matchedTask,
          status: nextIsAdded ? "Completed" : "In Progress"
        });
      }
    }
  };

  // Adjust selected ID if list changes or becomes empty
  React.useEffect(() => {
    if (suppliers.length > 0 && !suppliers.some(s => s.id === selectedSupplierId)) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  // Calculate high-fidelity stats
  const stats = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => !s.isClosed).length;
    const closed = suppliers.filter((s) => s.isClosed).length;
    const totalProds = suppliers.reduce((acc, s) => acc + (s.products?.length || 0), 0);
    return { total, active, closed, totalProds };
  }, [suppliers]);

  // Filter suppliers list by search query and status filter
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesSearch = 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.products && s.products.some((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Active" && !s.isClosed) ||
        (statusFilter === "Closed" && s.isClosed);

      return matchesSearch && matchesStatus;
    });
  }, [suppliers, searchQuery, statusFilter]);

  // Handle supplier submission
  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name.trim()) return;

    onAddSupplier({
      name: newSupplier.name.trim(),
      contactPerson: newSupplier.contactPerson.trim() || undefined,
      phone: newSupplier.phone.trim() || undefined,
      email: newSupplier.email.trim() || undefined,
      notes: newSupplier.notes.trim() || undefined
    });

    // Reset Form
    setNewSupplier({
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      notes: ""
    });
    setIsAddSupplierOpen(false);
  };

  // Handle Product Category addition
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !newProduct.title.trim()) return;

    const countNum = parseInt(newProduct.count, 10);
    onAddProduct(selectedSupplier.id, {
      title: newProduct.title.trim(),
      currency: newProduct.currency.trim().toUpperCase(),
      count: isNaN(countNum) ? 0 : countNum,
      isAdded: false,
      notes: newProduct.notes.trim() || undefined,
      platform: newProduct.platform.trim() || undefined
    });

    // Reset Form
    setNewProduct({
      title: "",
      currency: "USD",
      count: "10",
      notes: "",
      platform: ""
    });
    setIsAddProductOpen(false);
  };

  // Handle batch categories import
  const handleBatchImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !batchText.trim()) return;

    const parsedItems = parseBatchText(batchText);
    if (parsedItems.length === 0) return;

    if (onAddProducts) {
      const itemsToImport = parsedItems.map(item => ({
        title: item.title,
        currency: item.currency,
        count: item.count,
        isAdded: false
      }));
      onAddProducts(selectedSupplier.id, itemsToImport);
    } else {
      parsedItems.forEach((item) => {
        onAddProduct(selectedSupplier.id, {
          title: item.title,
          currency: item.currency,
          count: item.count,
          isAdded: false
        });
      });
    }

    // Reset and close
    setBatchText("");
    setIsAddProductOpen(false);
  };

  // Toggle category addition mark
  const handleToggleCategory = (productId: string) => {
    if (!selectedSupplier || !onToggleProductAdded) return;
    onToggleProductAdded(selectedSupplier.id, productId);
  };

  // Filter products by selected state and search query
  const displayedProducts = useMemo(() => {
    if (!selectedSupplier || !selectedSupplier.products) return [];
    const query = catalogSearchQuery.trim().toLowerCase();
    return selectedSupplier.products.filter((p) => {
      if (catalogFilter === "Added" && !p.isAdded) return false;
      if (catalogFilter === "NotAdded" && p.isAdded) return false;
      
      if (!query) return true;
      
      // Match by category title or currency/region
      const matchesCategory = p.title.toLowerCase().includes(query) || 
                              (p.currency && p.currency.toLowerCase().includes(query));
      
      // Match by any item's title or code inside this category
      const matchesItems = (p.items || []).some(item => 
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.code && item.code.toLowerCase().includes(query))
      );
      
      return matchesCategory || matchesItems;
    });
  }, [selectedSupplier, catalogFilter, catalogSearchQuery]);

  // Reset pagination whenever the filters/search or the selected supplier
  // change, so switching context always starts back at the top of the list.
  useEffect(() => {
    setVisibleProductsCount(60);
  }, [selectedSupplierId, catalogFilter, catalogSearchQuery]);

  const paginatedProducts = useMemo(
    () => displayedProducts.slice(0, visibleProductsCount),
    [displayedProducts, visibleProductsCount]
  );

  // Unique list of currencies in selected supplier
  const supplierCurrenciesCount = useMemo(() => {
    if (!selectedSupplier || !selectedSupplier.products) return 0;
    const currencies = selectedSupplier.products.map(p => p.currency?.toUpperCase()).filter(Boolean);
    return new Set(currencies).size;
  }, [selectedSupplier]);

  // Find task related to this specific category of the supplier
  const getLinkedTask = (productTitle: string, supplierName: string) => {
    return (tasks || []).find(
      t => (t.title.includes(productTitle) && t.counterparty === supplierName) ||
           (t.description?.includes(productTitle) && t.counterparty === supplierName)
    );
  };

  const handleCreateTaskForCategory = (prod: ProductCard, supplierName: string) => {
    if (!onAddTask) return;
    
    onAddTask({
      title: `Додати товар: ${prod.title} (${prod.currency || "USD"})`,
      dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], // 2 days from now
      status: "Pending",
      priority: "Medium",
      counterparty: supplierName,
      description: `Автоматично згенероване завдання для запуску товару від постачальника.\n\n• Назва товару: ${prod.title}\n• Регіон: ${prod.currency || "USD"}\n• Постачальник: ${supplierName}`,
      subTasks: [
        { id: `sub-${Date.now()}-1`, title: "Перевірити працездатність та відповідність регіону", completed: false },
        { id: `sub-${Date.now()}-2`, title: "Передати в роботу або завантажити коди", completed: false },
        { id: `sub-${Date.now()}-3`, title: "Позначити як виконано", completed: false }
      ]
    });
  };

  const handleToggleTaskStatusLocal = (task: Task) => {
    if (!onUpdateTask) return;
    
    let nextStatus: Task["status"] = "Pending";
    if (task.status === "Pending") nextStatus = "In Progress";
    else if (task.status === "In Progress") nextStatus = "Completed";
    
    onUpdateTask({
      ...task,
      status: nextStatus
    });

    const isCompleted = nextStatus === "Completed";

    if (selectedSupplier) {
      const cleanTitle = task.title.replace("Додати товар: ", "").replace("Додати категорію: ", "").split(" (")[0].trim();
      
      // 1. Check if it matches a category/product
      const matchedProd = selectedSupplier.products?.find(p => p.title.trim() === cleanTitle);
      if (matchedProd) {
        if (matchedProd.isAdded !== isCompleted && onToggleProductAdded) {
          onToggleProductAdded(selectedSupplier.id, matchedProd.id);
        }
      }

      // 2. Check if it matches an item
      if (onUpdateProduct) {
        for (const prod of (selectedSupplier.products || [])) {
          let updated = false;
          const updatedItems = (prod.items || []).map(item => {
            const displayTitle = item.title || `${prod.title} (Код: ${item.code})`;
            if (displayTitle.trim() === cleanTitle || item.code === cleanTitle) {
              updated = true;
              return { ...item, isAdded: isCompleted };
            }
            return item;
          });

          if (updated) {
            const allItemsAdded = updatedItems.length > 0 && updatedItems.every(i => i.isAdded);
            onUpdateProduct(selectedSupplier.id, prod.id, {
              ...prod,
              isAdded: allItemsAdded,
              items: updatedItems
            });
          }
        }
      }
    }
  };

  const handleCreateTaskForItem = (item: CategoryItem, parentCategoryTitle: string, supplierName: string) => {
    if (!onAddTask) return;
    
    const displayTitle = item.title || `${parentCategoryTitle} (Код: ${item.code})`;
    const region = item.currency || currentCategory?.currency || "USD";
    
    onAddTask({
      title: `Додати товар: ${displayTitle} (${region})`,
      dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], // 2 days from now
      status: "Pending",
      priority: "Medium",
      counterparty: supplierName,
      description: `Автоматично згенероване завдання для запуску конкретного товару від постачальника.\n\n• Назва: ${displayTitle}\n• Код: ${item.code}\n• Регіон: ${region}\n• Постачальник: ${supplierName}`,
      subTasks: [
        { id: `sub-${Date.now()}-1`, title: "Перевірити працездатність та відповідність регіону", completed: false },
        { id: `sub-${Date.now()}-2`, title: "Передати в роботу або завантажити коди", completed: false },
        { id: `sub-${Date.now()}-3`, title: "Позначити як виконано", completed: false }
      ]
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#111112] p-4 sm:p-5 rounded-xl border border-white/5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Truck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-lg">Постачальники</h3>
        </div>
        <button
          onClick={() => setIsAddSupplierOpen(true)}
          className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto shadow-md shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          Новий постачальник
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-[#111112] p-4 rounded-xl border border-white/5 flex flex-col justify-between h-24">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Усього постачальників</p>
          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-2xl font-bold text-white font-mono">{stats.total}</h2>
            <span className="text-[10px] text-emerald-400 font-semibold">База SRM</span>
          </div>
        </div>

        {/* Active */}
        <div className="bg-[#111112] p-4 rounded-xl border border-white/5 flex flex-col justify-between h-24">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Активні партнери</p>
          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-2xl font-bold text-emerald-400 font-mono">{stats.active}</h2>
            <span className="text-[10px] text-emerald-500">Працюють</span>
          </div>
        </div>

        {/* Closed */}
        <div className="bg-[#111112] p-4 rounded-xl border border-white/5 flex flex-col justify-between h-24">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Закриті контракти</p>
          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-2xl font-bold text-gray-400 font-mono">{stats.closed}</h2>
            <span className="text-[10px] text-gray-500">Завершено</span>
          </div>
        </div>

        {/* Products */}
        <div className="bg-[#111112] p-4 rounded-xl border border-white/5 flex flex-col justify-between h-24">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Усього товарів</p>
          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-2xl font-bold text-emerald-400 font-mono">{stats.totalProds}</h2>
            <span className="text-[10px] text-emerald-400">По всіх джерелах</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Suppliers List & Selected Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column - List of Suppliers (4/12 cols) */}
        <div className="lg:col-span-4 bg-[#111112] border border-white/5 rounded-xl overflow-hidden flex flex-col space-y-4 p-4">
          {/* Header filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Пошук за назвою або товаром..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
              />
            </div>

            {/* Status tabs filter */}
            <div className="bg-[#161618] p-0.5 rounded-lg border border-white/5 flex text-xs font-semibold">
              <button
                onClick={() => setStatusFilter("All")}
                className={`flex-1 py-1.5 text-center text-[10px] rounded-md transition-all cursor-pointer ${
                  statusFilter === "All"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Всі ({stats.total})
              </button>
              <button
                onClick={() => setStatusFilter("Active")}
                className={`flex-1 py-1.5 text-center text-[10px] rounded-md transition-all cursor-pointer ${
                  statusFilter === "Active"
                    ? "bg-emerald-600/10 border border-emerald-500/20 text-emerald-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Активні ({stats.active})
              </button>
              <button
                onClick={() => setStatusFilter("Closed")}
                className={`flex-1 py-1.5 text-center text-[10px] rounded-md transition-all cursor-pointer ${
                  statusFilter === "Closed"
                    ? "bg-gray-800 text-gray-300"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Закриті ({stats.closed})
              </button>
            </div>
          </div>

          {/* List items container */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs">
                Постачальників не знайдено
              </div>
            ) : (
              filteredSuppliers.map((supplier) => {
                const isSelected = selectedSupplier && selectedSupplier.id === supplier.id;
                return (
                  <div
                    key={supplier.id}
                    onClick={() => setSelectedSupplierId(supplier.id)}
                    className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all flex justify-between items-center ${
                      isSelected
                        ? "bg-emerald-600/10 border-emerald-500/30 text-white"
                        : "bg-[#161618] border-white/5 text-gray-300 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="space-y-1 mr-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs truncate text-white">{supplier.name}</h4>
                        {supplier.isClosed && (
                          <span className="text-[8px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-sm font-bold border border-red-500/10 shrink-0">
                            ЗАКРИТИЙ
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                        <User className="w-3 h-3 text-emerald-400" />
                        {supplier.contactPerson || "Без менеджера"}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-gray-500 bg-white/[0.02] border border-white/5 px-1.5 py-0.5 rounded-sm">
                        <Layers className="w-2.5 h-2.5 text-emerald-400/75" />
                        Товарів: {supplier.products?.length || 0}
                      </span>
                    </div>

                    {/* Quick action: mark closed status */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSupplierStatus(supplier.id);
                      }}
                      className={`p-1.5 rounded-md transition-colors ${
                        supplier.isClosed
                          ? "text-red-400 hover:bg-red-500/10"
                          : "text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      title={supplier.isClosed ? "Активувати постачальника" : "Закрити роботу з постачальником"}
                    >
                      {supplier.isClosed ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column - Supplier Details & Interactive Category Board (8/12 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {selectedSupplier ? (
            <div className="space-y-5">
              {/* Supplier General Info Card */}
              <div className="bg-[#111112] border border-white/5 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-start gap-3 border-b border-white/5 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base">{selectedSupplier.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold border ${
                        selectedSupplier.isClosed
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}>
                        {selectedSupplier.isClosed ? "Взаємодії Закрито" : "Активний Постачальник"}
                      </span>
                    </div>
                    {selectedSupplier.notes && (
                      <p className="text-xs text-gray-400 mt-2 italic">
                        "{selectedSupplier.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {onToggleSupplierLetsKeysLink && (
                      <button
                        onClick={() => onToggleSupplierLetsKeysLink(selectedSupplier.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                          selectedSupplier.letsKeysLinked
                            ? "bg-blue-600/15 border-blue-500/20 text-blue-400 hover:bg-blue-600/25"
                            : "bg-white/[0.01] border-white/10 text-gray-500 hover:bg-white/5"
                        }`}
                        title="Прив'язати цього постачальника до LetsKeys для автоматичної синхронізації каталогу"
                      >
                        <Package className="w-3.5 h-3.5" />
                        {selectedSupplier.letsKeysLinked ? "LetsKeys прив'язано" : "Прив'язати LetsKeys"}
                      </button>
                    )}
                    {selectedSupplier.letsKeysLinked && onImportLetsKeysVariations && (
                      <button
                        onClick={() => setIsLetsKeysSyncOpen(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Синхронізувати
                      </button>
                    )}
                    <button
                      onClick={() => onToggleSupplierStatus(selectedSupplier.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                        selectedSupplier.isClosed
                          ? "bg-emerald-600/15 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/25"
                          : "bg-red-600/15 border border-red-500/20 text-red-400 hover:bg-red-600/25"
                      }`}
                    >
                      {selectedSupplier.isClosed ? "Відкрити контракт" : "Закрити контракт"}
                    </button>
                    {supplierDeleteConfirmId === selectedSupplier.id ? (
                      <div className="flex items-center gap-1.5 bg-red-600/10 border border-red-500/30 p-1.5 rounded-lg">
                        <span className="text-[10px] text-red-400 font-bold px-1 select-none">Видалити?</span>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSupplier(selectedSupplier.id);
                            setSupplierDeleteConfirmId(null);
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer"
                        >
                          Так
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupplierDeleteConfirmId(null)}
                          className="bg-white/10 hover:bg-white/20 text-gray-300 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer"
                        >
                          Ні
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSupplierDeleteConfirmId(selectedSupplier.id)}
                        className="p-2 border border-white/10 hover:border-red-500/20 text-gray-400 hover:text-red-400 bg-white/[0.02] rounded-lg transition-colors cursor-pointer"
                        title="Видалити постачальника"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>


              </div>

              {/* Active Linked Tasks of the Supplier */}
              {(() => {
                const supplierTasks = (tasks || []).filter(t => t.counterparty === selectedSupplier.name);
                if (supplierTasks.length === 0) return null;
                
                return (
                  <div className="bg-[#111112] border border-white/5 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-white text-xs flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-emerald-400" />
                        Пов'язані завдання постачальника ({supplierTasks.length})
                      </h4>
                      <span className="text-[9px] text-gray-500 font-medium">Клікніть на статус для перемикання</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {supplierTasks.map(task => (
                        <div key={task.id} className="flex justify-between items-center p-2.5 bg-[#161618] border border-white/5 rounded-lg text-xs hover:border-white/10 transition-colors">
                          <div className="space-y-1 min-w-0 pr-2">
                            <p className="font-semibold text-gray-200 truncate">{task.title}</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleTaskStatusLocal(task)}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition-all hover:scale-105 ${
                                  task.status === "Completed"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : task.status === "In Progress"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                }`}
                              >
                                {task.status === "Pending" ? "В очікуванні" : task.status === "In Progress" ? "В процесі" : "Завершено"}
                              </button>
                              <span className="text-[9px] text-gray-500 font-mono">До: {task.dueDate}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* HIGH FIDELITY CATEGORY BOARD (as in the screenshot image!) */}
              <div className="bg-[#111112] border border-emerald-500/20 rounded-xl p-5 space-y-4 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                      <span>📦 Товари постачальника {selectedSupplier.name}</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Знайдено <span className="text-emerald-400 font-bold font-mono">{(selectedSupplier.products || []).length}</span> товарів, <span className="text-emerald-400 font-bold font-mono">{supplierCurrenciesCount}</span> регіонів. Клікніть на товар, щоб переглянути номінали.
                    </p>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setIsAddProductOpen(!isAddProductOpen)}
                      className="text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer border border-emerald-500/30 transition-all w-full sm:w-auto justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Додати товар
                    </button>
                  </div>
                </div>

                {/* Inline Add Category Form */}
                {isAddProductOpen && (
                  <div className="p-4 bg-[#161618] border border-emerald-500/10 rounded-xl space-y-4 animate-fade-in relative z-10">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-400" />
                        Додати категорії товарів
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setIsAddProductOpen(false)}
                        className="p-1 hover:bg-white/5 rounded-md text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Form Tabs */}
                    <div className="flex border-b border-white/5 pb-1 gap-4">
                      <button
                        type="button"
                        onClick={() => setAddProductTab("single")}
                        className={`text-[11px] font-bold pb-1 cursor-pointer transition-all ${
                          addProductTab === "single"
                            ? "text-emerald-400 border-b border-emerald-500"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        По одній
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddProductTab("batch")}
                        className={`text-[11px] font-bold pb-1 cursor-pointer transition-all flex items-center gap-1`}
                      >
                        <span className={addProductTab === "batch" ? "text-emerald-400 border-b border-emerald-500" : "text-gray-400 hover:text-white"}>Групове додавання</span>
                        <span className="bg-emerald-500/20 text-emerald-300 text-[8px] px-1 py-0.5 rounded font-black">FAST</span>
                      </button>
                    </div>

                    {addProductTab === "single" ? (
                      <form onSubmit={handleCreateProduct} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs">
                          <div className="md:col-span-5">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Назва категорії *</label>
                            <input
                              type="text"
                              required
                              placeholder="напр. Nintendo Games EU, Steam ID, Razer Gold TR"
                              value={newProduct.title}
                              onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })}
                              className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#0E0E0F] text-white"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Валюта / Регіон</label>
                            <input
                              type="text"
                              required
                              placeholder="напр. EUR, USD, TRY"
                              value={newProduct.currency}
                              onChange={(e) => setNewProduct({ ...newProduct, currency: e.target.value })}
                              className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#0E0E0F] text-white font-bold uppercase"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Кількість товарів</label>
                            <input
                              type="number"
                              required
                              min="1"
                              placeholder="79"
                              value={newProduct.count}
                              onChange={(e) => setNewProduct({ ...newProduct, count: e.target.value })}
                              className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#0E0E0F] text-white font-mono"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Платформи (можна декілька)</label>
                            <MultiPlatformSelector
                              value={newProduct.platform}
                              onChange={(val) => setNewProduct({ ...newProduct, platform: val })}
                              size="sm"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => setIsAddProductOpen(false)}
                            className="px-3 py-1.5 border border-white/10 rounded-lg text-[11px] font-bold hover:bg-white/5 text-gray-400 cursor-pointer"
                          >
                            Скасувати
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Додати в список
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleBatchImport} className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase">Вставте список категорій (кожен рядок - нова категорія)</label>
                          <p className="text-[10px] text-gray-500 leading-relaxed">
                            Розумний імпортер автоматично розпізнає назву, валюту та кількість. Наприклад: <br />
                            <code className="text-gray-400 bg-white/[0.02] px-1 py-0.5 rounded font-mono">Nintendo Games EU [EUR] - 79</code><br />
                            <code className="text-gray-400 bg-white/[0.02] px-1 py-0.5 rounded font-mono">Steam Wallet TRY 150</code>
                          </p>
                          <textarea
                            rows={5}
                            required
                            placeholder="Вставте або напишіть список категорій сюди..."
                            value={batchText}
                            onChange={(e) => setBatchText(e.target.value)}
                            className="w-full p-3 border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#0E0E0F] text-white font-mono text-xs leading-relaxed"
                          />
                        </div>

                        {/* Smart Preview */}
                        {batchText.trim() && (() => {
                          const previewItems = parseBatchText(batchText);
                          if (previewItems.length === 0) return null;
                          return (
                            <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                              <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Попередній перегляд розпізнаних категорій ({previewItems.length})
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                {previewItems.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center p-1.5 bg-[#161618] border border-white/5 rounded">
                                    <span className="text-gray-300 font-medium truncate pr-2 max-w-[150px]">{item.title}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="bg-amber-500 text-black px-1 rounded-xs font-black text-[9px] uppercase">{item.currency}</span>
                                      <span className="bg-white/5 px-1.5 rounded text-gray-400 font-mono text-[10px]">{item.count} шт.</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              setBatchText("");
                              setIsAddProductOpen(false);
                            }}
                            className="px-3 py-1.5 border border-white/10 rounded-lg text-[11px] font-bold hover:bg-white/5 text-gray-400 cursor-pointer"
                          >
                            Скасувати
                          </button>
                          <button
                            type="submit"
                            disabled={!batchText.trim() || parseBatchText(batchText).length === 0}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Імпортувати всі категорії ({batchText.trim() ? parseBatchText(batchText).length : 0})
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Filter and Switch states */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#161618] p-2.5 rounded-lg border border-white/5">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <button
                      onClick={() => setCatalogFilter("All")}
                      className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        catalogFilter === "All"
                          ? "bg-white/10 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Всі
                    </button>
                    <button
                      onClick={() => setCatalogFilter("Added")}
                      className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        catalogFilter === "Added"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Виконані
                    </button>
                    <button
                      onClick={() => setCatalogFilter("NotAdded")}
                      className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        catalogFilter === "NotAdded"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      В процесі
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Пошук товару чи коду..."
                        value={catalogSearchQuery}
                        onChange={(e) => setCatalogSearchQuery(e.target.value)}
                        className="w-full sm:w-56 pl-8 pr-7 py-1 text-xs border border-white/10 rounded-md focus:outline-hidden focus:border-emerald-500 bg-black/40 text-white font-medium"
                      />
                      {catalogSearchQuery && (
                        <button
                          onClick={() => setCatalogSearchQuery("")}
                          className="absolute right-2 top-1.5 p-0.5 text-gray-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <span className="hidden xl:inline text-[10px] text-gray-500 font-mono italic">
                      * Клікніть на товар, щоб переглянути номінали
                    </span>
                  </div>
                </div>

                {/* THE PILLS CONTAINER - COMPACT FLEX WRAP GRID (Replica of the design!) */}
                {(!selectedSupplier.products || selectedSupplier.products.length === 0) ? (
                  <div className="text-center py-12 bg-[#161618] rounded-xl border border-dashed border-white/5 text-gray-500 text-xs">
                    Каталог порожній. Натисніть "Додати товар", щоб заповнити список.
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1.5">
                    <AnimatePresence>
                      {paginatedProducts.map((prod) => (
                        <motion.div
                          layout
                          key={prod.id}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => handleOpenItemsModal(prod)}
                          className="group flex items-center gap-3 bg-[#161618] hover:bg-[#1b1b1e] border border-white/5 hover:border-white/15 rounded-lg px-3.5 py-2.5 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-100 truncate">{prod.title}</span>
                            <span
                              className="px-1.5 py-0.5 rounded-xs font-black text-[9px] uppercase tracking-wider shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              title="Регіон"
                            >
                              {prod.currency || "GLOBAL"}
                            </span>
                            {prod.platform && prod.platform.split(',').map(p => p.trim()).filter(Boolean).map((plat) => (
                              <span
                                key={plat}
                                className="px-1.5 py-0.5 rounded-xs font-bold text-[9px] uppercase tracking-wider shrink-0 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono"
                                title="Платформа"
                              >
                                {plat}
                              </span>
                            ))}
                          </div>

                          {/* Price badge with inline editor + history tooltip */}
                          {onUpdateProduct && (
                            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                              {editingPriceProductId === prod.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const num = parseFloat(priceDraft);
                                    if (!isNaN(num) && num >= 0) {
                                      onUpdateProduct(selectedSupplier.id, prod.id, { ...prod, price: num });
                                    }
                                    setEditingPriceProductId(null);
                                  }}
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    autoFocus
                                    value={priceDraft}
                                    onChange={(e) => setPriceDraft(e.target.value)}
                                    onBlur={() => setEditingPriceProductId(null)}
                                    className="w-16 px-1.5 py-0.5 text-[10px] font-mono bg-black/40 border border-emerald-500/40 rounded text-white focus:outline-hidden"
                                  />
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPriceDraft(prod.price !== undefined ? String(prod.price) : "");
                                    setEditingPriceProductId(prod.id);
                                  }}
                                  className="px-2 py-1 rounded-lg font-mono font-bold text-[10px] shrink-0 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 cursor-pointer"
                                  title={
                                    prod.priceHistory && prod.priceHistory.length > 0
                                      ? `Історія цін:\n${prod.priceHistory.map(h => `${h.price} ${h.currency || prod.currency || ""} — ${formatDate(h.changedAt)}`).join("\n")}`
                                      : "Натисніть, щоб задати ціну"
                                  }
                                >
                                  {prod.price !== undefined ? `${prod.price} ${prod.currency || ""}` : "Ціна?"}
                                  {prod.priceHistory && prod.priceHistory.length > 0 && (
                                    <span className="ml-1 text-gray-500">({prod.priceHistory.length})</span>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Denominations count — click opens the same modal as the row */}
                          <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-emerald-400 text-[11px] font-bold font-mono">
                            <Database className="w-3 h-3" />
                            {(prod.items || []).length}
                          </span>

                          {/* Delete */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProduct(selectedSupplier.id, prod.id);
                            }}
                            className="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            title="Видалити товар"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {displayedProducts.length > visibleProductsCount && (
                  <div className="flex flex-col items-center gap-1.5 pt-3">
                    <button
                      onClick={() => setVisibleProductsCount(c => c + 60)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Показати ще ({displayedProducts.length - visibleProductsCount} лишилось)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111112] border border-white/5 rounded-xl py-24 text-center text-gray-500 text-xs space-y-2">
              <Truck className="w-8 h-8 text-emerald-400/30 mx-auto" />
              <p>Оберіть постачальника зі списку ліворуч для перегляду детальних контактів та інтерактивної карти категорій.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE SUPPLIER MODAL */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-white/5 shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="px-6 py-4 bg-[#161618] border-b border-white/5 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-400" />
                Створити Картку Постачальника
              </h4>
              <button onClick={() => setIsAddSupplierOpen(false)} className="text-gray-400 hover:text-white text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Назва компанії / постачальника *
                </label>
                <input
                  type="text"
                  required
                  placeholder="напр. Visoria, ТОВ 'ПластПром'"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Контактна особа
                  </label>
                  <input
                    type="text"
                    placeholder="напр. Дмитро Васильович"
                    value={newSupplier.contactPerson}
                    onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Телефон зв'язку
                  </label>
                  <input
                    type="text"
                    placeholder="+380 67 000 0000"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#0E0E0F] text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Електронна пошта
                </label>
                <input
                  type="email"
                  placeholder="contact@supplier.com"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Нотатки (сировина, умови розрахунку, доставка)
                </label>
                <textarea
                  rows={3}
                  placeholder="Опишіть логістику, реквізити, ліміти, терміни доставки..."
                  value={newSupplier.notes}
                  onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Зберегти постачальника
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY ITEMS MANAGER MODAL */}
      {selectedCategoryForItems && currentCategory && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-indigo-500/20 shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-[#161618] border-b border-white/5 text-white flex justify-between items-center shrink-0">
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Управління товарами: <span className="text-indigo-300">{currentCategory.title}</span>
                </h4>
                <p className="text-[10px] text-gray-400 flex flex-wrap gap-x-2 items-center">
                  <span>Регіон категорії: <span className="text-amber-400 font-bold font-mono">{currentCategory.currency}</span></span>
                  <span>•</span>
                  <span>Усього товарів в базі: <span className="text-indigo-400 font-bold font-mono">{(currentCategory.items || []).length}</span></span>
                </p>
              </div>
              <button 
                onClick={() => setSelectedCategoryForItems(null)} 
                className="text-gray-400 hover:text-white text-lg cursor-pointer p-1.5 hover:bg-white/5 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Main content body (scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">

              {/* Edit Category Parameters (Inline editable panel) */}
              <div className="bg-[#161618] border border-indigo-500/10 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 uppercase tracking-wider pb-1 border-b border-white/5">
                  <Settings className="w-3.5 h-3.5 text-indigo-400 animate-spin-slow" />
                  Параметри категорії (Товару)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Назва категорії *</label>
                    <input
                      type="text"
                      required
                      value={currentCategory.title}
                      onChange={(e) => handleUpdateCategoryDetails({ title: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-indigo-500 bg-[#0E0E0F] text-white font-semibold"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Регіон / Валюта</label>
                    <input
                      type="text"
                      value={currentCategory.currency}
                      onChange={(e) => handleUpdateCategoryDetails({ currency: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-indigo-500 bg-[#0E0E0F] text-white uppercase font-bold font-mono text-center"
                    />
                  </div>

                  <div className="md:col-span-5">
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Платформи (можна декілька)</label>
                    <MultiPlatformSelector
                      value={currentCategory.platform}
                      onChange={(val) => handleUpdateCategoryDetails({ platform: val })}
                      size="sm"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
              
              {/* Form to add goods */}
              <div className="bg-[#161618] border border-white/5 rounded-xl p-4 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    Додати товари / коди
                  </span>
                  
                  {/* Tabs: Single vs Batch */}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setBatchItemsTab("single")}
                      className={`text-[10px] font-bold pb-0.5 cursor-pointer transition-all ${
                        batchItemsTab === "single"
                          ? "text-indigo-400 border-b border-indigo-500"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Один
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchItemsTab("batch")}
                      className={`text-[10px] font-bold pb-0.5 cursor-pointer transition-all flex items-center gap-1`}
                    >
                      <span className={batchItemsTab === "batch" ? "text-indigo-400 border-b border-indigo-500" : "text-gray-400 hover:text-white"}>Список (FAST)</span>
                      <span className="bg-indigo-500/20 text-indigo-300 text-[8px] px-1 py-0.5 rounded font-black">FAST</span>
                    </button>
                  </div>
                </div>

                {batchItemsTab === "single" ? (
                  <form onSubmit={handleAddItemToCategory} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-3">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Код / Серійний номер *</label>
                      <input
                        type="text"
                        required
                        placeholder="ABCD-1234-EFGH-5678"
                        value={newItemCode}
                        onChange={(e) => setNewItemCode(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-indigo-500 bg-[#0E0E0F] text-white font-mono"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Назва (якщо відрізняється)</label>
                      <input
                        type="text"
                        placeholder={currentCategory.title}
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-indigo-500 bg-[#0E0E0F] text-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Регіон</label>
                      <input
                        type="text"
                        placeholder={currentCategory.currency || "USD"}
                        value={newItemRegion}
                        onChange={(e) => setNewItemRegion(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-indigo-500 bg-[#0E0E0F] text-white uppercase font-bold font-mono"
                      />
                    </div>
                    <div className="md:col-span-4 flex">
                      <button
                        type="submit"
                        className="w-full h-[34px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center justify-center transition-colors"
                        title="Додати товар"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleBatchAddItemsToCategory} className="space-y-3">
                    <textarea
                      rows={4}
                      required
                      placeholder="Вставте коди або серійні номери (кожен з нового рядка)...&#10;Приклад: Minecraft Java - GLOBAL - 019dc95f-8020-775b-93a9-5c5eede8741f&#10;Приклад: TRY - 019dc95f-a828-77ad-9f56-7ddf362eccc3&#10;Приклад: 019dc95f-a0c4-71d8-99e6-e20e8c0b31f4"
                      value={batchItemsText}
                      onChange={(e) => setBatchItemsText(e.target.value)}
                      className="w-full p-3 border border-white/10 rounded-lg focus:outline-hidden focus:border-[#4f46e5] bg-[#0E0E0F] text-white font-mono text-xs leading-relaxed"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 italic">
                        * Автоматично імпортує назву, регіон та код з кожного рядка!
                      </span>
                      <button
                        type="submit"
                        disabled={!batchItemsText.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Імпортувати ({batchItemsText.trim() ? parseCategoryItemsText(batchItemsText, currentCategory.title).length : 0} шт.)
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Список завантажених товарів
                  </span>
                  
                  {/* Modal local search box */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Шукати за назвою або кодом..."
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      className="w-full sm:w-60 pl-8 pr-7 py-1 text-xs border border-white/10 rounded-md focus:outline-hidden focus:border-indigo-500 bg-black/40 text-white font-medium"
                    />
                    {modalSearchQuery && (
                      <button
                        onClick={() => setModalSearchQuery("")}
                        className="absolute right-2 top-1.5 p-0.5 text-gray-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {(() => {
                  const items = currentCategory.items || [];
                  const query = modalSearchQuery.trim().toLowerCase();
                  const filtered = query
                    ? items.filter(item => 
                        (item.title && item.title.toLowerCase().includes(query)) ||
                        (item.code && item.code.toLowerCase().includes(query))
                      )
                    : items;

                  if (items.length === 0) {
                    return (
                      <div className="text-center py-10 bg-[#161618]/50 rounded-xl border border-dashed border-white/5 text-gray-500">
                        У цій категорії поки що немає доданих товарів. Додайте перший код вище!
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-10 bg-[#161618]/50 rounded-xl border border-dashed border-white/5 text-gray-500">
                        Товарів за запитом "{modalSearchQuery}" не знайдено.
                      </div>
                    );
                  }

                  return (
                    <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-[#161618] text-[9px] font-bold text-gray-400 uppercase items-center">
                        <div className="col-span-8">Товар / Регіон / Код</div>
                        <div className="col-span-2 text-center">Виконано</div>
                        <div className="col-span-2 text-right">Завдання / Дії</div>
                      </div>

                      <div className="divide-y divide-white/[0.03] max-h-96 overflow-y-auto">
                        {filtered.map((item, idx) => {
                          const displayTitle = item.title || currentCategory.title;
                          const displayCurrency = item.currency || currentCategory.currency || "USD";
                          const isItemAdded = item.isAdded;
                          
                          return (
                            <div key={item.id} className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-white/[0.01] transition-colors ${
                              isItemAdded ? "bg-emerald-500/[0.02]" : ""
                            }`}>
                              {/* Product Name & Region & Code */}
                              <div className="col-span-8 flex items-start gap-3 min-w-0">
                                <span className="text-gray-500 font-mono text-[10px] pt-1 shrink-0">{idx + 1}.</span>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-white font-medium truncate max-w-[240px] sm:max-w-xs" title={displayTitle}>
                                      {displayTitle}
                                    </span>
                                    <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm shrink-0">
                                      {displayCurrency}
                                    </span>
                                    <MultiPlatformSelector
                                      value={item.platform || currentCategory.platform}
                                      onChange={(val) => handleUpdateItemPlatform(item.id, val)}
                                      size="xs"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-gray-400 font-bold select-all bg-black/40 px-2 py-0.5 rounded-md border border-white/5 break-all">
                                      {item.code}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyCode(item.code, item.id)}
                                      className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold transition-all cursor-pointer shrink-0 ${
                                        copiedItemId === item.id 
                                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                                          : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                      }`}
                                    >
                                      {copiedItemId === item.id ? "Скопійовано!" : "Копіювати"}
                                    </button>
                                  </div>
                                </div>
                              </div>

                            {/* Status "Done" (Виконано чи ні) */}
                            <div className="col-span-2 text-center">
                              <button
                                onClick={() => handleToggleItemAdded(item.id)}
                                className="p-1 hover:bg-white/5 rounded-full transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="Позначити як виконано / не виконано"
                              >
                                {isItemAdded ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Circle className="w-4 h-4 text-gray-500 hover:text-gray-400" />
                                )}
                              </button>
                            </div>

                            {/* Actions (Create Task / Task companion & Delete) */}
                            <div className="col-span-2 text-right flex justify-end items-center gap-1.5">
                              {/* Task Button integration for this individual item */}
                              {(() => {
                                const itemTaskTitle = item.title || `${currentCategory.title} (Код: ${item.code})`;
                                const task = (tasks || []).find(
                                  t => (t.title.includes(itemTaskTitle) && t.counterparty === selectedSupplier.name) ||
                                       (t.description?.includes(item.code) && t.counterparty === selectedSupplier.name)
                                );
                                if (task) {
                                  const isCompleted = task.status === "Completed";
                                  const isInProgress = task.status === "In Progress";
                                  
                                  let badgeBg = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                                  let statusLabel = "Завдання створено (В очікуванні)";
                                  if (isInProgress) {
                                    badgeBg = "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse";
                                    statusLabel = "Завдання виконується (В процесі)";
                                  } else if (isCompleted) {
                                    badgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                                    statusLabel = "Завдання завершено!";
                                  }

                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleTaskStatusLocal(task);
                                      }}
                                      className={`p-1 rounded-md border cursor-pointer transition-all hover:scale-105 flex items-center justify-center gap-1 px-2 shrink-0 ${badgeBg}`}
                                      title={`${statusLabel}. Натисніть для зміни статусу.`}
                                    >
                                      <ClipboardList className="w-3.5 h-3.5" />
                                      <span className="text-[8.5px] font-bold font-mono">
                                        {task.status === "Pending" ? "В очік." : task.status === "In Progress" ? "В роб." : "Готово"}
                                      </span>
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCreateTaskForItem(item, currentCategory.title, selectedSupplier.name);
                                      }}
                                      className="p-1 rounded-md border border-white/5 hover:border-indigo-500/30 text-gray-500 hover:text-indigo-300 hover:bg-indigo-500/5 cursor-pointer transition-all flex items-center justify-center shrink-0 w-[55px] h-[24px]"
                                      title="Створити завдання для цього коду"
                                    >
                                      <Plus className="w-2 h-2 text-indigo-400 inline mr-0.5 shrink-0" />
                                      <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                                    </button>
                                  );
                                }
                              })()}

                              {/* Delete button */}
                              <button
                                onClick={() => handleDeleteItemFromCategory(item.id)}
                                className="p-1.5 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-md transition-colors cursor-pointer shrink-0"
                                title="Видалити товар"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#161618] border-t border-white/5 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedCategoryForItems(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Закрити вікно
              </button>
            </div>
          </div>
        </div>
      )}

      {isLetsKeysSyncOpen && selectedSupplier && onImportLetsKeysVariations && (
        <LetsKeysSyncModal
          supplierId={selectedSupplier.id}
          onClose={() => setIsLetsKeysSyncOpen(false)}
          onImport={onImportLetsKeysVariations}
        />
      )}

    </div>
  );
}
