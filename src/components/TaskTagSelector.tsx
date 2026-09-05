import React, { useState } from "react";
import { Tag, Plus, X, Users, Code, Shield, Palette, Headset, Crown, DollarSign, FileText } from "lucide-react";

export const PRESET_ROLE_TAGS = [
  { name: "Модератор", icon: Shield, color: "border-indigo-500/30 bg-indigo-500/15 text-indigo-300" },
  { name: "Розробник", icon: Code, color: "border-cyan-500/30 bg-cyan-500/15 text-cyan-300" },
  { name: "Дизайнер", icon: Palette, color: "border-pink-500/30 bg-pink-500/15 text-pink-300" },
  { name: "Підтримка", icon: Headset, color: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  { name: "Адміністратор", icon: Crown, color: "border-violet-500/30 bg-violet-500/15 text-violet-300" },
  { name: "Маркетинг", icon: Users, color: "border-orange-500/30 bg-orange-500/15 text-orange-300" },
  { name: "Фінанси", icon: DollarSign, color: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  { name: "Контент", icon: FileText, color: "border-teal-500/30 bg-teal-500/15 text-teal-300" },
];

export function getTagStyle(tag: string) {
  const lower = tag.toLowerCase().trim();
  if (lower.includes("модератор")) return "border-indigo-500/30 bg-indigo-500/15 text-indigo-300 hover:border-indigo-500/50";
  if (lower.includes("розробник") || lower.includes("dev") || lower.includes("девелопер") || lower.includes("бек") || lower.includes("фронт")) {
    return "border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:border-cyan-500/50";
  }
  if (lower.includes("дизайн") || lower.includes("ui") || lower.includes("ux")) {
    return "border-pink-500/30 bg-pink-500/15 text-pink-300 hover:border-pink-500/50";
  }
  if (lower.includes("підтримк") || lower.includes("сапорт") || lower.includes("support")) {
    return "border-amber-500/30 bg-amber-500/15 text-amber-300 hover:border-amber-500/50";
  }
  if (lower.includes("адмін") || lower.includes("керівник") || lower.includes("admin")) {
    return "border-violet-500/30 bg-violet-500/15 text-violet-300 hover:border-violet-500/50";
  }
  if (lower.includes("маркет") || lower.includes("реклам") || lower.includes("smm")) {
    return "border-orange-500/30 bg-orange-500/15 text-orange-300 hover:border-orange-500/50";
  }
  if (lower.includes("фінанс") || lower.includes("бухгалтер") || lower.includes("оплат")) {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:border-emerald-500/50";
  }
  if (lower.includes("контент") || lower.includes("копірайт") || lower.includes("текст")) {
    return "border-teal-500/30 bg-teal-500/15 text-teal-300 hover:border-teal-500/50";
  }

  // Generate consistent pseudo-color for arbitrary custom tags
  const colors = [
    "border-blue-500/30 bg-blue-500/15 text-blue-300",
    "border-purple-500/30 bg-purple-500/15 text-purple-300",
    "border-rose-500/30 bg-rose-500/15 text-rose-300",
    "border-yellow-500/30 bg-yellow-500/15 text-yellow-300",
    "border-sky-500/30 bg-sky-500/15 text-sky-300",
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface TaskTagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}

export default function TaskTagSelector({
  selectedTags = [],
  onChange,
  label = "Кого стосується (Теги / Ролі)"
}: TaskTagSelectorProps) {
  const [customInput, setCustomInput] = useState("");

  const toggleTag = (tagName: string) => {
    const exists = selectedTags.some(t => t.toLowerCase() === tagName.toLowerCase());
    if (exists) {
      onChange(selectedTags.filter(t => t.toLowerCase() !== tagName.toLowerCase()));
    } else {
      onChange([...selectedTags, tagName]);
    }
  };

  const handleAddCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = customInput.trim();
    if (!clean) return;

    const exists = selectedTags.some(t => t.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      onChange([...selectedTags, clean]);
    }
    setCustomInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddCustom();
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-emerald-400" />
          <span>{label}</span>
        </label>
        {selectedTags.length > 0 && (
          <span className="text-[10px] text-gray-400 font-mono">
            Обрано: {selectedTags.length}
          </span>
        )}
      </div>

      {/* Selected Tags list */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-[#161618] rounded-lg border border-white/5">
          {selectedTags.map((tag) => {
            const style = getTagStyle(tag);
            return (
              <span
                key={tag}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${style} shadow-xs transition-all`}
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="p-0.5 hover:text-white rounded-full hover:bg-black/30 transition-colors cursor-pointer"
                  title="Видалити тег"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Quick preset suggestion pills */}
      <div>
        <span className="text-[10px] text-gray-500 block mb-1.5">
          Швидкий вибір ролей:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_ROLE_TAGS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = selectedTags.some(t => t.toLowerCase() === preset.name.toLowerCase());
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => toggleTag(preset.name)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all cursor-pointer ${
                  isSelected
                    ? `${preset.color} ring-1 ring-white/20 font-bold shadow-xs scale-102`
                    : "border-white/10 bg-white/[0.02] text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{preset.name}</span>
                {isSelected && <X className="w-2.5 h-2.5 ml-0.5 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Tag Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введіть свій тег або роль (напр. QA тестувальник, SEO) і натисніть Enter..."
            className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.01] text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={() => handleAddCustom()}
          disabled={!customInput.trim()}
          className="px-3 py-1.5 bg-white/5 hover:bg-emerald-600/20 text-gray-300 hover:text-emerald-400 border border-white/10 hover:border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Додати</span>
        </button>
      </div>
    </div>
  );
}
