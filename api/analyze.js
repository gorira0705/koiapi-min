// Vercel Serverless Function (Node.js)
// 必要環境変数: OPENAI_API_KEY
// 依存: "openai": "^4.58.1" など v4 系

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 固定カテゴリ・相性軸（アプリ側UIと一致）
const FIXED_CATEGORIES = ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"];
const FIXED_AXES = ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"];

// CORS
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// 簡易レートリミット（サーバレスでの温存期間内のみ有効）
const BUCKET = new Map(); // ip -> [timestamps]
const WINDOW_MS = 60 * 1000; // 60s
const MAX_PER_WINDOW = 6;

function tooMany(ip) {
  const now = Date.now();
  const arr = BUCKET.get(ip) || [];
  const kept = arr.filter((t) => now - t < WINDOW_MS);
  kept.push(now);
  BUCKET.set(ip, kept);
  return kept.length > MAX_PER_WINDOW;
}

// 長文を前後サンドで上限内に収める
function boundText(text, max) {
  if (!text || text.length <= max) return text || "";
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.25));
  return `${head}\n…(中略)…\n${tail}`;
}

const system = `
あなたは会話ログから恋愛の相性と会話スキルを分析するアシスタントです。
出力は必ず **日本語のJSONオブジェクト1つだけ**。プレーンテキストや説明は一切入れない。
数値は 1.0〜5.0 の小数1桁。配列とキー名はスキーマ通り。

語り口:
- 基本は中性的で丁寧・読みやすい。
- 入力の speakerGender が "male" なら、結果の相手（読者）を女性寄りに想定して、やや柔らかめ・ポジティブ提示を増やす。
- "female" なら、相手（読者）を男性寄りに想定して、端的・結論先出し・実務的アドバイスを少し増やす。
- "neutral" は完全に中性。

厳守ルール:
- categories は次の**固定名**をこの順番で使う: ${FIXED_CATEGORIES.join(", ")}
- compatibilityAxes も次の**固定名**をこの順番で使う: ${FIXED_AXES.join(", ")}
- detailedAdvice は **全ての categories キー**（上記5つ）を必ず持ち、各配列に **最低3件**入れる
  （{ "action": "...", "effect": "...", "example": "..." } の形）。
- 例文はLINEメッセージとして違和感がない一文にする（絵文字は多用しない）。

文字量の目安（厳守）:
- comments：各120〜170字
- freeSummary：280〜360字
- myMbtiLongText：280〜380字
- compatibilityText：260〜360字
- compatibilityReasons：各150〜220字
- detailedAdvice：各カテゴリに**3件**
  - action 12〜20字／effect 40〜80字／example 40〜80字
- partnerProfile：
  - greenLines 4〜6件（各18〜28字）／redLines 3〜5件（各18〜28字）
  - goodPhrases・badPhrases 各3〜5件（10〜24字）
  - contactStyle／dateTips／conflictPattern／reconcileTips／progression 各160〜220字

スキーマ:
{
  "categories": ["共感力","質問力","話題展開","柔軟性","テンポ"],
  "scores": [5つの数値],
  "comments": { "<各カテゴリ>": "<短評>" },
  "freeSummary": "<全体総括>",
  "myMBTI": "<4文字>",
  "myMbtiLongText": "<説明>",
  "partnerMBTI": "<4文字>",
  "compatibilityText": "<相性総括>",
  "compatibilityAxes": ["価値観整合","会話の相性","感情共有","未来志向","距離感調整"],
  "compatibilityScores": [5つの数値],
  "compatibilityReasons": { "<各軸>": "<理由>" },
  "detailedAdvice": {
    "共感力": [ { "action": "...", "effect": "...", "example": "..." }, ... (計3件) ],
    "質問力": [ ...3件 ],
    "話題展開": [ ...3件 ],
    "柔軟性": [ ...3件 ],
    "テンポ": [ ...3件 ]
  },
  "partnerProfile": {
    "greenLines": ["...", "..."],
    "redLines": ["...", "..."],
    "goodPhrases": ["...", "..."],
    "badPhrases": ["...", "..."],
    "contactStyle": "...",
    "dateTips": "...",
    "conflictPattern": "...",
    "reconcileTips": "...",
    "progression": "..."
  }
}
`;

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    if (tooMany(ip)) {
      return res.status(429).json({ error: "Too Many Requests" });
    }

    const body = await readJsonBody(req);
    const {
      sessionName = "",
      chatLog = "",
      source = "",
      relation = "",
      goal = "",
      extraInfo = "",
      speakerGender = "neutral",
    } = body || {};

    if (!chatLog || typeof chatLog !== "string") {
      return res.status(400).json({ error: "chatLog is required (string)" });
    }

    const bounded = boundText(chatLog, 12000);

    const userPrompt = [
      `【入力メタ】`,
      JSON.stringify(
        { sessionName, source, relation, goal, extraInfo, speakerGender },
        null,
        0
      ),
      "",
      "【会話ログ（最新に近い順でOK / 不要な固有名詞は伏せ可）】",
      bounded,
      "",
      "【出力要件】上記スキーマ通りの JSON を厳密に1つだけ返す（プレーンテキスト禁止）。",
    ].join("\n");

    const started = Date.now();

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      max_output_tokens: 3400,
    });

    const text =
      (resp.output_text && resp.output_text.trim()) ||
      extractFirstText(resp) ||
      "";

    if (!text) {
      return res.status(502).json({ error: "Empty response from OpenAI" });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      const recovered = tryExtractJson(text);
      if (!recovered) {
        return res
          .status(502)
          .json({ error: "Failed to parse JSON from OpenAI", raw: text });
      }
      parsed = recovered;
    }

    // 最小バリデーション & 補正
    const fixed = normalizeSchema(parsed);

    // ログ（本文は残さない）
    console.log(
      JSON.stringify({
        event: "analyze_ok",
        ip,
        ms: Date.now() - started,
        inputChars: chatLog.length,
        outKeys: Object.keys(fixed || {}).length,
      })
    );

    return res.status(200).json({ source: "openai", result: fixed });
  } catch (err) {
    const message =
      (err?.response?.data && JSON.stringify(err.response.data)) ||
      err?.message ||
      String(err);
    console.error(JSON.stringify({ event: "analyze_error", message }));
    return res.status(500).json({ error: `OpenAI error: ${message}` });
  }
}

// ──────────────── ヘルパ ────────────────

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function extractFirstText(resp) {
  try {
    const block = resp.output?.[0];
    const item = block?.content?.find?.((c) => c.type === "output_text");
    return item?.text ?? null;
  } catch {
    return null;
  }
}

function tryExtractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampScore(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 3.0;
  return Math.min(5.0, Math.max(1.0, Math.round(n * 10) / 10));
}

function ensureArray(a) {
  return Array.isArray(a) ? a : [];
}

function normalizeSchema(x) {
  const out = {};

  // categories / scores
  out.categories = [...FIXED_CATEGORIES];
  const rawScores = ensureArray(x?.scores);
  out.scores = out.categories.map((_, i) => clampScore(rawScores[i] ?? 3.0));

  // comments
  out.comments = {};
  for (const k of FIXED_CATEGORIES) {
    out.comments[k] =
      typeof x?.comments?.[k] === "string" ? x.comments[k] : "";
  }

  // free texts
  out.freeSummary = typeof x?.freeSummary === "string" ? x.freeSummary : "";
  out.myMBTI = typeof x?.myMBTI === "string" ? x.myMBTI : "";
  out.myMbtiLongText =
    typeof x?.myMbtiLongText === "string" ? x.myMbtiLongText : "";
  out.partnerMBTI =
    typeof x?.partnerMBTI === "string" ? x.partnerMBTI : "";

  // compatibility
  out.compatibilityText =
    typeof x?.compatibilityText === "string" ? x.compatibilityText : "";
  out.compatibilityAxes = [...FIXED_AXES];
  const rawCompat = ensureArray(x?.compatibilityScores);
  out.compatibilityScores = out.compatibilityAxes.map((_, i) =>
    clampScore(rawCompat[i] ?? 3.0)
  );
  out.compatibilityReasons = {};
  for (const k of FIXED_AXES) {
    out.compatibilityReasons[k] =
      typeof x?.compatibilityReasons?.[k] === "string"
        ? x.compatibilityReasons[k]
        : "";
  }

  // detailedAdvice（各カテゴリ 3件以上を期待。足りなければ空配列のままでもUIは崩れない）
  out.detailedAdvice = {};
  for (const k of FIXED_CATEGORIES) {
    const arr = ensureArray(x?.detailedAdvice?.[k])
      .filter(
        (it) =>
          it &&
          typeof it.action === "string" &&
          typeof it.effect === "string" &&
          typeof it.example === "string"
      )
      .slice(0, 10); // 安全
    out.detailedAdvice[k] = arr;
  }

  // partnerProfile
  const pp = x?.partnerProfile || {};
  out.partnerProfile = {
    greenLines: ensureArray(pp.greenLines),
    redLines: ensureArray(pp.redLines),
    goodPhrases: ensureArray(pp.goodPhrases),
    badPhrases: ensureArray(pp.badPhrases),
    contactStyle: typeof pp.contactStyle === "string" ? pp.contactStyle : "",
    dateTips: typeof pp.dateTips === "string" ? pp.dateTips : "",
    conflictPattern:
      typeof pp.conflictPattern === "string" ? pp.conflictPattern : "",
    reconcileTips:
      typeof pp.reconcileTips === "string" ? pp.reconcileTips : "",
    progression: typeof pp.progression === "string" ? pp.progression : "",
  };

  return out;
}
