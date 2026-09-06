import React, { useEffect, useState } from "react";
import { Users, Plus, Trash2, Shield, ShieldCheck, RefreshCw, Copy, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { AppUser, UserRole, listUsers, createUser, deleteUser, resetUserPassword, generateRandomPassword } from "../apiClient";

interface UsersManagerProps {
  currentUserId: string;
  onClose: () => void;
}

export default function UsersManager({ currentUserId, onClose }: UsersManagerProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("support");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPasswordValue] = useState("");
  const [resetShow, setResetShow] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    const result = await listUsers();
    if (result.success && result.users) {
      setUsers(result.users);
    } else {
      setError(result.message || "Не вдалося завантажити список користувачів.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleGeneratePassword = () => {
    setNewPassword(generateRandomPassword());
    setShowPassword(true);
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (newUsername.trim().length < 3) {
      setFormError("Логін має бути щонайменше 3 символи.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Пароль має містити щонайменше 8 символів.");
      return;
    }
    setIsSubmitting(true);
    const result = await createUser(newUsername.trim(), newPassword, newRole);
    setIsSubmitting(false);
    if (result.success) {
      setNewUsername("");
      setNewPassword("");
      setNewRole("support");
      setShowPassword(false);
      setIsFormOpen(false);
      loadUsers();
    } else {
      setFormError(result.message || "Не вдалося створити користувача.");
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (!window.confirm(`Видалити користувача «${user.username}»? Він більше не зможе увійти.`)) return;
    const result = await deleteUser(user.id);
    if (result.success) {
      loadUsers();
    } else {
      setError(result.message || "Не вдалося видалити користувача.");
    }
  };

  const handleStartReset = (user: AppUser) => {
    setResettingId(user.id);
    setResetPasswordValue(generateRandomPassword());
    setResetShow(true);
  };

  const handleConfirmReset = async () => {
    if (!resettingId || resetPassword.length < 8) return;
    const result = await resetUserPassword(resettingId, resetPassword);
    if (result.success) {
      setResettingId(null);
      setResetPasswordValue("");
    } else {
      setError(result.message || "Не вдалося скинути пароль.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
        <div className="px-6 py-4 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            Користувачі
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Додати користувача
          </button>

          {isFormOpen && (
            <form onSubmit={handleCreate} className="bg-[#161618] border border-white/10 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Логін</label>
                <input
                  type="text"
                  autoFocus
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="напр. olena"
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Пароль</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Щонайменше 8 символів"
                      className="w-full px-3 py-2 pr-9 text-sm border border-white/10 rounded-lg bg-white/[0.02] text-white font-mono focus:outline-hidden focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-gray-500 hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    title="Згенерувати випадковий пароль"
                    className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {newPassword && (
                    <button
                      type="button"
                      onClick={() => handleCopy(newPassword)}
                      title="Скопіювати пароль"
                      className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Передайте цей пароль користувачу окремим каналом — після закриття форми він більше ніде не показується.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Роль</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole("admin")}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      newRole === "admin"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/5"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Адмін
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole("support")}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      newRole === "support"
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                        : "bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/5"
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Саппорт
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Обидві ролі мають повний доступ до CRM, включно з керуванням користувачами — «Саппорт» лише позначає роль в команді, різниці в правах немає.
                </p>
              </div>

              {formError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  {formError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg cursor-pointer"
                >
                  {isSubmitting ? "Створення..." : "Створити"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Скасувати
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {isLoading ? (
              <p className="text-xs text-gray-500 text-center py-6">Завантаження...</p>
            ) : users.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Користувачів ще немає.</p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="bg-[#161618] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      user.role === "admin" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                    }`}>
                      {user.role === "admin" ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {user.username}
                        {user.id === currentUserId && <span className="text-gray-500 font-normal"> (це ви)</span>}
                      </p>
                      <p className="text-[10px] text-gray-500">{user.role === "admin" ? "Адміністратор" : "Саппорт"}</p>
                    </div>
                    <button
                      onClick={() => handleStartReset(user)}
                      className="p-1.5 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                      title="Скинути пароль"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                      title="Видалити"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {resettingId === user.id && (
                    <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2">
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Новий пароль</label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={resetShow ? "text" : "password"}
                            value={resetPassword}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            className="w-full px-2.5 py-1.5 pr-8 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white font-mono focus:outline-hidden focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => setResetShow(!resetShow)}
                            className="absolute right-2 top-1.5 text-gray-500 hover:text-white cursor-pointer"
                          >
                            {resetShow ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setResetPasswordValue(generateRandomPassword())}
                          className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg cursor-pointer shrink-0"
                          title="Згенерувати"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(resetPassword)}
                          className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg cursor-pointer shrink-0"
                          title="Скопіювати"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleConfirmReset}
                          disabled={resetPassword.length < 8}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold py-1.5 rounded-lg cursor-pointer"
                        >
                          Зберегти новий пароль
                        </button>
                        <button
                          onClick={() => setResettingId(null)}
                          className="px-3 bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-semibold rounded-lg cursor-pointer"
                        >
                          Скасувати
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
