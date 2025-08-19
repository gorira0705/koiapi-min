// path: api/analyze.js
export default async function handler(req, res) {
  // --- CORS（公開前提なら * でOK／必要なら自分のドメインへ絞る）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // --- 入力受け取り
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString() || '{}';

  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const {
    sessionName = '診断',
    chatLog = '',
    source = '',
    relation = '',
    goal = '',
    extraInfo = '',
    speakerGender = 'neutral', // 'male' | 'female' | 'neutral'
  } = input;

  // --- 安全装置（最低限の入力が空ならモック返し）
  if (!chatLog.trim()) {
    return res.status(200).json({ source: 'mock', result: mockResult() });
  }

  // --- OpenAI 呼び出し（Chat Completions）
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: OPENAI_API_KEY not set.' });
  }

  // 口調ポリシー
  const tone =
    speakerGender === 'male'
      ? '語り口は中性的だが、相手（想定読者）は女性寄りを意識して、丁寧で優しい。'
      : speakerGender === 'female'
      ? '語り口は中性的だが、相手（想定読者）は男性寄りを意識して、端的で分かりやすい。'
      : '語り口は中性的でフラット。丁寧で読みやすい文体。';

  const system = `
あなたは会話ログから恋愛の相性と会話スキルを分析するアシスタントです。
出力は必ず日本語の **JSON オブジェクト** 1つだけ。プレーンテキストや説明は絶対に含めない。
数値は 1.0〜5.0 の小数1桁。配列の長さやキー名はスキーマ通りに。
${tone}

スキーマ:
{
  "categories": [5項目名],
  "scores": [5つの数値],
  "comments": { "<各カテゴリ>": "<短評100字以内>" },
  "freeSummary": "<全体総括 200〜280字>",
  "myMBTI": "<4文字>",
  "myMbtiLongText": "<180〜260字>",
  "partnerMBTI": "<4文字>",
  "compatibilityText": "<相性総括 180〜260字>",
  "compatibilityAxes": [5軸名],
  "compatibilityScores": [5つの数値],
  "compatibilityReasons": { "<各軸>": "<根拠 120〜180字>" },
  "detailedAdvice": {
    "<カテゴリ>": [
      { "action": "...", "effect": "...", "example": "..." },
      { "action": "...", "effect": "...", "example": "..." }
    ]
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

  const user = `
[メタ情報]
診断名: ${sessionName}
出会い方: ${source}
関係性: ${relation}
目標: ${goal}

[補足]
${extraInfo}

[会話ログ（そのまま解析可）]
${chatLog}
`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',         // Chat Completions で利用可
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        // JSONを強制（Chat Completionsでサポートされる方式）
        response_format: { type: 'json_object' },
        // 返答が長くなりすぎない程度の上限
        max_tokens: 1600,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ source: 'openai', error: `OpenAI ${r.status}: ${text}` });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';

    let parsed;
    try { parsed = JSON.parse(content); } catch {
      // JSONになっていない時はモックでフォールバック
      return res.status(200).json({ source: 'fallback-mock', result: mockResult() });
    }
    return res.status(200).json({ source: 'openai', result: parsed });
  } catch (e) {
    return res.status(200).json({ source: 'mock', error: String(e), result: mockResult() });
  }
}

// ---- モック（JSON 形は Flutter の DiagnosisResult に合わせる） ----
function mockResult() {
  return {
    categories: ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"],
    scores: [4.2, 3.6, 4.1, 3.2, 4.4],
    comments: {
      "共感力": "相手の感情の背景を汲み取り、言い換えで返せています。",
      "質問力": "Why/How を1発足すだけで深さが出ます。",
      "話題展開": "自己開示→橋渡しが自然です。",
      "柔軟性": "相手の文量に合わせればさらに◎。",
      "テンポ": "早過ぎず遅過ぎず読みやすいです。"
    },
    freeSummary: "総合的に“安心して話せる人”。…（略）",
    myMBTI: "INFP",
    myMbtiLongText: "あなたは…（略）",
    partnerMBTI: "ENFJ",
    compatibilityText: "理想と配慮が融合する相性…（略）",
    compatibilityAxes: ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"],
    compatibilityScores: [4.5, 3.8, 4.2, 4.0, 3.9],
    compatibilityReasons: {
      "価値観整合": "方向性が近い…（略）",
      "会話の相性": "温かいまとめ役…（略）",
      "感情共有": "安心安全…（略）",
      "未来志向": "理想と現実の橋渡し…（略）",
      "距離感調整": "ペース配分…（略）"
    },
    detailedAdvice: {
      "共感力": [
        { "action": "要約＋感情ラベリング", "effect": "伝わり感↑", "example": "「それって…わかる」" },
        { "action": "事実→感情→希望", "effect": "前向きな共同感", "example": "「忙しかったね…今週は軽めに」" }
      ]
    },
    partnerProfile: {
      "greenLines": ["感情の言語化", "具体的称賛", "小さな共同作業"],
      "redLines": ["理由なき既読スルー", "皮肉強めの冗談"],
      "goodPhrases": ["「そう思った理由は？」", "「特に○○が良い」"],
      "badPhrases": ["「普通はこう」", "「大したことないでしょ」"],
      "contactStyle": "短いやり取りで安心感。遅れた時は端的に理由を。",
      "dateTips": "写真映え＋静けさ。初回は60〜90分で余韻を残す。",
      "conflictPattern": "配慮不足の一言が火種。真意確認が鍵。",
      "reconcileTips": "事実→意図→感情→今後で短く整理。",
      "progression": "次の小さな約束を置いて前進。"
    }
  };
}
