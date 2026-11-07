import type { LanguageId } from "./types";

export type TranslationExampleCategory = "expressive" | "pairings" | "directions";

export type TranslationExample = {
  id: "celebration" | "secret" | "running" | "tickling" | "outrage" | "uncertain" | "calm-direction" | "tired-direction" | "crying-direction";
  category: TranslationExampleCategory;
  label: string;
  text: string;
};

type ExamplePhrases = readonly [running: string, tickling: string, outrage: string, uncertain: string, calm: string, tired: string, crying: string];

// These are static sample phrases, not learner text. Space each inline cue
// consistently, including adjacent cues and scripts without word spaces.
function paddedCues(text: string) {
  return text.replace(/\s*(\[[^\]]+\])\s*/g, " $1 ").replace(/ {2,}/g, " ");
}

function examples(celebration: string, secret: string, [running, tickling, outrage, uncertain, calm, tired, crying]: ExamplePhrases): readonly TranslationExample[] {
  const samples: TranslationExample[] = [
    { id: "celebration", category: "expressive", label: "Big celebration", text: celebration },
    { id: "secret", category: "expressive", label: "Playful secret", text: secret },
    { id: "running", category: "pairings", label: "Out of breath", text: `[panting] [tired] ${running}` },
    { id: "tickling", category: "pairings", label: "Can’t stop laughing", text: `[laughing] [excited] ${tickling}` },
    { id: "outrage", category: "pairings", label: "Clearing the air", text: `[clears throat] [angry] ${outrage}` },
    { id: "uncertain", category: "pairings", label: "Lost for words", text: `[sighing] [emphasis] ${uncertain}` },
    { id: "calm-direction", category: "directions", label: "Calm and experienced", text: `[the calm, measured tone of someone who has done this a thousand times] ${calm}` },
    { id: "tired-direction", category: "directions", label: "A very long shift", text: `[dead tired, end of a very long shift] ${tired}` },
    { id: "crying-direction", category: "directions", label: "Holding it together", text: `[voice rough from crying, trying to sound normal] ${crying}` },
  ];
  return samples.map((example) => ({ ...example, text: paddedCues(example.text) }));
}

// Fictional demonstrations. Keep cues in the speech text where delivery changes.
export const translationExamples: Record<LanguageId, readonly TranslationExample[]> = {
  en: examples(
    "We did it! [excited] The whole team is coming to the party! [shouting] Let’s celebrate!",
    "Come a little closer. [whispering] The surprise cake is hidden in the kitchen. [laughing] I nearly ate it all!",
    [
      "I've been running...", "Hey! Stop tickling me!", "How could you?!", "I just don't know.",
      "Take your time. I’ll walk you through it.",
      "The shift is finally over. I’m going home.",
      "I’m okay. I just need a moment.",
    ],
  ),
  es: examples(
    "¡Lo conseguimos! [excited] ¡Todo el equipo viene a la fiesta! [shouting] ¡Vamos a celebrarlo!",
    "Acércate un poco. [whispering] La tarta sorpresa está escondida en la cocina. [laughing] ¡Casi me la como entera!",
    [
      "He estado corriendo...", "¡Eh! ¡Deja de hacerme cosquillas!", "¡¿Cómo has podido?!", "Es que no lo sé.",
      "Tómate tu tiempo. Te guiaré paso a paso.",
      "Por fin terminó el turno. Me voy a casa.",
      "Estoy bien. Solo necesito un momento.",
    ],
  ),
  fr: examples(
    "On a réussi ! [excited] Toute l’équipe vient à la fête ! [shouting] On va célébrer ça !",
    "Approche un peu. [whispering] Le gâteau surprise est caché dans la cuisine. [laughing] J’ai failli le manger en entier !",
    [
      "J’ai couru...", "Hé ! Arrête de me chatouiller !", "Comment as-tu pu ?!", "Je ne sais vraiment pas.",
      "Prends ton temps. Je vais te guider pas à pas.",
      "Le service est enfin terminé. Je rentre chez moi.",
      "Ça va. J’ai juste besoin d’un moment.",
    ],
  ),
  it: examples(
    "Ce l’abbiamo fatta! [excited] Tutta la squadra viene alla festa! [shouting] Festeggiamo!",
    "Avvicinati un po’. [whispering] La torta a sorpresa è nascosta in cucina. [laughing] Stavo per mangiarla tutta!",
    [
      "Ho corso...", "Ehi! Smettila di farmi il solletico!", "Come hai potuto?!", "Non lo so proprio.",
      "Prenditi il tuo tempo. Ti guiderò passo dopo passo.",
      "Il turno è finalmente finito. Vado a casa.",
      "Sto bene. Ho solo bisogno di un momento.",
    ],
  ),
  de: examples(
    "Wir haben es geschafft! [excited] Das ganze Team kommt zur Party! [shouting] Lasst uns feiern!",
    "Komm ein bisschen näher. [whispering] Der Überraschungskuchen ist in der Küche versteckt. [laughing] Fast hätte ich ihn aufgegessen!",
    [
      "Ich bin gerannt...", "Hey! Hör auf, mich zu kitzeln!", "Wie konntest du nur?!", "Ich weiß es einfach nicht.",
      "Lass dir Zeit. Ich erkläre dir alles Schritt für Schritt.",
      "Die Schicht ist endlich vorbei. Ich gehe nach Hause.",
      "Mir geht’s gut. Ich brauche nur einen Moment.",
    ],
  ),
  "pt-BR": examples(
    "Conseguimos! [excited] A equipe inteira vem para a festa! [shouting] Vamos comemorar!",
    "Chega mais perto. [whispering] O bolo surpresa está escondido na cozinha. [laughing] Quase comi tudo!",
    [
      "Eu estava correndo...", "Ei! Para de me fazer cócegas!", "Como você pôde?!", "Eu simplesmente não sei.",
      "Sem pressa. Vou te guiar passo a passo.",
      "O turno finalmente acabou. Vou para casa.",
      "Eu estou bem. Só preciso de um momento.",
    ],
  ),
  ja: examples(
    "やったね！ [excited] チームのみんながパーティーに来るよ！ [shouting] さあ、お祝いしよう！",
    "ちょっと近くに来て。 [whispering] サプライズのケーキはキッチンに隠してあるんだ。 [laughing] 危うく全部食べちゃうところだった！",
    [
      "ずっと走ってきたんだ…", "ねえ！くすぐるのやめて！", "どうしてそんなことできるの？！", "本当にわからないんだ。",
      "ゆっくりで大丈夫。一つずつ説明するね。",
      "やっと仕事が終わった。もう家に帰るよ。",
      "大丈夫。ただ、少し時間がほしいだけ。",
    ],
  ),
  ko: examples(
    "우리가 해냈어! [excited] 팀원 모두 파티에 온대! [shouting] 신나게 축하하자!",
    "조금만 더 가까이 와 봐. [whispering] 깜짝 선물로 준비한 케이크는 주방에 숨겨 뒀어. [laughing] 내가 거의 다 먹을 뻔했지!",
    [
      "계속 뛰어왔어…", "야! 간지럼 그만 태워!", "어떻게 그럴 수 있어?!", "정말 모르겠어.",
      "천천히 해도 돼. 하나씩 알려 줄게.",
      "드디어 근무가 끝났어. 이제 집에 갈 거야.",
      "괜찮아. 잠깐 시간이 필요할 뿐이야.",
    ],
  ),
  "zh-CN": examples(
    "我们成功了！[excited] 整个团队都会来参加派对！[shouting] 一起庆祝吧！",
    "靠近一点。[whispering] 惊喜蛋糕就藏在厨房里。[laughing] 我差点把它吃光了！",
    [
      "我一直在跑步……", "哎！别挠我痒痒了！", "你怎么能这样？！", "我真的不知道。",
      "慢慢来。我会一步一步教你。",
      "终于下班了。我要回家了。",
      "我没事。只是需要缓一会儿。",
    ],
  ),
  ar: examples(
    "لقد نجحنا! [excited] سيأتي الفريق كله إلى الحفلة! [shouting] هيا نحتفل!",
    "اقترب قليلًا. [whispering] كعكة المفاجأة مخبأة في المطبخ. [laughing] كدت آكلها كلها!",
    [
      "لقد كنت أركض...", "مهلًا! توقف عن دغدغتي!", "كيف أمكنك فعل ذلك؟!", "أنا حقًا لا أعرف.",
      "خذ وقتك. سأرشدك خطوة بخطوة.",
      "انتهت المناوبة أخيرًا. سأعود إلى المنزل.",
      "أنا بخير. أحتاج فقط إلى لحظة.",
    ],
  ),
};
