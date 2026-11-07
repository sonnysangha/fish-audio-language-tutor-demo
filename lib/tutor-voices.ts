import type { LanguageId, TutorId } from "./types";

export type VoiceProfile = {
  id: string;
  name: string;
  locale: string;
  reason: string;
};

// Public, trained Fish Official catalogue voices, checked 2026-11-05.
// Locale and style describe catalogue metadata, not an audible quality score.
// Arabic uses Saudi/Gulf voices; Spanish uses voices from Spain.
export const languageVoices: Record<LanguageId, Record<TutorId, VoiceProfile>> = {
  "es": {
    "maya": {
      "id": "1a04ca70dd504f63bdf314066bab8ffb",
      "name": "Alba",
      "locale": "es-ES",
      "reason": "Fish Official, public and trained; explicitly Castilian Spanish female, clear, friendly and bright, language instructor persona suitable for lessons and tutoring."
    },
    "leo": {
      "id": "b8623413606443d5b15cdb4c35ad3c9a",
      "name": "Javier",
      "locale": "es-ES",
      "reason": "Fish Official, public and trained; explicitly Castilian Spanish male, Madrid persona, warm, relaxed, smooth and conversational. Spain accent, not asserted pan-Spanish neutral."
    }
  },
  "fr": {
    "maya": {
      "id": "bdfbdcb27253419ba7e0746af7a154f8",
      "name": "Clémence",
      "locale": "fr-FR",
      "reason": "Fish Official, public and trained; explicitly Parisian-accented French female, soft, warm, friendly conversational voice."
    },
    "leo": {
      "id": "525318fedcca4948acb906f2f3a9af0d",
      "name": "Mathieu",
      "locale": "fr-FR",
      "reason": "Fish Official, public and trained; explicitly Parisian-accented French male, warm, smooth, calm and conversational."
    }
  },
  "it": {
    "maya": {
      "id": "0e36e185d0654d5bac3d24331562a0cc",
      "name": "Giulia",
      "locale": "it",
      "reason": "Fish Official; public trained female Italian voice; described as clear and confident for voice assistants. Regional locale not explicitly tagged; warm delivery remains a TTS cue."
    },
    "leo": {
      "id": "f6cbad8b89254774a495c088aeb7822e",
      "name": "Marco",
      "locale": "it",
      "reason": "Fish Official; public trained male Italian voice; described as clear and confident for voice assistants. Regional locale not explicitly tagged; calm delivery remains a TTS cue."
    }
  },
  "de": {
    "maya": {
      "id": "3937b44b604249f18b94913daef94043",
      "name": "Lena",
      "locale": "de-DE",
      "reason": "Fish Official; public trained female voice; German de-de tag; conversational, clear and professional metadata. Warm delivery remains a TTS cue."
    },
    "leo": {
      "id": "44f1ec96a51e429f8b87776cbc55a997",
      "name": "Jonas",
      "locale": "de",
      "reason": "Fish Official; public trained male German voice; described as clear and confident for voice assistants. Regional locale not explicitly tagged; calm delivery remains a TTS cue."
    }
  },
  "pt-BR": {
    "maya": {
      "id": "0e26d2df0d0848e3b34099bfb55fd6ea",
      "name": "Beatriz",
      "locale": "pt-BR",
      "reason": "Fish Official; public trained female voice; explicit pt-br tag; conversational, clear and professional metadata. Warm delivery remains a TTS cue."
    },
    "leo": {
      "id": "0ffee1af32254090b3630823baade12b",
      "name": "Rafael",
      "locale": "pt-BR",
      "reason": "Fish Official; public trained male voice; explicit pt-br tag; conversational, clear and professional metadata. Calm delivery remains a TTS cue."
    }
  },
  "ja": {
    "maya": {
      "id": "49605213c91443e7bf6fddbf54e38890",
      "name": "七海 Nanami",
      "locale": "ja-JP",
      "reason": "Fish Official; Japanese female, young, conversational, soft, warm, friendly, relaxed; description specifies a Tokyo voice for everyday conversation."
    },
    "leo": {
      "id": "297a6fd278df47c3b9da9bfdf55ac89a",
      "name": "さとる Satoru",
      "locale": "ja-JP",
      "reason": "Fish Official; Japanese male, educational, calm, relaxed, warm, measured and clear; description recommends everyday speech and relaxed narration; 124090 tasks."
    }
  },
  "ko": {
    "maya": {
      "id": "849c4e02d2f347bfafcbf355507f7808",
      "name": "혜진 Hyejin",
      "locale": "ko-KR",
      "reason": "Fish Official; Korean female, conversational, ko-kr and Seoul tags; description specifies Seoul accent for everyday conversation and companion apps."
    },
    "leo": {
      "id": "117adf85c36c41a792662458db470777",
      "name": "도현 Dohyeon",
      "locale": "ko-KR",
      "reason": "Fish Official; Korean male, educational, teacher, clear, friendly, warm; description explicitly describes a patient language tutor from Seoul."
    }
  },
  "zh-CN": {
    "maya": {
      "id": "8b1b2413e55e495f82471aa2248561c3",
      "name": "晓彤 Xiaotong",
      "locale": "zh-CN",
      "reason": "Fish Official; Chinese female, educational, teacher, zh-cn, clear, bright and friendly; description specifies Mainland accent and patient language tutoring."
    },
    "leo": {
      "id": "fdc29e5149ea49c7b21c2556c5f05ce2",
      "name": "建国 Jianguo",
      "locale": "zh-CN",
      "reason": "Fish Official; Chinese male, conversational, zh-cn, warm, friendly, smooth and calm; description specifies Mainland accent, Beijing persona and everyday conversation."
    }
  },
  "ar": {
    "maya": {
      "id": "706f61d83985440499ce9c51501153a3",
      "name": "نورة Noura",
      "locale": "ar-SA",
      "reason": "Fish Official, public and trained; Arabic female voice tagged clear, professional, confident and conversational. Saudi Arabic (ar-sa; Saudi colloquial sample), not verified neutral MSA."
    },
    "leo": {
      "id": "a4cc454c1da84ccd8d809626ce87df77",
      "name": "سلطان Sultan",
      "locale": "ar-SA",
      "reason": "Fish Official, public and trained; male Gulf-accented Arabic voice, Riyadh persona, tagged warm, smooth, friendly and conversational. Saudi/Gulf accent, not neutral MSA."
    }
  },
  "en": {
    "maya": {
      "id": "9a9cf47702da476aa4629e2506d4a857",
      "name": "Hannah",
      "locale": "en",
      "reason": "Public trained Fish Official English stock voice, retained for the English tutor."
    },
    "leo": {
      "id": "536d3a5e000945adb7038665781a4aca",
      "name": "Ethan",
      "locale": "en",
      "reason": "Public trained Fish Official English stock voice, retained for the English tutor."
    }
  }
};

export function getTutorVoice(language: LanguageId, tutor: TutorId): VoiceProfile {
  return languageVoices[language][tutor];
}
