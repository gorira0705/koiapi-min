// Vercel Serverless Function (Node.js 20/22)
// 必要環境変数: OPENAI_API_KEY
// ※ package.json に "openai": "^4.x" を入れておいてください。

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 固定カテゴリ・相性軸（アプリ側UIと一致させる）
const FIXED_CATEGORIES = ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"];
const FIXED_AXES = ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"];

// 長文化＆安定化した system プロンプト
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
    "greenLines": ["...", "...", "..."],
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

// Node ランタイム（Edge ではない）。Vercel標準の req/res で動く。
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

    // 入力長の安全装置（異常に長いログは先頭・末尾を残して圧縮）
    const bounded = boundText(chatLog, 6000);

    const userPrompt = [
      `【入力メタ】`,
      JSON.stringify(
        {
          sessionName,
          source,
          relation,
          goal,
          extraInfo,
          speakerGender,
        },
        null,
        0
      ),
      "",
      "【会話ログ（最新に近い順でOK / 不要な固有名詞は伏せ可）】",
      bounded,
      "",
      "【出力要件】上記スキーマ通りの JSON を厳密に1つだけ返す（プレーンテキスト禁止）。",
    ].join("\n");

    // ★ Responses API（2024+）。modalities/response_format は使わない。
    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      // 長文を出すための上限。必要に応じて増減可
      max_output_tokens: 2200,
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
      // モデルが余計な前置きを返した場合、JSON 部分だけを抽出して再パース
      const recovered = tryExtractJson(text);
      if (!recovered) {
        return res
          .status(502)
          .json({ error: "Failed to parse JSON from OpenAI", raw: text });
      }
      parsed = recovered;
    }

    // 最小バリデーション（カテゴリ・軸の順序）
    if (
      !Array.isArray(parsed.categories) ||
      FIXED_CATEGORIES.some((n, i) => parsed.categories[i] !== n) ||
      !Array.isArray(parsed.compatibilityAxes) ||
      FIXED_AXES.some((n, i) => parsed.compatibilityAxes[i] !== n)
    ) {
      // 形式ズレはエラー返却（Flutter側がフォールバック表示に切り替える）
      return res.status(502).json({
        error: "Schema mismatch (categories/axes order invalid)",
        got: {
          categories: parsed.categories,
          compatibilityAxes: parsed.compatibilityAxes,
        },
      });
    }

    return res.status(200).json({
      source: "openai",
      result: parsed,
    });
  } catch (err) {
    const message =
      (err?.response?.data && JSON.stringify(err.response.data)) ||
      err?.message ||
      String(err);
    return res.status(500).json({ error: `OpenAI error: ${message}` });
  }
}

// ───────────────────────── ヘルパ ─────────────────────────

// Vercel Node ランタイムで JSON を安定して読む
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  // bodyParser 無効時の保険
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 長文を前後でサンドイッチして上限内に収める
function boundText(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.2));
  return `${head}\n…(中略)…\n${tail}`;
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

// テキストから JSON 部分だけ抽出して parse
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
