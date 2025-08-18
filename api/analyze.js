// path: api/analyze.js
// CommonJSにして「export default」問題を避ける安全版＋必ずJSONで返す

module.exports = async (req, res) => {
  // CORS（モバイルは不要だがブラウザ検証用に残す）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // 生ボディを読む（Vercel/Nodeで確実に動く書き方）
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString() || '{}';
    const input = JSON.parse(raw);

    // ---- ここはモック（固定のサンプル結果）----
    const result = {
      categories: ['共感力','質問力','話題展開','柔軟性','テンポ'],
      scores: [4.2,3.6,4.1,3.2,4.4],
      comments: {
        '共感力': '相手の感情の背景を汲み取り、言い換えで返せています。',
        '質問力': 'Why/Howの深掘りが少なめ。1発入れるだけで熱量UP。',
        '話題展開': '自己開示→相手の体験への橋渡しが上手。',
        '柔軟性': '相手のトーンに寄せる反応がやや硬い印象のときがある。',
        'テンポ': '既読後の再開が丁寧で好印象。'
      },
      freeSummary: '総合的に“安心して話せる人”。3点を意識するとさらに伸びます…',
      myMBTI: 'INFP',
      myMbtiLongText: 'あなたは価値観重視で…',
      partnerMBTI: 'ENFJ',
      compatibilityText: '理想と配慮が融合する相性…',
      compatibilityAxes: ['価値観整合','会話の相性','感情共有','未来志向','距離感調整'],
      compatibilityScores: [4.5,3.8,4.2,4.0,3.9],
      compatibilityReasons: {
        '価値観整合': '方向性が近く協力関係が築きやすい。', 
        '会話の相性': '温かいまとめ役と丁寧な探求が噛み合う。', 
        '感情共有': '安心安全の空気を双方が大切にできる。', 
        '未来志向': '理想と現実の橋渡しが得意。', 
        '距離感調整': '定期的な希望の伝え合いが調整弁。'
      },
      detailedAdvice: {},
      partnerProfile: {
        greenLines: ['感情を言語化するやり取り','努力への具体称賛','一緒にを感じる提案'],
        redLines: ['理由不明の既読スルー連続','強い皮肉','曖昧な約束放置'],
        goodPhrases: ['きっかけは？','それ良いと思う（特に○○）','今度いっしょに試す？'],
        badPhrases: ['普通こうしない？','大したことないでしょ？'],
        contactStyle: '短いやり取りを重ねると安心感が増す。',
        dateTips: '写真映え＋静けさの両立。初回は60〜90分。',
        conflictPattern: '配慮不足の一言が発火点。',
        reconcileTips: '事実→意図→感情→今後、短く整理して伝える。',
        progression: '次の小さな関門を置くと自然に前進。'
      }
    };

    return res.status(200).json({ result });
  } catch (e) {
    console.error('analyze error:', e);
    // ← これで Vercel の Functions Logs に原因が出ます
    return res.status(500).json({ error: e?.message || 'Internal Error' });
  }
};
