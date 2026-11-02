// Speaks a reel's lines with a Gemini narrator, then writes voice.mp3 and the times each line
// starts and ends, so the style JSONs can point at lines instead of seconds.
//
//   node reels/voice.mjs <job>/lines.json [channel-id]
//
// lines.json: ["first line", "second line", ...]  (numbers as digits, product names in English)
// Writes <job>/voice.mp3 and <job>/timing.json: [{ line, text, start, end, words }]
import { generateSpeech, generateText, Output, transcribe } from "ai";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { COMMON_WORDS, spokenText } from "../src/media/spoken.ts";

const root = join(dirname(new URL(import.meta.url).pathname), "..");

const LEAD = 0.15; // silence before the first line
const GAP = 0.18; // short breath between lines, keeps reels moving
// Reels are spoken at about 2.6 words a second; a slower take is sped up (same pitch) to it, at most 30%.
const PACE = 2.6;
// Gemini's own narrators (the haleemrafat channel voice is Charon): spoken by Gemini TTS, not ElevenLabs.
const GEMINI_VOICES = new Set(["Charon", "Orus", "Fenrir", "Puck", "Zephyr", "Laomedeia", "Sulafat", "Kore", "Aoede"]);

const seconds = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

const STYLE = "اقرأ باللهجة المصرية العامية، بإيقاع سريع وحماسي وحيوي جداً مناسب للريلز.";
const ELEVEN_VOICE = {
  MarcoNady: "Ojb0nFbyzZn95u0i5a5p",
  Ojb0nFbyzZn95u0i5a5p: "Ojb0nFbyzZn95u0i5a5p",
  Hammam: "VxSsN5NGusWQZXue7VE9",
  VxSsN5NGusWQZXue7VE9: "VxSsN5NGusWQZXue7VE9",
  Mamdoh: "68MRVrnQAt8vLbu0FCzw",
  "68MRVrnQAt8vLbu0FCzw": "68MRVrnQAt8vLbu0FCzw",
  Sara: "vghiSqG5ezdhd8F3tKAD",
  vghiSqG5ezdhd8F3tKAD: "vghiSqG5ezdhd8F3tKAD",
  IES4nrmZdUBHByLBde0P: "Ojb0nFbyzZn95u0i5a5p",
  Charon: "Ojb0nFbyzZn95u0i5a5p",
  Orus: "VxSsN5NGusWQZXue7VE9",
  Fenrir: "68MRVrnQAt8vLbu0FCzw",
  Puck: "TX3LPaxmHKxFdv7VOQHJ",
  Zephyr: "vghiSqG5ezdhd8F3tKAD",
  Laomedeia: "EXAVITQu4vr4xnSDxMaL",
  Sulafat: "Xb7hH8MSUJpSbSDYk0k2",
  Kore: "pFZP5JQG7iQjIQuC4Bku",
  Aoede: "pFZP5JQG7iQjIQuC4Bku",
};
const OPENAI_VOICE = {
  Charon: "onyx",
  Orus: "echo",
  Fenrir: "fable",
  Puck: "alloy",
  Zephyr: "nova",
  Laomedeia: "shimmer",
  Sulafat: "coral",
  Kore: "sage",
  Aoede: "sage",
};
const SPOKEN_MAP = {
  ...COMMON_WORDS,
  Risero: "رايزرو",
  الرسائل: "الرسايل",
  رسائل: "رسايل",
  عملاء: "عملا",
  العملاء: "العملا",
  أنت: "إنت",
  ثلاثة: "تلاتة",
  ثلاث: "تلات",
  اثنين: "اتنين",
  ثواني: "ثواني",
  "فورًا": "في ساعتها",
  "فوراً": "في ساعتها",
  "فعلاً": "بجد",
  "فعلًا": "بجد",
  "جداً": "قوي",
  "جدًا": "قوي",
  "تلقائياً": "لوحده",
  "تلقائيًا": "لوحده",
};

function wordsFromAlignment(alignment) {
  const words = [];
  let current = null;
  alignment.characters.forEach((char, index) => {
    if (/\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    const start = alignment.character_start_times_seconds[index];
    const end = alignment.character_end_times_seconds[index];
    if (current) {
      current.text += char;
      current.end = end;
    } else {
      current = { text: char, start, end };
    }
  });
  if (current) words.push(current);
  return words;
}

function cleanEgyptianColloquial(line) {
  return line
    .replace(/[ًٌٍ]/g, "")
    .replace(/كـ\s+/g, "ك")
    .replace(/\s+/g, " ")
    .trim();
}

function pcmToWav(pcm, sampleRate = 24000) {
  const b = Buffer.alloc(44 + pcm.length);
  b.write("RIFF", 0); b.writeUInt32LE(36 + pcm.length, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(pcm.length, 40);
  Buffer.from(pcm).copy(b, 44);
  return new Uint8Array(b);
}

let gatewayRestricted = false;

async function prepareEgyptianLines(lines, language) {
  if (language !== "ar") return lines;
  const plain = lines.map((line) =>
    spokenText(
      line
        .replace(/(\d+)\s*[-–]\s*(\d+)/g, "$1 أو $2")
        .replace(/[«»"—–]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      SPOKEN_MAP,
    ),
  );
  if (!gatewayRestricted) {
    try {
      const { output } = await generateText({
        model: "openai/gpt-5",
        output: Output.object({ schema: z.object({ texts: z.array(z.string()) }) }),
        prompt: `Add Egyptian colloquial Arabic vowel marks (تشكيل بالعامية المصرية القاهرية) to these lines so a text-to-speech voice reads them in clear, natural Egyptian colloquial Arabic (عامي مصري واضح) and NEVER in formal Fusha (فصحى).
Rules:
- Put sukoon (ْ) at the end of words so the voice NEVER adds formal Fusha case endings (tanween, damma, or kasra at word endings, e.g. write «آخْرُهْ» not «آخِرِهِ», «مُهْتَمّ» not «مُهْتَمٌّ», «الرَّسايِلْ» not «الرَّسَائِلِ»).
- Vowel verb prefixes the Egyptian way (بِتِتْأَخَّرْ، تْرُدّ، تْسِيبْها، بِتِكْتِبْ، يِبْدَأْ، اِكْتِبْ، اِبْعَتْ).
- Keep the exact same words and order; return the same number of lines.

${JSON.stringify({ texts: plain })}`,
      });
      if (output.texts.length === plain.length) return output.texts;
    } catch {
      gatewayRestricted = true;
    }
  }
  return plain.map(cleanEgyptianColloquial);
}

let geminiRestricted = false;
const ELEVEN_MODELS = ["elevenlabs/eleven-v3", "elevenlabs/eleven-multilingual-v2", "elevenlabs/eleven-flash-v2.5", "elevenlabs/eleven-v4", "elevenlabs/eleven-v3-conversational"];

async function speakLineDirectElevenLabs(voice, text, prevText, nextText) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const voiceId = ELEVEN_VOICE[voice] ?? voice ?? "VxSsN5NGusWQZXue7VE9";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        // multilingual v2 takes the lines around this one, so each line continues the last one's tone instead of starting fresh.
        model_id: "eleven_multilingual_v2",
        ...(prevText ? { previous_text: prevText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.audio_base64) return null;
    return {
      directMp3: true,
      audio: { uint8Array: new Uint8Array(Buffer.from(data.audio_base64, "base64")) },
      words: data.alignment ? wordsFromAlignment(data.alignment) : null,
    };
  }
  return null;
}

async function speakLine(voice, text, instructions, index = 0, prevText, nextText) {
  const direct = GEMINI_VOICES.has(voice) ? null : await speakLineDirectElevenLabs(voice, text, prevText, nextText).catch(() => null);
  if (direct) return { ...direct, engine: "elevenlabs (direct)" };
  if (!geminiRestricted) {
    try {
      // Each line is spoken alone, so it is told it sits in one continuous talk between its neighbours.
      const flow = `${instructions} ده سطر من كلام واحد متصل مش جملة لوحدها: كمّل بنفس الطاقة والنبرة والسرعة اللي قبله، من غير ما تبدأ من الأول ولا تقفل الجملة كأنها نهاية الكلام.${prevText ? ` اللي اتقال قبله: «${prevText}».` : ""}${nextText ? ` اللي جاي بعده: «${nextText}».` : ""}`;
      return { ...(await generateSpeech({ model: "google/gemini-3.8-flash-tts", voice, text, instructions: flow })), engine: "gemini" };
    } catch (error) {
      if (!(error instanceof Error && /Free tier users do not have access|Rate limit exceeded|Unauthenticated|Authentication failed/i.test(error.message))) throw error;
      if (/Free tier users do not have access|Unauthenticated|Authentication failed/i.test(error.message)) geminiRestricted = true;
    }
  }
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${instructions}\n\n${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) return { audio: { uint8Array: pcmToWav(Buffer.from(b64, "base64")) }, engine: "gemini (direct)" };
    }
  }
  const voiceId = ELEVEN_VOICE[voice] ?? "JBFqnCBsd6RMkjVDRZzb";
  for (let m = 0; m < ELEVEN_MODELS.length; m++) {
    const model = ELEVEN_MODELS[(index + m) % ELEVEN_MODELS.length];
    try {
      return { ...(await generateSpeech({ model, voice: voiceId, text, language: "ar" })), engine: model };
    } catch (error) {
      if (!(error instanceof Error && /Free tier users do not have access|Rate limit exceeded/i.test(error.message))) throw error;
    }
  }
  // OpenAI's voices read Arabic with an English accent, so a reel is never voiced with them without asking.
  if (process.env.ALLOW_OPENAI_VOICE !== "1") throw new Error(`No voice engine could speak line ${index + 1}: Gemini and ElevenLabs both failed (check the AI Gateway key and credits, or set ELEVENLABS_API_KEY)`);
  return { ...(await generateSpeech({ model: "openai/tts-1-hd", voice: OPENAI_VOICE[voice] ?? "onyx", text })), engine: "openai (English accent)" };
}

function estimateWords(text, duration) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const totalChars = parts.reduce((sum, w) => sum + w.length, 0) || 1;
  let at = 0;
  return parts.map((w) => {
    const len = (w.length / totalChars) * duration;
    const item = { text: w, start: +at.toFixed(3), end: +(at + len).toFixed(3) };
    at += len;
    return item;
  });
}

/** The file (in <job>/audio) of a line's take: named by voice, style, speed and text, so an unchanged line is reused. */
export function takeName(narrator, text) {
  const speed = narrator.speed && narrator.speed !== 1 ? `@${narrator.speed}` : "";
  return `${createHash("sha1").update(`eg5:${narrator.voice}${speed}:${narrator.style ?? STYLE}:${text}`).digest("hex").slice(0, 10)}.mp3`;
}

/**
 * Voices `lines` into `job` with `narrator` ({ voice, style, speed? }; speed 1.1 = 10% faster, same pitch). Lines spoken before (same voice,
 * style and text) are reused from <job>/audio. Returns the timing it wrote.
 */
export async function voiceLines(job, lines, narrator, { language = "ar", log = console.log } = {}) {
  const style = narrator.style ?? STYLE;
  const tempo = narrator.speed && narrator.speed !== 1 ? `,atempo=${narrator.speed}` : "";
  const dir = join(job, "audio");
  mkdirSync(dir, { recursive: true });
  const needsAny = lines.some((text) => {
    const take = takeName(narrator, text).replace(/\.mp3$/, "");
    return !existsSync(join(dir, `${take}.mp3`)) || !existsSync(join(dir, `${take}.json`));
  });
  const spokenLines = needsAny ? await prepareEgyptianLines(lines, language) : lines;
  let done = 0;

  const takes = new Array(lines.length);
  let nextIdx = 0;
  const voiceOne = async (text, i) => {
    // An unchanged line is not spoken (or paid for) again.
    const take = takeName(narrator, text).replace(/\.mp3$/, "");
    const raw = join(dir, `${take}.raw`), mp3 = join(dir, `${take}.mp3`), heardFile = join(dir, `${take}.json`);
    if (existsSync(mp3) && existsSync(heardFile)) return { mp3, words: JSON.parse(readFileSync(heardFile, "utf8")) };
    let alignedWords = null, engine = "";
    if (!existsSync(mp3)) {
      const spoken = await speakLine(narrator.voice, spokenLines[i], style, i, spokenLines[i - 1], spokenLines[i + 1]);
      alignedWords = spoken.words ?? null;
      engine = spoken.engine ?? "";
      writeFileSync(raw, spoken.audio.uint8Array);
      if (spoken.directMp3) {
        // ElevenLabs MP3s have no silence padding; silenceremove at -45dB was chopping off the first and last letters!
        if (tempo) {
          execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", tempo.slice(1), "-ar", "44100", "-ac", "1", "-b:a", "160k", mp3]);
          execFileSync("rm", ["-f", raw]);
        } else {
          execFileSync("mv", [raw, mp3]);
        }
      } else {
        // Gemini leaves silence at both ends; trimming it keeps the gaps even.
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", `silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse${tempo}`, "-ar", "44100", "-ac", "1", "-b:a", "160k", mp3]);
        execFileSync("rm", ["-f", raw]);
      }
    }
    const dur = seconds(mp3);
    let words = alignedWords, heardText = text;
    if (!words) {
      try {
        const heard = await transcribe({ model: "openai/whisper-1", audio: readFileSync(mp3), providerOptions: { openai: { language, timestampGranularities: ["word"] } } });
        words = heard.segments.map((w) => ({ text: w.text, start: w.startSecond, end: w.endSecond }));
        heardText = heard.text;
      } catch {
        words = estimateWords(text, dur);
      }
    }
    writeFileSync(heardFile, JSON.stringify(words));
    log(`voice: line ${i + 1} ${dur.toFixed(1)}s${engine ? ` [${engine}]` : ""} | ${heardText}`);
    log(`voice: ${++done} of ${lines.length} new lines`);
    return { mp3, words };
  };
  await Promise.all(
    Array.from({ length: Math.min(3, lines.length) }, async () => {
      while (nextIdx < lines.length) {
        const i = nextIdx++;
        takes[i] = await voiceOne(lines[i], i);
      }
    }),
  );

  // One track: lead-in, each line, a short gap after each.
  const timing = [];
  let at = LEAD;
  writeFileSync(join(dir, "lead.wav"), silence(LEAD));
  writeFileSync(join(dir, "gap.wav"), silence(GAP));
  const parts = [join(dir, "lead.wav")];
  takes.forEach((take, i) => {
    let { mp3, words } = take;
    // A drawn-out take is brought up to reel pace, unless the reel sets its own speed. The take itself stays cached as spoken.
    const said = seconds(mp3), count = lines[i].trim().split(/\s+/).length;
    const pace = !narrator.speed || narrator.speed === 1 ? Math.min(1.3, Math.max(1, PACE / (count / Math.max(0.3, said)))) : 1;
    const factor = Math.round(pace * 20) / 20;
    if (factor > 1) {
      const fast = mp3.replace(/\.mp3$/, `.x${factor}.mp3`);
      if (!existsSync(fast)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-af", `atempo=${factor}`, "-ar", "44100", "-ac", "1", "-b:a", "160k", fast]);
      mp3 = fast;
      words = words.map((w) => ({ ...w, start: w.start / factor, end: w.end / factor }));
    }
    const length = seconds(mp3);
    timing.push({ line: i, text: lines[i], start: +at.toFixed(3), end: +(at + length).toFixed(3), words: words.map((w) => ({ ...w, start: +(w.start + at).toFixed(3), end: +(w.end + at).toFixed(3) })) });
    at += length + GAP;
    parts.push(mp3, join(dir, "gap.wav"));
  });
  const inputs = parts.flatMap((p) => ["-i", p]);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${parts.map((_, i) => `[${i}:a]`).join("")}concat=n=${parts.length}:v=0:a=1[a]`, "-map", "[a]", "-ar", "44100", "-b:a", "192k", join(job, "voice.mp3")]);
  writeFileSync(join(job, "timing.json"), JSON.stringify(timing, null, 1));
  log(`voice: voice.mp3 ${at.toFixed(1)}s, ${timing.length} lines`);
  return timing;
}

function silence(length) {
  const n = Math.round(length * 44100);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.loadEnvFile(join(root, ".env"));
  const [linesPath, channelId = "haleemrafat"] = process.argv.slice(2);
  if (!linesPath) throw new Error("usage: node reels/voice.mjs <job>/lines.json [channel-id]");
  const channel = JSON.parse(readFileSync(join(root, "config/channels.json"), "utf8"))[channelId];
  await voiceLines(dirname(linesPath), JSON.parse(readFileSync(linesPath, "utf8")), channel?.narrator ?? { voice: "Charon" }, { language: channel?.language ?? "ar" });
}
