// path: api/analyze.js
export const config = { runtime: 'nodejs20.x' };  // ★ 追加

import OpenAI from "openai";
// …（以下は今のままでOK）


/** ─────────────────────────────────────────────────────────────────
 * CORS（Flutterエミュ・端末どちらでもアクセスOKに）
 * ───────────────────────────────────────────────────────────────── */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 45_000; // Vercel関数の実行制限内で余裕を持たせる

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // 1) リクエスト受け取り
  const body = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
  const {
    sessionName = "",
    chatLog = "",
    source = "",
    relation = "",
    goal = "",
    extraInfo = "",
    speakerGender = "neutral" // "male" | "female" | "neutral"
  } = body;

  // 2) 開発用: APIキーなしならモック即返し（落ちない運用）
  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json(buildMockResult());
  }

  // 3) OpenAI 呼び出し準備
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 文字量が多すぎて落ちないよう最後の方を優先して切る
  const clippedChat = clip(String(chatLog), 8000);

  // システムプロンプト（JSONのみを返させる）
  const system = [
    "あなたは『恋Chart』の分析エンジンです。",
    "ユーザーが貼った会話ログとメタ情報から、会話スキル・相性・具体アドバイスを出力します。",
    "絶対条件: **有効な JSON のみ** を返すこと。JSON以外の文字は一切出力しないこと。",
    "日本語で、以下のスキーマに**完全準拠**して埋めること。",
    "",
    "型（TypeScript相当）:",
    "type AdviceItem = { action: string; effect: string; example: string };",
    "type PartnerProfile = {",
    "  greenLines: string[]; redLines: string[]; goodPhrases: string[]; badPhrases: string[];",
    "  contactStyle: string; dateTips: string; conflictPattern: string; reconcileTips: string; progression: string;",
    "};",
    "type Result = {",
    "  categories: string[]; // 例: [\"共感力\",\"質問力\",\"話題展開\",\"柔軟性\",\"テンポ\"]",
    "  scores: number[];     // categories と同じ長さ、各1..5",
    "  comments: Record<string, string>;",
    "  freeSummary: string;",
    "  myMBTI: string; myMbtiLongText: string; partnerMBTI: string;",
    "  compatibilityText: string;",
    "  compatibilityAxes: string[]; // 5軸想定",
    "  compatibilityScores: number[]; // compatibilityAxes と同じ長さ、各1..5",
    "  compatibilityReasons: Record<string, string>;",
    "  detailedAdvice: Record<string, AdviceItem[]>; // キーはスキル名",
    "  partnerProfile: PartnerProfile;",
    "};",
    "",
    "厳守:",
    "- JSON 以外の文字を一切出力しない（前後のテキスト・```・説明文も禁止）。",
    "- scores の配列長は categories と一致させる。",
    "- compatibilityScores の配列長は compatibilityAxes と一致させる。",
    "- 例文は自然で短すぎず、すぐ使える日本語にする。",
    "- 口調: 中性的で読みやすい丁寧体。依頼がある場合は依頼の性別にわずかに寄せる。",
  ].join("\n");

  const user = [
    `# セッション名: ${sessionName || "(未指定)"}`,
    `# 診断者の性別: ${speakerGender}  // male|female|neutral`,
    `# 出会い方: ${source}`,
    `# 関係性: ${relation}`,
    `# ゴール: ${goal}`,
    `# 補足: ${extraInfo}`,
    "",
    "# 会話ログ（最近のやりとりが下ほど新しい想定。絵文字やスタンプも可）",
    clippedChat,
    "",
    "出力は JSON のみ。前書き・後書き・説明は不要。"
  ].join("\n");

  try {
    // 4) モデル呼び出し（タイムアウト保護）
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    }, { signal: ac.signal });

    clearTimeout(t);

    const text = resp?.choices?.[0]?.message?.content?.trim() || "";
    const json = safeParse(text);

    // 最低限のバリデーション（壊れたら即モック）
    if (!isValidResult(json)) {
      return res.status(200).json(buildMockResult());
    }

    return res.status(200).json(json);
  } catch (err) {
    // タイムアウト・APIエラー時もモック返却（アプリを止めない）
    return res.status(200).json(buildMockResult());
  }
}

/* ───────────────── ユーティリティ ───────────────── */

function clip(s, max) {
  if (!s) return "";
  const str = String(s);
  if (str.length <= max) return str;
  return str.slice(-max); // 末尾優先
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

function isValidResult(obj) {
  if (!obj || typeof obj !== "object") return false;
  const a = Array.isArray;
  if (!a(obj.categories) || !a(obj.scores)) return false;
  if (obj.categories.length === 0 || obj.scores.length !== obj.categories.length) return false;
  if (!a(obj.compatibilityAxes) || !a(obj.compatibilityScores)) return false;
  if (obj.compatibilityAxes.length === 0 || obj.compatibilityScores.length !== obj.compatibilityAxes.length) return false;
  return true;
}

// クライアントの型に合うモック（落ちないための保険）
function buildMockResult() {
  return {
    categories: ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"],
    scores: [4.2, 3.6, 4.1, 3.2, 4.4],
    comments: {
      "共感力": "相手の感情の背景を汲み取り、言い換えで返せています。",
      "質問力": "Why/How の一言が入ると深さが増します。",
      "話題展開": "自己開示→橋渡しの流れが上手です。",
      "柔軟性": "文量を相手に合わせるだけで柔らかく見えます。",
      "テンポ": "既読後の再開が丁寧で好印象。"
    },
    freeSummary: "総合的に“安心して話せる人”。Why 質問を1発入れると伸びます。",
    myMBTI: "INFP",
    myMbtiLongText: "価値観軸で丁寧に関わるタイプ。短いリアクション→本返信の二段構えが合う。",
    partnerMBTI: "ENFJ",
    compatibilityText: "理想と配慮が融合する相性。小さな本音を早めに共有すると強みが最大化。",
    compatibilityAxes: ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"],
    compatibilityScores: [4.5, 3.8, 4.2, 4.0, 3.9],
    compatibilityReasons: {
      "価値観整合": "理念×調和で協力関係が築きやすい。",
      "会話の相性": "丁寧×まとめ役で熱量が噛み合う。",
      "感情共有": "安心安全を双方が重視。",
      "未来志向": "意味と実装力の橋渡しが得意。",
      "距離感調整": "希望の伝え合いが調整弁になる。"
    },
    detailedAdvice: {
      "共感力": [
        { action: "要約＋感情ラベリング", effect: "伝わっている感が増す", example: "「それって不安もあったよね」" }
      ],
      "質問力": [
        { action: "Why/How を1発", effect: "語りの深さUP", example: "「どうしてそう思った？」" }
      ]
    },
    partnerProfile: {
      greenLines: ["感情の言語化", "具体的な称賛", "小さな共同作業"],
      redLines: ["理由不明の既読スルー", "皮肉が強い冗談", "曖昧な約束"],
      goodPhrases: ["「きっかけはあった？」", "「そこが特にいいね」"],
      badPhrases: ["「普通こうでしょ？」", "「大したことないよ」"],
      contactStyle: "短いやり取りを重ねると安心感が増す。",
      dateTips: "写真映え＋静けさの両立。初回は軽め設計。",
      conflictPattern: "配慮不足の一言が発火点になりやすい。",
      reconcileTips: "事実→意図→感情→今後で短く整理。",
      progression: "次の小さな関門を置くと前進しやすい。"
    }
  };
}
