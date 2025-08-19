// Vercel Node.js Serverless Function (CommonJS)
// POST /api/analyze
// - 期待: Flutter から { sessionName, chatLog, source, relation, goal, extraInfo, speakerGender } が飛んでくる
// - 応答: { result: DiagnosisResult-like JSON, source: 'openai'|'mock' }

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4o-mini"; // 指定どおり。文字量/コストのバランスが良い

// CORS と共通レスポンスヘッダ
function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Flutter 側が失敗時にモックへフォールバックできるよう、ここでも保険として超簡易モックを返せるようにしておく
function mockResult() {
  return {
    categories: ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"],
    scores: [4.1, 3.7, 4.0, 3.3, 4.2],
    comments: {
      "共感力": "相手の感情を要約＋感情ラベリングで受け止められています。",
      "質問力": "Why/How を1発足すと深度が上がります。",
      "話題展開": "自己開示→橋渡しが自然です。",
      "柔軟性": "文量を相手に寄せるとさらに◎。",
      "テンポ": "放置感のないテンポです。"
    },
    freeSummary:
      "総合的に“安心して話せる人”。Why質問を1回だけ挟み、短い言い換え→質問の順で熱量を維持しましょう。",
    myMBTI: "INFP",
    myMbtiLongText:
      "価値観と優しさを軸に関わるタイプ。短いリアクション→本返信の2段運用が合います。",
    partnerMBTI: "ENFJ",
    compatibilityText:
      "理念と配慮がかみ合う相性。過剰な気遣いを防ぐため小さな本音共有を早めに。",
    compatibilityAxes: ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"],
    compatibilityScores: [4.5, 3.8, 4.1, 4.0, 3.9],
    compatibilityReasons: {
      "価値観整合": "重視する軸が近いので協力関係が築きやすい。",
      "会話の相性": "丁寧さとまとめ役が相補的。",
      "感情共有": "安心安全の空気感を双方が重視。",
      "未来志向": "理想と実装の橋渡しができる。",
      "距離感調整": "希望の定期共有が調整弁に。"
    },
    detailedAdvice: {
      "共感力": [
        { action: "要約＋感情で返す", effect: "自己開示が続きやすい", example: "「それ、不安もあったよね。」" }
      ],
      "質問力": [
        { action: "Why/Howを1発", effect: "深掘りになる", example: "「どうしてそう思った？」" }
      ]
    },
    partnerProfile: {
      greenLines: ["具体称賛", "小さな共同作業"],
      redLines: ["理由不明の放置", "皮肉強めの冗談"],
      goodPhrases: ["「その選択いいね。特に○○が」"],
      badPhrases: ["「普通こうでしょ？」"],
      contactStyle: "短いやり取りが安心感につながる。",
      dateTips: "静かに話せる場所＋写真映えの両立が◎。",
      conflictPattern: "配慮不足に見える一言が発火点。",
      reconcileTips: "事実→意図→感情→今後の順で短く。",
      progression: "次の小さなアクションを合意して前進。"
    }
  };
}

// JSON Schema（DiagnosisResult 互換。可変キーを含むところは additionalProperties を許可）
const schema = {
  name: "DiagnosisResultSchema",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      categories: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
      scores: { type: "array", minItems: 5, maxItems: 8, items: { type: "number" } },
      comments: { type: "object", additionalProperties: { type: "string" } },
      freeSummary: { type: "string" },
      myMBTI: { type: "string" },
      myMbtiLongText: { type: "string" },
      partnerMBTI: { type: "string" },
      compatibilityText: { type: "string" },
      compatibilityAxes: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
      compatibilityScores: { type: "array", minItems: 5, maxItems: 8, items: { type: "number" } },
      compatibilityReasons: { type: "object", additionalProperties: { type: "string" } },
      detailedAdvice: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string" },
              effect: { type: "string" },
              example: { type: "string" }
            },
            required: ["action", "effect", "example"]
          }
        }
      },
      partnerProfile: {
        type: "object",
        additionalProperties: false,
        properties: {
          greenLines: { type: "array", items: { type: "string" } },
          redLines: { type: "array", items: { type: "string" } },
          goodPhrases: { type: "array", items: { type: "string" } },
          badPhrases: { type: "array", items: { type: "string" } },
          contactStyle: { type: "string" },
          dateTips: { type: "string" },
          conflictPattern: { type: "string" },
          reconcileTips: { type: "string" },
          progression: { type: "string" }
        },
        required: [
          "greenLines","redLines","goodPhrases","badPhrases",
          "contactStyle","dateTips","conflictPattern","reconcileTips","progression"
        ]
      }
    },
    required: [
      "categories","scores","comments","freeSummary",
      "myMBTI","myMbtiLongText","partnerMBTI",
      "compatibilityText","compatibilityAxes","compatibilityScores","compatibilityReasons",
      "detailedAdvice","partnerProfile"
    ]
  }
};

module.exports = async (req, res) => {
  setHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // 受け取り
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const {
    sessionName = "診断",
    chatLog = "",
    source = "",
    relation = "",
    goal = "",
    extraInfo = "",
    speakerGender = "neutral"
  } = body;

  // 口調の微調整（中性ベース＋“うっすら反対性別に寄せる”）
  const toneHint =
    speakerGender === "male"
      ? "相手が女性に伝わりやすい柔らかいニュアンスをうっすら混ぜる"
      : speakerGender === "female"
      ? "相手が男性に伝わりやすい率直さをうっすら混ぜる"
      : "どの性別にも自然な中立トーンを保つ";

  // プロンプト（日本語・JSON厳格）
  const systemPrompt = [
    "あなたは日本語の会話分析の専門家です。",
    "入力されたLINE等の会話ログとメタ情報から、会話スキルと相性を評価し、",
    "必ず与えられた JSON Schema に厳密準拠した JSON を返してください。",
    `口調は中性を基本に、${toneHint}。`,
    "具体的・短文中心で、コピペして使える例文を含めます。",
    "MBTIは仮説として簡潔に。レーダー配列は 1..5 の範囲で。"
  ].join("\n");

  const userPrompt = [
    `【セッション名】${sessionName}`,
    `【出会い方】${source}`,
    `【関係性】${relation}`,
    `【ゴール】${goal}`,
    `【補足】${extraInfo}`,
    "――――――――――――――",
    "【会話ログ（そのまま）】",
    chatLog || "(未入力)"
  ].join("\n");

  // OpenAI 呼び出し（Responses API + Structured Outputs）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // 25s で中断

  try {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_schema", json_schema: schema },
        max_output_tokens: 1800
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    const data = await resp.json();

    if (!resp.ok) {
      // OpenAI 側の失敗（キー不備・レートなど）→ モック返し
      return res.status(200).json({
        result: mockResult(),
        source: "mock",
        error: `${resp.status}:${data.error?.message || "OpenAI error"}`
      });
    }

    // Responses API の取り出し方
    // SDK 相当の output_text が付く場合と、content[].text の場合がある
    const text =
      data.output_text ??
      (Array.isArray(data.output) &&
        data.output[0] &&
        Array.isArray(data.output[0].content) &&
        data.output[0].content.find(c => c.type === "output_text")?.text) ??
      (Array.isArray(data.output) &&
        data.output[0] &&
        Array.isArray(data.output[0].content) &&
        data.output[0].content[0]?.text) ??
      "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 稀に前後に説明文が混ざるケースの保険（```json ... ``` の除去など）
      const m = text.match(/\{[\s\S]*\}$/);
      parsed = m ? JSON.parse(m[0]) : null;
    }

    if (!parsed) {
      // パース不能でもアプリが落ちないようモック返し
      return res.status(200).json({
        result: mockResult(),
        source: "mock",
        error: "parse_failed"
      });
    }

    return res.status(200).json({ result: parsed, source: "openai" });
  } catch (e) {
    clearTimeout(timer);
    // タイムアウト/ネットワークでも壊れない
    return res.status(200).json({
      result: mockResult(),
      source: "mock",
      error: String(e).slice(0, 1800)
    });
  }
};
