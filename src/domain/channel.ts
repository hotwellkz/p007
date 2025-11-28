import {
  Timestamp,
  serverTimestamp,
  type FirestoreDataConverter
} from "firebase/firestore";

export type SupportedPlatform =
  | "YOUTUBE_SHORTS"
  | "TIKTOK"
  | "INSTAGRAM_REELS"
  | "VK_CLIPS";

export type SupportedLanguage = "ru" | "en" | "kk";

export type GenerationMode = "script" | "prompt";

export interface Channel {
  id: string;
  name: string;
  platform: SupportedPlatform;
  language: SupportedLanguage;
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string;
  generationMode?: GenerationMode; // По умолчанию "script" для обратной совместимости
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChannelCreatePayload = Omit<
  Channel,
  "id" | "createdAt" | "updatedAt"
>;

type ChannelFirestoreData = Omit<Channel, "id">;

export const channelConverter: FirestoreDataConverter<Channel> = {
  toFirestore(channel: Channel): ChannelFirestoreData {
    const { id, ...rest } = channel;
    return {
      ...rest,
      generationMode: channel.generationMode || "script", // Значение по умолчанию
      createdAt: channel.createdAt ?? (serverTimestamp() as unknown as Timestamp),
      updatedAt: serverTimestamp() as unknown as Timestamp
    };
  },
  fromFirestore(snapshot, options): Channel {
    const data = snapshot.data(options) as ChannelFirestoreData;
    return {
      id: snapshot.id,
      generationMode: data.generationMode || "script", // Значение по умолчанию для старых каналов
      ...data
    };
  }
};

export const createEmptyChannel = (): Channel => {
  const now = Timestamp.now();
  return {
    id: "",
    name: "",
    platform: "YOUTUBE_SHORTS",
    language: "ru",
    targetDurationSec: 15,
    niche: "",
    audience: "",
    tone: "",
    blockedTopics: "",
    extraNotes: "",
    generationMode: "script",
    createdAt: now,
    updatedAt: now
  };
};

