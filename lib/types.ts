export const languages = [
  { id: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { id: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { id: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { id: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { id: "pt-BR", name: "Portuguese", native: "Português", flag: "🇧🇷" },
  { id: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { id: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { id: "zh-CN", name: "Mandarin", native: "中文", flag: "🇨🇳" },
  { id: "ar", name: "Arabic", native: "العربية", flag: "🇦🇪" },
  { id: "en", name: "English", native: "English", flag: "🇬🇧" },
] as const;
export type LanguageId = (typeof languages)[number]["id"];
export const topics = [
  { id: "cafe", name: "At the café", description: "Order a coffee and a little conversation.", icon: "coffee" },
  { id: "introductions", name: "Nice to meet you", description: "Make a first impression, in a new language.", icon: "hand" },
  { id: "travel", name: "Out exploring", description: "Ask for directions and find your way.", icon: "compass" },
  { id: "everyday", name: "Everyday life", description: "Small talk that takes you a little further.", icon: "sun" },
] as const;
export type TopicId = (typeof topics)[number]["id"];
export type Level = "beginner" | "intermediate" | "advanced";
export type TutorId = "maya" | "leo";
// A compact UI summary; actual Fish delivery can use natural-language cues.
export const tutorEmotions = [
  "warm", "excited", "curious", "calm", "friendly", "relaxed",
  "enthusiastic", "delighted", "encouraging", "confident",
  "laughing", "chuckling", "amused", "surprised", "empathetic", "playful",
  "whispering", "emphasis", "shouting", "tired", "angry", "sad",
] as const;
export type TutorEmotion = (typeof tutorEmotions)[number];
export const tutorEmotionTags: Record<TutorEmotion, string> = {
  warm: "[warm and encouraging]",
  excited: "[excited]",
  curious: "[curious]",
  calm: "[calm]",
  friendly: "[friendly]",
  relaxed: "[relaxed]",
  enthusiastic: "[enthusiastic]",
  delighted: "[delighted]",
  encouraging: "[encouraging]",
  confident: "[confident]",
  laughing: "[laughing]",
  chuckling: "[chuckling]",
  amused: "[amused]",
  surprised: "[surprised]",
  empathetic: "[empathetic]",
  playful: "[playful]",
  whispering: "[whispering]",
  emphasis: "[emphasis]",
  shouting: "[shouting]",
  tired: "[tired]",
  angry: "[angry]",
  sad: "[sad]",
};
export type TutorDeliverySegment = { text: string; emotion: string | null; physicalAction?: string | null };
export const emotionCues = [
  { label: "Warm", tag: "[warm and encouraging]" },
  { label: "Excited", tag: "[excited]" },
  { label: "Curious", tag: "[curious]" },
  { label: "Calm", tag: "[calm]" },
  { label: "Whisper", tag: "[whispering]" },
  { label: "Laugh", tag: "[laughing]" },
  { label: "Emphasis", tag: "[emphasis]" },
  { label: "Pause", tag: "[break]" },
] as const;
export type ReplyOption = {
  text: string;
  meaning: string;
  pronunciation: string;
};
export type TutorReply = {
  text: string;
  translation: string;
  userTranslation: string;
  pronunciation: string;
  feedback: string;
  replyOptions: [ReplyOption, ReplyOption, ReplyOption];
  emotion: TutorEmotion;
  speechText: string;
};
export type TranslationReply = {
  text: string;
  pronunciation: string;
  meaning: string;
  note: string;
  speechText: string;
};
export type HistoryMessage = { role: "user" | "assistant"; text: string };
export type AppStatus = { fishReady: boolean; tutorReady: boolean; model: string; conversationEngine: string; translationCloneReady?: boolean };
export const MAX_TEXT_LENGTH = 1000;
export function isLanguage(value: unknown): value is LanguageId {
  return languages.some((language) => language.id === value);
}
export function isTopic(value: unknown): value is TopicId {
  return topics.some((topic) => topic.id === value);
}
export function isTutor(value: unknown): value is TutorId {
  return value === "maya" || value === "leo";
}
export function isTutorEmotion(value: unknown): value is TutorEmotion {
  return typeof value === "string" && tutorEmotions.some((emotion) => emotion === value);
}
export function speechTextError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Add something to say.";
  if (value.length > MAX_TEXT_LENGTH) return "Keep your text under 1,000 characters.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return "Use plain text and emotion cues.";
  return null;
}
