import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, ClipboardList, X } from "lucide-react";
import { ProblemOrder, OrderStatus, ORDER_STATUSES } from "../types";
import { formatDate } from "../utils";

interface OrdersManagerProps {
  orders: ProblemOrder[];
  onAddOrder: (data: Omit<ProblemOrder, "id" | "createdAt" | "createdBy">) => void;
  onUpdateOrder: (id: string, data: Partial<ProblemOrder>) => void;
  onDeleteOrder: (id: string) => void;
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  "Прийнято": "bg-sky-500/10 text-sky-300 border-sky-500/30",
  "В обробці": "bg-amber-500/10 text-amber-300 border-amber-500/30",
  "Завершено": "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
};

const emptyForm = () => ({
  api: "",
  nominal: "",
  orderNumber: "",
  orderId: "",
  key: "",
  customerNick: "",
  problem: "",
  status: "Прийнято" as OrderStatus
});

export default function OrdersManager({
  orders,
  onAddOrder,
  onUpdateOrder,
  onDeleteOrder
}: OrdersManagerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Усі" | OrderStatus>("Усі");

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setIsFormOpen(true);
  };

  const openEdit = (o: ProblemOrder) => {
    setEditingId(o.id);
    setForm({
      api: o.api,
      nominal: o.nominal,
      orderNumber: o.orderNumber,
      orderId: o.orderId,
      key: o.key,
      customerNick: o.customerNick,
      problem: o.problem,
      status: o.status
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      api: form.api.trim(),
      nominal: form.nominal.trim(),
      orderNumber: form.orderNumber.trim(),
      orderId: form.orderId.trim(),
      key: form.key.trim(),
      customerNick: form.customerNick.trim(),
      problem: form.problem.trim(),
      status: form.status
    };
    if (editingId) {
      onUpdateOrder(editingId, payload);
    } else {
      onAddOrder(payload);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { "Усі": orders.length, "Прийнято": 0, "В обробці": 0, "Завершено": 0 };
    orders.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter(o => statusFilter === "Усі" ? true : o.status === statusFilter)
      .filter(o => {
        if (!q) return true;
        return [o.api, o.nominal, o.orderNumber, o.orderId, o.key, o.customerNick, o.problem]
          .some(v => (v || "").toLowerCase().includes(q));
      })
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, statusFilter, search]);

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="bg-[#111112] p-5 rounded-xl border border-white/5 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ClipboardList className="w-5 h-5" />
          </span>
          Замовлення
        </h3>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Нове замовлення
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-[#111112] p-1 rounded-lg border border-white/5">
          {(["Усі", ...ORDER_STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === s ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {s} <span className="opacity-60">({counts[s] || 0})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Пошук за API, номером, ID, ключем, ніком чи проблемою..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#111112] text-white"
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="bg-[#111112] rounded-xl border border-white/5 shadow-xs px-4 py-12 text-center text-sm text-gray-500">
          Замовлень за обраними фільтрами не знайдено.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(o => (
            <div key={o.id} className="bg-[#111112] rounded-xl border border-white/5 shadow-xs p-4 flex flex-col gap-3 hover:border-white/15 transition-all">
              {/* Top: status + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${STATUS_STYLES[o.status]}`}>
                    {o.status}
                  </span>
                  {o.api && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/10 text-gray-300 bg-white/[0.02]">
                      {o.api}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(o)}
                    className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-white/5 rounded-md cursor-pointer"
                    title="Редагувати"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteOrder(o.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-md cursor-pointer"
                    title="Видалити"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Nominal (title) */}
              <div>
                <p className="text-sm font-bold text-white leading-snug">{o.nominal || "Без назви номіналу"}</p>
                {o.customerNick && (
                  <p className="text-xs text-gray-400 mt-0.5">Замовник: <span className="text-gray-200 font-semibold">{o.customerNick}</span></p>
                )}
              </div>

              {/* Key-value fields */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">№ замовлення</p>
                  <p className="font-mono text-gray-200 truncate" title={o.orderNumber}>{o.orderNumber || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">ID</p>
                  <p className="font-mono text-gray-200 truncate" title={o.orderId}>{o.orderId || "—"}</p>
                </div>
                <div className="col-span-2 min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ключ</p>
                  <p className="font-mono text-gray-400 truncate" title={o.key}>{o.key || "—"}</p>
                </div>
              </div>

              {/* Problem */}
              {o.problem && (
                <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Проблема</p>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap break-words">{o.problem}</p>
                </div>
              )}

              {/* Footer: quick status change + date */}
              <div className="flex items-center justify-between gap-2 pt-1 mt-auto border-t border-white/5">
                <select
                  value={o.status}
                  onChange={(e) => onUpdateOrder(o.id, { status: e.target.value as OrderStatus })}
                  className={`text-[11px] font-bold px-2 py-1 rounded-md border bg-transparent cursor-pointer focus:outline-hidden ${STATUS_STYLES[o.status]}`}
                  title="Змінити статус"
                >
                  {ORDER_STATUSES.map(s => (
                    <option key={s} value={s} className="bg-[#161618] text-white">{s}</option>
                  ))}
                </select>
                <span className="text-[11px] text-gray-500">{formatDate(o.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-white/5 shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-[#161618] border-b border-white/5 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-emerald-300" />
                {editingId ? "Редагувати замовлення" : "Нове замовлення"}
              </h4>
              <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Назва номіналу</label>
                <input
                  type="text" placeholder="напр. 60 + 6 Bonds"
                  value={form.nominal}
                  onChange={(e) => setForm({ ...form, nominal: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">API</label>
                  <input
                    type="text" placeholder="напр. API3"
                    value={form.api}
                    onChange={(e) => setForm({ ...form, api: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Нік замовника</label>
                  <input
                    type="text" placeholder="напр. dmitrymak09"
                    value={form.customerNick}
                    onChange={(e) => setForm({ ...form, customerNick: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Номер замовлення</label>
                  <input
                    type="text" placeholder="напр. 161521"
                    value={form.orderNumber}
                    onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">ID</label>
                  <input
                    type="text" placeholder="ID замовлення"
                    value={form.orderId}
                    onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Ключ</label>
                <input
                  type="text" placeholder="ключ / код"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Проблема</label>
                <textarea
                  rows={3} placeholder="Опишіть, у чому проблема із замовленням"
                  value={form.problem}
                  onChange={(e) => setForm({ ...form, problem: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Статус</label>
                <div className="flex gap-2">
                  {ORDER_STATUSES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, status: s })}
                      className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        form.status === s ? STATUS_STYLES[s] : "bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/5"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer">Скасувати</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer">
                  {editingId ? "Зберегти" : "Додати"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
