import { Calendar, Clock, Languages, Users, Sparkles } from "lucide-react";
import type { Channel } from "../domain/channel";
import { timestampToIso } from "../utils/firestore";

interface ChannelCardProps {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  onAutoGenerate?: () => void;
}

const platformLabels: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const languageLabels: Record<Channel["language"], string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша"
};

const ChannelCard = ({
  channel,
  onEdit,
  onDelete,
  onGenerate,
  onAutoGenerate
}: ChannelCardProps) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-white shadow-lg shadow-brand/5 transition hover:border-brand/30 hover:shadow-brand/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {platformLabels[channel.platform]}
          </p>
          <h3 className="mt-1 text-2xl font-semibold">{channel.name}</h3>
        </div>
        <span className="rounded-full border border-white/20 px-4 py-1 text-sm text-slate-200">
          {channel.tone || "Без тона"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand-light" />
          {channel.targetDurationSec} сек · {languageLabels[channel.language]}
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-light" />
          {channel.audience || "Не указана аудитория"}
        </div>
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-brand-light" />
          {channel.niche || "Нет ниши"}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand-light" />
          Обновлён {new Date(timestampToIso(channel.updatedAt)).toLocaleString()}
        </div>
      </div>

      {channel.blockedTopics && (
        <p className="mt-4 rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-200">
          Запрещено: {channel.blockedTopics}
        </p>
      )}

      {channel.extraNotes && (
        <p className="mt-2 rounded-xl bg-slate-800/40 px-4 py-3 text-sm text-slate-200">
          Пожелания: {channel.extraNotes}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onGenerate}
          className="flex-1 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          Сгенерировать
        </button>
        {onAutoGenerate && (
          <button
            type="button"
            onClick={onAutoGenerate}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand/80 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark sm:px-4"
            title="Автогенерация идеи и сценариев от ИИ"
          >
            <Sparkles size={16} />
            <span className="hidden xs:inline sm:hidden">ИИ</span>
            <span className="hidden sm:inline">ИИ-идея</span>
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-brand/40 hover:text-white"
        >
          Редактировать
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-200 transition hover:border-red-400 hover:text-white sm:w-auto"
        >
          Удалить
        </button>
      </div>
    </div>
  );
};

export default ChannelCard;

