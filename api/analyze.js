// Minimal analyze endpoint (ダミー応答。まずは通ることが目的)
export default async function handler(req, res) {
  // CORS（モバイルなら不要だが一応付与）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 受け取ったJSONは今回は未使用（将来OpenAIに投げる）
  const chunks = []; for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString() || '{}';
  let input = {}; try { input = JSON.parse(raw); } catch (_) {}

  const result = {
    categories: ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"],
    scores:     [4.2, 3.6, 4.1, 3.2, 4.4],
    comments: {
      "共感力": "要約＋感情ラベリングが自然。",
      "質問力": "Why/Howが少なめ。1発で深さUP。",
      "話題展開": "自己開示→橋渡しが上手。",
      "柔軟性": "文量を相手に寄せると◎。",
      "テンポ": "既読後の2段運用がGood。"
    },
    freeSummary: "“安心して話せる人”。Why質問1発・言い換え→質問・軽い提案で伸びる。",
    myMBTI: "INFP",
    myMbtiLongText: "価値観軸で丁寧。短リアクション→本返信の2段運用が合う。",
    partnerMBTI: "ENFJ",
    compatibilityText: "理想と配慮が融合。小さい本音共有がカギ。",
    compatibilityAxes: ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"],
    compatibilityScores: [4.5, 3.8, 4.2, 4.0, 3.9],
    compatibilityReasons: {
      "価値観整合": "方向性が近く協力関係が築きやすい。"
    },
    detailedAdvice: {}, // 空でもOK（UIは耐える）
    partnerProfile: {
      greenLines: ["感情の言語化", "具体的な称賛", "小さな共同作業"],
      redLines: ["放置の連続", "皮肉の強い冗談"],
      goodPhrases: ["「きっかけは？」", "「それ良いと思う、特に○○」"],
      badPhrases: ["「普通はさ…」"],
      contactStyle: "短いやり取りの継続で安心感。",
      dateTips: "写真映え＋静けさ。60〜90分の軽設計。",
      conflictPattern: "配慮不足の一言で発火。",
      reconcileTips: "事実→意図→感情→今後の順で短く。",
      progression: "次の提案で小さく前進。"
    }
  };

  res.status(200).json({ result });
}
