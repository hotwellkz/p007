import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save, X } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type {
  Channel,
  SupportedPlatform,
  SupportedLanguage,
  GenerationMode
} from "../../domain/channel";

const PLATFORMS: { value: SupportedPlatform; label: string }[] = [
  { value: "YOUTUBE_SHORTS", label: "YouTube Shorts" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM_REELS", label: "Instagram Reels" },
  { value: "VK_CLIPS", label: "VK Клипы" }
];

const LANGUAGES: { value: SupportedLanguage; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "kk", label: "Қазақша" }
];

const DURATIONS = [8, 15, 30, 60];

const TONES = [
  "Юмор",
  "Серьёзно",
  "Дерзко",
  "Детское",
  "Образовательное",
  "Вдохновляющее",
  "Развлекательное",
  "Профессиональное"
];

const ChannelEditPage = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { channels, fetchChannels, updateChannel } = useChannelStore(
    (state) => ({
      channels: state.channels,
      fetchChannels: state.fetchChannels,
      updateChannel: state.updateChannel
    })
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!user?.uid || !channelId) {
      navigate("/channels", { replace: true });
      return;
    }

    const loadChannel = async () => {
      setLoading(true);
      try {
        await fetchChannels(user.uid);
        const found = channels.find((c) => c.id === channelId);
        if (found) {
          setChannel(found);
        } else {
          setError("Канал не найден");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Ошибка при загрузке канала"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadChannel();
  }, [user?.uid, channelId, navigate, fetchChannels]);

  useEffect(() => {
    if (channels.length > 0 && channelId) {
      const found = channels.find((c) => c.id === channelId);
      if (found) {
        // Убеждаемся, что generationMode установлен (для старых каналов)
        setChannel({
          ...found,
          generationMode: found.generationMode || "script"
        });
        setLoading(false);
      }
    }
  }, [channels, channelId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.uid || !channel) {
      return;
    }

    if (!channel.name.trim()) {
      setError("Название канала обязательно");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateChannel(user.uid, channel);
      navigate("/channels", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при обновлении канала"
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
          Загрузка канала...
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-xl space-y-4 rounded-2xl border border-red-500/30 bg-red-900/20 p-8 text-center">
          <h1 className="text-2xl font-semibold text-red-200">
            Канал не найден
          </h1>
          <p className="text-red-300">{error || "Канал не существует"}</p>
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition hover:border-brand/40 hover:text-white"
          >
            <ArrowLeft size={16} className="inline mr-2" />
            Назад
          </button>
          <h1 className="text-2xl font-semibold">Редактирование канала</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl shadow-brand/10">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Название канала *
              </label>
              <input
                type="text"
                value={channel.name}
                onChange={(e) =>
                  setChannel({ ...channel, name: e.target.value })
                }
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Название канала"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Платформа *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.value}
                    type="button"
                    onClick={() =>
                      setChannel({ ...channel, platform: platform.value })
                    }
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      channel.platform === platform.value
                        ? "border-brand bg-brand/10 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                    }`}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Язык *
                </label>
                <div className="grid gap-3">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() =>
                        setChannel({ ...channel, language: lang.value })
                      }
                      className={`rounded-xl border px-4 py-3 text-center transition ${
                        channel.language === lang.value
                          ? "border-brand bg-brand/10 text-white"
                          : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Длительность (сек) *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {DURATIONS.map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() =>
                        setChannel({
                          ...channel,
                          targetDurationSec: duration
                        })
                      }
                      className={`rounded-xl border px-4 py-3 text-center transition ${
                        channel.targetDurationSec === duration
                          ? "border-brand bg-brand/10 text-white"
                          : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                      }`}
                    >
                      {duration} сек
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Ниша / Тематика *
              </label>
              <input
                type="text"
                value={channel.niche}
                onChange={(e) =>
                  setChannel({ ...channel, niche: e.target.value })
                }
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Например: Технологии, Кулинария, Спорт"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Целевая аудитория *
              </label>
              <textarea
                value={channel.audience}
                onChange={(e) =>
                  setChannel({ ...channel, audience: e.target.value })
                }
                required
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Опишите целевую аудиторию"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Тон / Стиль *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {TONES.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setChannel({ ...channel, tone })}
                    className={`rounded-xl border px-4 py-3 text-center transition ${
                      channel.tone === tone
                        ? "border-brand bg-brand/10 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Запрещённые темы
              </label>
              <textarea
                value={channel.blockedTopics}
                onChange={(e) =>
                  setChannel({ ...channel, blockedTopics: e.target.value })
                }
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Темы, которые не должны появляться в сценариях"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Дополнительные пожелания
              </label>
              <textarea
                value={channel.extraNotes || ""}
                onChange={(e) =>
                  setChannel({ ...channel, extraNotes: e.target.value })
                }
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Любые дополнительные требования к сценариям..."
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Режим генерации *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setChannel({
                      ...channel,
                      generationMode: "script"
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    (channel.generationMode || "script") === "script"
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  <div className="font-semibold">Сценарий</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Только подробный сценарий
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChannel({
                      ...channel,
                      generationMode: "prompt"
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    channel.generationMode === "prompt"
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  <div className="font-semibold">Сценарий + промпт для видео</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Сценарий + VIDEO_PROMPT для Sora/Veo
                  </div>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate("/channels")}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-brand/40 hover:text-white"
              >
                <X size={16} />
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-brand-dark"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Сохранить изменения
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChannelEditPage;
