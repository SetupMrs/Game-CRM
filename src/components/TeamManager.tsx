import React, { useState } from "react";
import { Users, Plus, Trash2, Edit2, Check, UserCheck } from "lucide-react";
import { TeamMember, TEAM_MEMBER_COLORS } from "../types";

interface TeamManagerProps {
  teamMembers: TeamMember[];
  currentUserId: string | null;
  onAddMember: (data: Omit<TeamMember, "id">) => void;
  onUpdateMember: (member: TeamMember) => void;
  onDeleteMember: (id: string) => void;
  onSetCurrentUser: (id: string | null) => void;
}

export default function TeamManager({
  teamMembers,
  currentUserId,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onSetCurrentUser
}: TeamManagerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(TEAM_MEMBER_COLORS[0]);

  const resetForm = () => {
    setName("");
    setRole("");
    setColor(TEAM_MEMBER_COLORS[teamMembers.length % TEAM_MEMBER_COLORS.length]);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenAdd = () => {
    setColor(TEAM_MEMBER_COLORS[teamMembers.length % TEAM_MEMBER_COLORS.length]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setName(member.name);
    setRole(member.role);
    setColor(member.color);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      onUpdateMember({ id: editingId, name: name.trim(), role: role.trim(), color });
    } else {
      onAddMember({ name: name.trim(), role: role.trim(), color });
    }
    resetForm();
  };

  const initials = (fullName: string) =>
    fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() || "")
      .join("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            Команда
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Учасники команди можуть бути призначені відповідальними за завдання.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Додати учасника
        </button>
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#111112] border border-white/5 rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Ім'я *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Напр. Олена Ковальчук"
                className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Роль / посада
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Напр. Менеджер із закупівель"
                className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Колір мітки
            </label>
            <div className="flex flex-wrap gap-2">
              {TEAM_MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer"
                  style={{ backgroundColor: c, transform: color === c ? "scale(1.15)" : "scale(1)" }}
                  title={c}
                >
                  {color === c && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              {editingId ? "Зберегти" : "Додати"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold rounded-lg cursor-pointer"
            >
              Скасувати
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {teamMembers.length > 0 ? (
          teamMembers.map((member) => {
            const isMe = member.id === currentUserId;
            return (
              <div
                key={member.id}
                className={`bg-[#161618] rounded-xl border p-3.5 space-y-3 transition-all ${
                  isMe ? "border-emerald-500/40" : "border-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: member.color }}
                  >
                    {initials(member.name) || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{member.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{member.role || "Без ролі"}</p>
                  </div>
                  {isMe && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md shrink-0">
                      Це я
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                  <button
                    onClick={() => onSetCurrentUser(isMe ? null : member.id)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      isMe
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                    }`}
                    title="Позначити як поточного користувача"
                  >
                    <UserCheck className="w-3 h-3" />
                    {isMe ? "Обрано" : "Це я"}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(member)}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Редагувати"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteMember(member.id)}
                    className="p-1.5 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="Видалити"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-xl text-gray-500 text-xs space-y-2">
            <Users className="w-6 h-6 text-gray-600" />
            <p>Команду ще не додано. Додайте перших учасників.</p>
          </div>
        )}
      </div>
    </div>
  );
}
