import React, { useState } from "react";
import { X, Trash2, RotateCcw, CheckSquare, Wallet, Truck, Package, AlertCircle } from "lucide-react";
import { Task, Transaction, Supplier, ProductCard } from "../types";
import { formatDate } from "../utils";

interface TrashedProductEntry {
  supplierId: string;
  supplierName: string;
  product: ProductCard;
}

interface TrashBinProps {
  tasks: Task[];
  transactions: Transaction[];
  suppliers: Supplier[];
  products: TrashedProductEntry[];
  retentionDays: number;
  baseCurrency?: string;
  onClose: () => void;
  onRestoreTask: (id: string) => void;
  onPermanentlyDeleteTask: (id: string) => void;
  onRestoreTransaction: (id: string) => void;
  onPermanentlyDeleteTransaction: (id: string) => void;
  onRestoreSupplier: (id: string) => void;
  onPermanentlyDeleteSupplier: (id: string) => void;
  onRestoreProduct: (supplierId: string, productId: string) => void;
  onPermanentlyDeleteProduct: (supplierId: string, productId: string) => void;
}

type TrashTab = "all" | "tasks" | "transactions" | "suppliers" | "products";

function daysRemaining(deletedAt: string | undefined, retentionDays: number): number {
  if (!deletedAt) return retentionDays;
  const ageDays = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(retentionDays - ageDays));
}

function RemainingBadge({ deletedAt, retentionDays }: { deletedAt?: string; retentionDays: number }) {
  const left = daysRemaining(deletedAt, retentionDays);
  const urgent = left <= 3;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
      urgent ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-gray-500 bg-white/5 border-white/10"
    }`}>
      {left > 0 ? `${left} дн. до видалення` : "видаляється сьогодні"}
    </span>
  );
}

export default function TrashBin({
  tasks,
  transactions,
  suppliers,
  products,
  retentionDays,
  baseCurrency = "USD",
  onClose,
  onRestoreTask,
  onPermanentlyDeleteTask,
  onRestoreTransaction,
  onPermanentlyDeleteTransaction,
  onRestoreSupplier,
  onPermanentlyDeleteSupplier,
  onRestoreProduct,
  onPermanentlyDeleteProduct
}: TrashBinProps) {
  const [tab, setTab] = useState<TrashTab>("all");

  const totalCount = tasks.length + transactions.length + suppliers.length + products.length;

  const confirmForever = (label: string, action: () => void) => {
    if (window.confirm(`Видалити «${label}» назавжди? Це незворотно.`)) {
      action();
    }
  };

  const showTasks = tab === "all" || tab === "tasks";
  const showTx = tab === "all" || tab === "transactions";
  const showSuppliers = tab === "all" || tab === "suppliers";
  const showProducts = tab === "all" || tab === "products";

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
        <div className="px-6 py-4 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-amber-400" />
            Кошик
            <span className="text-[11px] font-normal text-gray-500">({totalCount})</span>
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex items-center gap-1.5 flex-wrap shrink-0 border-b border-white/5 pb-3">
          {[
            { key: "all", label: "Все" },
            { key: "tasks", label: `Завдання (${tasks.length})` },
            { key: "transactions", label: `Фінанси (${transactions.length})` },
            { key: "suppliers", label: `Постачальники (${suppliers.length})` },
            { key: "products", label: `Товари (${products.length})` }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as TrashTab)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                tab === t.key ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {totalCount === 0 && (
            <div className="py-14 flex flex-col items-center justify-center text-center text-gray-500 text-xs space-y-2">
              <Trash2 className="w-6 h-6 text-gray-600" />
              <p>Кошик порожній.</p>
            </div>
          )}

          {showTasks && tasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2.5">
              <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{task.title}</p>
                <p className="text-[10px] text-gray-500">Термін: {formatDate(task.dueDate)}</p>
              </div>
              <RemainingBadge deletedAt={task.deletedAt} retentionDays={retentionDays} />
              <button
                onClick={() => onRestoreTask(task.id)}
                className="p-1.5 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                title="Відновити"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => confirmForever(task.title, () => onPermanentlyDeleteTask(task.id))}
                className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                title="Видалити назавжди"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {showTx && transactions.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {tx.category} · {tx.amount.toLocaleString()} {tx.currency || baseCurrency}
                </p>
                <p className="text-[10px] text-gray-500 truncate">{tx.description}</p>
              </div>
              <RemainingBadge deletedAt={tx.deletedAt} retentionDays={retentionDays} />
              <button
                onClick={() => onRestoreTransaction(tx.id)}
                className="p-1.5 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                title="Відновити"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => confirmForever(`${tx.category} · ${tx.amount}`, () => onPermanentlyDeleteTransaction(tx.id))}
                className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                title="Видалити назавжди"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {showSuppliers && suppliers.map(sup => (
            <div key={sup.id} className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2.5">
              <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{sup.name}</p>
                <p className="text-[10px] text-gray-500">{(sup.products || []).length} товарів</p>
              </div>
              <RemainingBadge deletedAt={sup.deletedAt} retentionDays={retentionDays} />
              <button
                onClick={() => onRestoreSupplier(sup.id)}
                className="p-1.5 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                title="Відновити"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => confirmForever(sup.name, () => onPermanentlyDeleteSupplier(sup.id))}
                className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                title="Видалити назавжди"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {showProducts && products.map(({ supplierId, supplierName, product }) => (
            <div key={product.id} className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2.5">
              <Package className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{product.title}</p>
                <p className="text-[10px] text-gray-500 truncate">{supplierName}</p>
              </div>
              <RemainingBadge deletedAt={product.deletedAt} retentionDays={retentionDays} />
              <button
                onClick={() => onRestoreProduct(supplierId, product.id)}
                className="p-1.5 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                title="Відновити"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => confirmForever(product.title, () => onPermanentlyDeleteProduct(supplierId, product.id))}
                className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                title="Видалити назавжди"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-gray-500 shrink-0">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>Елементи автоматично видаляються назавжди через {retentionDays} днів після переміщення в кошик.</span>
        </div>
      </div>
    </div>
  );
}
