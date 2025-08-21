// path: api/analyze.js
// Vercel Serverless Function (Node.js 20/22)
// 必要環境変数: OPENAI_API_KEY

const FIXED_CATEGORIES = ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"];
const FIXED_AXES = ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"];

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS");
}

const systemPrompt = `
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
- detailedAdvice は **全ての categories キー**（上記5つ）を必ず持ち、各配列に **最低3件**入れる（{ "action": "...", "effect": "...", "example": "..." }）。
- 例文はLINEメッセージとして違和感がない一文にする（絵文字は多用しない）。

文字量の目安（厳守）:
- comments：各120〜170字
- freeSummary：280〜360字
- myMbtiLongText：280〜380字
- compatibilityText：260〜360字
- compatibilityReasons：各150〜220字
- detailedAdvice：各カテゴリに**3件**（action 12〜20字／effect 40〜80字／example 40〜80字）
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
    "共感力": [ { "action": "...", "effect": "...", "example": "..." }, ...(計3件) ],
    "質問力": [ ...(計3件) ],
    "話題展開": [ ...(計3件) ],
    "柔軟性": [ ...(計3件) ],
    "テンポ": [ ...(計3件) ]
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

module.exports = async (req, res) => {
  setCors(res);

  // プリフライト
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // HEAD（生存確認用）
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  // GET（ブラウザ直叩き確認用）
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      endpoint: "/api/analyze",
      method: "GET",
      note: "Use POST with JSON body { chatLog, ... } to analyze.",
      time: new Date().toISOString(),
    });
    return;
  }

  // 本番：POST
  if (req.method === "POST") {
    try {
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
        res.status(500).json({ error: "OPENAI_API_KEY is not set" });
        return;
      }
      if (!chatLog || typeof chatLog !== "string") {
        res.status(400).json({ error: "chatLog is required (string)" });
        return;
      }

      const bounded = boundText(chatLog, 6000);
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

      // OpenAI Responses API を素の fetch で呼ぶ（Node20+は fetch 標準対応）
      const oai = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_output_tokens: 2200,
        }),
      });

      if (!oai.ok) {
        const text = await oai.text();
        res.status(500).json({ error: `OpenAI error: ${text}` });
        return;
      }

      const data = await oai.json();
      const text =
        (data.output_text && String(data.output_text).trim()) ||
        extractFirstText(data) ||
        "";

      if (!text) {
        res.status(502).json({ error: "Empty response from OpenAI" });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const recovered = tryExtractJson(text);
        if (!recovered) {
          res.status(502).json({ error: "Failed to parse JSON", raw: text });
          return;
        }
        parsed = recovered;
      }

      // 最小バリデーション
      if (
        !Array.isArray(parsed.categories) ||
        FIXED_CATEGORIES.some((n, i) => parsed.categories[i] !== n) ||
        !Array.isArray(parsed.compatibilityAxes) ||
        FIXED_AXES.some((n, i) => parsed.compatibilityAxes[i] !== n)
      ) {
        res.status(502).json({
          error: "Schema mismatch (categories/axes order invalid)",
          got: {
            categories: parsed.categories,
            compatibilityAxes: parsed.compatibilityAxes,
          },
        });
        return;
      }

      res.status(200).json({ source: "openai", result: parsed });
      return;
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
      return;
    }
  }

  // それ以外
  res.setHeader("Allow", "GET,POST,HEAD,OPTIONS");
  res.status(405).json({ error: "Method Not Allowed" });
};

// ─────────────── helpers ───────────────
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function boundText(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.2));
  return `${head}\n…(中略)…\n${tail}`;
}
function extractFirstText(resp) {
  try {
    const block = resp.output?.[0];
    const item = block?.content?.find?.((c) => c.type === "output_text");
    return item?.text ?? null;
  } catch { return null; }
}
function tryExtractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
