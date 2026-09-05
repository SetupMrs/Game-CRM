import React, { useState } from "react";
import { Lock, User, Cpu, AlertCircle } from "lucide-react";
import { login } from "../apiClient";

interface LoginGateProps {
  onSuccess: () => void;
}

export default function LoginGate({ onSuccess }: LoginGateProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const result = await login(username.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.message || "Невірний логін або пароль.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-300 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[#111112] border border-white/5 rounded-2xl p-6 space-y-5 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="p-3 bg-emerald-600 rounded-xl text-white">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Game CRM</h1>
            <p className="text-xs text-gray-500 mt-1">Введіть логін і пароль для доступу.</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Логін
          </label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-white/10 rounded-lg px-3.5 py-2.5 text-sm bg-[#161618] text-white focus:outline-hidden focus:border-emerald-500"
            placeholder="напр. olena"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Пароль
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-white/10 rounded-lg px-3.5 py-2.5 text-sm bg-[#161618] text-white focus:outline-hidden focus:border-emerald-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!username || !password || isSubmitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors cursor-pointer"
        >
          {isSubmitting ? "Перевірка..." : "Увійти"}
        </button>

        <p className="text-[10px] text-gray-600 text-center">
          Немає акаунту? Зверніться до адміністратора команди — доступ надається лише через створений акаунт.
        </p>
      </form>
    </div>
  );
}
