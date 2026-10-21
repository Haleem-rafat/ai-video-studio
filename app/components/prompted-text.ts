/** Prompted mode's interface text in English and Arabic; the questions themselves come from the server, in both. */
export type Lang = "en" | "ar";

const TEXT = {
  title: { en: "Prompted mode", ar: "الوضع الموجَّه" },
  intro: {
    en: "Answer in your own words, in Arabic or English. Every answer makes ideas, carousels and reels more like this business. Nothing here is required to make posts: save and come back any time.",
    ar: "جاوب بكلامك، بالعربي أو الإنجليزي. كل إجابة بتخلّي الأفكار والكاروسيل والريلز أقرب لنشاطك. مفيش حاجة هنا إجبارية عشان نعمل بوستات: احفظ وارجع في أي وقت.",
  },
  answered: { en: "{n} of {total} answered", ar: "{n} من {total} متجاوب" },
  important: { en: "{n} of {total} important answered", ar: "{n} من {total} مهم متجاوب" },
  complete: { en: "Profile complete", ar: "البروفايل مكتمل" },
  required: { en: "Important", ar: "مهم" },
  example: { en: "e.g.", ar: "مثال:" },
  other: { en: "Your own words", ar: "بكلامك" },
  fromWebsite: { en: "From your website and Knowledge", ar: "من موقعك والمعرفة" },
  useThis: { en: "Use this", ar: "استخدم ده" },
  sourceWebsite: { en: "confirmed from the website", ar: "متأكد من الموقع" },
  sourceDocx: { en: "imported from Word", ar: "متستورد من وورد" },
  sourceJson: { en: "imported from JSON", ar: "متستورد من JSON" },
  back: { en: "Back", ar: "رجوع" },
  next: { en: "Save and next", ar: "احفظ واللي بعده" },
  finish: { en: "Save", ar: "احفظ" },
  save: { en: "Save", ar: "احفظ" },
  saving: { en: "Saving…", ar: "بيحفظ…" },
  saved: { en: "Saved", ar: "اتحفظ" },
  unsaved: { en: "Unsaved changes", ar: "تغييرات مش محفوظة" },
  saveFailed: { en: "Couldn't save; your answers are still here. Try again.", ar: "محفظناش؛ إجاباتك لسه هنا. جرّب تاني." },
  loadFailed: { en: "Couldn't load the questionnaire", ar: "معرفناش نحمّل الاستبيان" },
  retry: { en: "Try again", ar: "جرّب تاني" },
  export: { en: "Export questionnaire", ar: "صدّر الاستبيان" },
  exportWord: { en: "Word document (.docx)", ar: "ملف وورد (.docx)" },
  exportPdf: { en: "PDF to print", ar: "PDF للطباعة" },
  exportJson: { en: "JSON (for import)", ar: "JSON (للاستيراد)" },
  exportIn: { en: "Questions in {lang}", ar: "الأسئلة بـ{lang}" },
  english: { en: "English", ar: "الإنجليزي" },
  arabic: { en: "Arabic", ar: "العربي" },
  import: { en: "Import answers", ar: "استورد إجابات" },
  importHint: { en: "A Word or JSON file exported here and filled in by the client.", ar: "ملف وورد أو JSON اتصدّر من هنا والعميل ملاه." },
  importTitle: { en: "Import {n} answers?", ar: "نستورد {n} إجابة؟" },
  importBody: { en: "Answers in the file replace the saved ones; questions the file left empty keep their saved answers.", ar: "الإجابات اللي في الملف هتحل محل المحفوظة؛ الأسئلة الفاضية في الملف هتفضل زي ما هي." },
  importNone: { en: "No answers found in this file.", ar: "ملقيناش إجابات في الملف ده." },
  importOther: { en: "This file was made for another client. Import it here anyway?", ar: "الملف ده معمول لعميل تاني. نستورده هنا برضه؟" },
  importAnyway: { en: "Import anyway", ar: "استورد برضه" },
  importDo: { en: "Import", ar: "استورد" },
  importDone: { en: "Imported {n} answers", ar: "اتستوردت {n} إجابة" },
  problems: { en: "Skipped or fixed", ar: "اتشال أو اتصلّح" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  preview: { en: "What the AI sees", ar: "اللي الذكاء الاصطناعي بيشوفه" },
  previewIntro: {
    en: "Each writer gets only what it uses: your answers first (they win over the website), then the Knowledge, then a structure to follow.",
    ar: "كل كاتب بياخد اللي محتاجه بس: إجاباتك الأول (وهي اللي بتكسب على الموقع)، بعدين المعرفة، بعدين هيكل يمشي عليه.",
  },
  ideas: { en: "Ideas", ar: "الأفكار" },
  carousel: { en: "Carousels", ar: "الكاروسيل" },
  reel: { en: "Reels", ar: "الريلز" },
  review: { en: "Quality check", ar: "مراجعة الجودة" },
  empty: { en: "No answers yet: writers use the website and Knowledge only.", ar: "مفيش إجابات لسه: الكتّاب بيستخدموا الموقع والمعرفة بس." },
  loading: { en: "Loading…", ar: "بيحمّل…" },
  sections: { en: "Sections", ar: "الأقسام" },
} satisfies Record<string, Record<Lang, string>>;

export type TextKey = keyof typeof TEXT;

/** The text for `key` in `lang`, with {placeholders} filled in. */
export function say(lang: Lang, key: TextKey, values: Record<string, string | number> = {}): string {
  return TEXT[key][lang].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
