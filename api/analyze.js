// Vercel Serverless Function (Node.js 20/22)
// 必要環境変数: OPENAI_API_KEY
// 依存: "openai": "^4.x"

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 固定カテゴリ・相性軸（アプリ側UIと一致）
const FIXED_CATEGORIES = ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"];
const FIXED_AXES = ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"];

// 長文化＆安定化 system（本体）
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
- detailedAdvice：各カテゴリに**3件**。
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

// 短縮ヒント（フォールバック用に追加する）
const shrinkHint = `
※ 出力が長すぎる場合があるため、各セクションの文字数目安をおおよそ20%短縮しつつ、
必ず完全な JSON を返すこと。`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (!chatLog || typeof chatLog !== "string") {
      return res.status(400).json({ error: "chatLog is required (string)" });
    }

    // 入力長の安全装置
    const bounded = boundText(chatLog, 6000);

    // ------- 1回目（通常） -------
    const userPrompt = buildUserPrompt({
      sessionName, source, relation, goal, extraInfo, speakerGender, bounded,
      shrink: false,
    });

    let text = await callOpenAI(userPrompt, /*maxTokens*/ 4500);
    let parsed = safeParseJSON(text);

    // ------- フォールバック（短縮版で再試行） -------
    if (!parsed) {
      const userPrompt2 = buildUserPrompt({
        sessionName, source, relation, goal, extraInfo, speakerGender, bounded,
        shrink: true,
      });
      text = await callOpenAI(userPrompt2, 4500);
      parsed = safeParseJSON(text);
    }

    if (!parsed) {
      return res.status(502).json({ error: "Failed to parse JSON from OpenAI", raw: cut(text, 1400) });
    }

    // 最小バリデーション（カテゴリ・軸の順序）
    if (
      !Array.isArray(parsed.categories) ||
      FIXED_CATEGORIES.some((n, i) => parsed.categories[i] !== n) ||
      !Array.isArray(parsed.compatibilityAxes) ||
      FIXED_AXES.some((n, i) => parsed.compatibilityAxes[i] !== n)
    ) {
      return res.status(502).json({
        error: "Schema mismatch (categories/axes order invalid)",
        got: {
          categories: parsed.categories,
          compatibilityAxes: parsed.compatibilityAxes,
        },
      });
    }

    return res.status(200).json({ source: "openai", result: parsed });
  } catch (err) {
    const message =
      (err?.response?.data && JSON.stringify(err.response.data)) ||
      err?.message ||
      String(err);
    return res.status(500).json({ error: `OpenAI error: ${message}` });
  }
}

// ───────────── ヘルパ ─────────────

function buildUserPrompt({ sessionName, source, relation, goal, extraInfo, speakerGender, bounded, shrink }) {
  const meta = JSON.stringify(
    { sessionName, source, relation, goal, extraInfo, speakerGender },
    null, 0
  );
  return [
    "【入力メタ】",
    meta,
    "",
    "【会話ログ（最新に近い順でOK / 不要な固有名詞は伏せ可）】",
    bounded,
    "",
    "【出力要件】上記スキーマ通りの JSON を厳密に1つだけ返す（プレーンテキスト禁止）。",
    shrink ? shrinkHint : "",
  ].join("\n");
}

// OpenAI呼び出し（JSON出力を強制）
async function callOpenAI(userPrompt, maxTokens) {
  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    text: { format: "json" },   // ★ JSON形式を強制（旧 response_format の代替）
    max_output_tokens: maxTokens, // ★ 出力量を増やして途中切れを防ぐ
  });

  const text =
    (resp.output_text && resp.output_text.trim()) ||
    extractFirstText(resp) ||
    "";
  return text;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// 長文を前後でサンドして上限に収める
function boundText(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.2));
  return `${head}\n…(中略)…\n${tail}`;
}

// 安全パース（余計なテキストがあっても {} を抽出）
function safeParseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function cut(s, n) {
  if (!s) return s;
  return s.length <= n ? s : s.slice(0, n) + "…(truncated)";
}

// Responses API オブジェクトから最初のテキストを拾う保険
function extractFirstText(resp) {
  try {
    const block = resp.output?.[0];
    const item = block?.content?.find?.((c) => c.type === "output_text");
    return item?.text ?? null;
  } catch {
    return null;
  }
}
