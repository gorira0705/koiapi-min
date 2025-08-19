// path: api/analyze.js

export default async function handler(req, res) {
  // --- CORS（簡易）---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ source: 'mock', error: 'OPENAI_API_KEY is missing' });
  }

  // 受け取り（空でも動く）
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString() || '{}';
  let body = {};
  try { body = JSON.parse(raw); } catch {}

  const {
    sessionName = '診断',
    chatLog = '',
    source = '',
    relation = '',
    goal = '',
    extraInfo = '',
    speakerGender = 'neutral', // 'male' | 'female' | 'neutral'
  } = body;

  // -------- OpenAI 呼び出し（Responses API）---------
  const OPENAI_URL = 'https://api.openai.com/v1/responses';
  const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  // “出力JSONの型”を絶対守らせるため、形をサンプルで固定
  const schemaExample = {
    categories: ["共感力","質問力","話題展開","柔軟性","テンポ"],
    scores: [3.9,3.5,3.8,3.2,3.7],
    comments: {
      "共感力": "…",
      "質問力": "…",
      "話題展開": "…",
      "柔軟性": "…",
      "テンポ": "…"
    },
    freeSummary: "…",
    myMBTI: "INFP",
    myMbtiLongText: "…",
    partnerMBTI: "ENFJ",
    compatibilityText: "…",
    compatibilityAxes: ["価値観整合","会話の相性","感情共有","未来志向","距離感調整"],
    compatibilityScores: [4.1,3.8,3.9,3.7,3.6],
    compatibilityReasons: {
      "価値観整合": "…",
      "会話の相性": "…",
      "感情共有": "…",
      "未来志向": "…",
      "距離感調整": "…"
    },
    detailedAdvice: {
      "共感力":[{"action":"…","effect":"…","example":"…"}],
      "質問力":[{"action":"…","effect":"…","example":"…"}],
      "話題展開":[{"action":"…","effect":"…","example":"…"}],
      "柔軟性":[{"action":"…","effect":"…","example":"…"}],
      "テンポ":[{"action":"…","effect":"…","example":"…"}]
    },
    partnerProfile: {
      greenLines: ["…"],
      redLines: ["…"],
      goodPhrases: ["…"],
      badPhrases: ["…"],
      contactStyle: "…",
      dateTips: "…",
      conflictPattern: "…",
      reconcileTips: "…",
      progression: "…"
    }
  };

  const instructions = `
あなたは恋愛チャット診断のアナリスト。以下の会話ログから診断を生成します。
- 出力は「日本語」。必ず **1個のJSONオブジェクトのみ** を返す（前後の説明文やコードブロックは禁止）
- 口調は中庸だが、診断対象者が「${speakerGender}」なら相手に合わせて語尾・配慮のニュアンスを軽く寄せる
- 文量は各フィールドを簡潔に、けれど薄くならない程度（以前のモック相当）
- スコアは 1.0〜5.0、少数1桁
- フィールド構成はこの例と全く同じキー・型で出す（順不問）:
${JSON.stringify(schemaExample, null, 2)}
`;

  const userInput = `
[セッション名] ${sessionName}
[出会い方] ${source}
[関係性] ${relation}
[ゴール] ${goal}
[補足] ${extraInfo}
[チャットログ]
${chatLog}
`;

  const payload = {
    model: MODEL,
    // Responses API の正しい指定：response_format ではなくこちら
    modalities: ["text"],
    text: { format: "json_object" },
    temperature: 0.3,
    max_output_tokens: 2200,
    // system 的な指示
    instructions,
    // ユーザー入力
    input: userInput
  };

  try {
    const ai = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!ai.ok) {
      const errText = await ai.text().catch(()=>'');
      throw new Error(`OpenAI ${ai.status}: ${errText}`);
    }

    const data = await ai.json();

    // Responses API の取り出し（text.format=json_object）
    let txt = '';
    if (typeof data.output_text === 'string') {
      txt = data.output_text;
    } else if (Array.isArray(data.output)) {
      txt = data.output
        .flatMap(o => Array.isArray(o.content) ? o.content : [])
        .filter(c => c.type === 'output_text' || c.type === 'text' || c.text)
        .map(c => c.output_text || c.text || '')
        .join('\n');
    }
    if (!txt) throw new Error('parse_failed: empty output');

    let parsed;
    try { parsed = JSON.parse(txt); }
    catch { throw new Error('parse_failed: invalid JSON'); }

    // フロントが期待する形で返す
    return res.status(200).json({ source: 'openai', result: parsed });

  } catch (e) {
    // 失敗時はモックにフォールバック（落とさない）
    const mock = mockResult();
    return res.status(200).json({
      source: 'mock',
      error: String(e?.message || e),
      result: mock
    });
  }
}

// ---- 既存の軽量モック（必要なら調整可）----
function mockResult() {
  return {
    categories: ["共感力","質問力","話題展開","柔軟性","テンポ"],
    scores: [4.2,3.6,4.1,3.2,4.4],
    comments: {
      "共感力":"相手の感情を要約＋感情ラベリングで受け止められています。",
      "質問力":"Why/How を1発足すと深度が上がります。",
      "話題展開":"自己開示→橋渡しが自然です。",
      "柔軟性":"文量を相手に寄せるとさらに◎。",
      "テンポ":"既読後の2段運用がGood。"
    },
    freeSummary:"総括：安心して話せる人…",
    myMBTI:"INFP",
    myMbtiLongText:"…",
    partnerMBTI:"ENFJ",
    compatibilityText:"…",
    compatibilityAxes:["価値観整合","会話の相性","感情共有","未来志向","距離感調整"],
    compatibilityScores:[4.5,3.8,4.2,4.0,3.9],
    compatibilityReasons:{
      "価値観整合":"…",
      "会話の相性":"…",
      "感情共有":"…",
      "未来志向":"…",
      "距離感調整":"…"
    },
    detailedAdvice:{
      "共感力":[{"action":"要約＋感情で返す","effect":"…","example":"…"}],
      "質問力":[{"action":"Why/Howを1発","effect":"…","example":"…"}],
      "話題展開":[{"action":"ミニ体験→橋渡し","effect":"…","example":"…"}],
      "柔軟性":[{"action":"文量合わせ","effect":"…","example":"…"}],
      "テンポ":[{"action":"既読→本返信","effect":"…","example":"…"}]
    },
    partnerProfile:{
      greenLines:["…"], redLines:["…"],
      goodPhrases:["…"], badPhrases:["…"],
      contactStyle:"…", dateTips:"…",
      conflictPattern:"…", reconcileTips:"…",
      progression:"…"
    }
  };
}
