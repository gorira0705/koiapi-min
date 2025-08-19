export default async function handler(req, res) {
  // CORS（テストしやすいように）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // ここはダミー（アプリが期待する形式で返す）
  const result = {
    categories: ['共感力','質問力','話題展開','柔軟性','テンポ'],
    scores: [4.2,3.6,4.1,3.2,4.4],
    comments: { '共感力': 'OK' },
    freeSummary: 'ダミーサマリー',
    myMBTI: 'INFP',
    myMbtiLongText: 'ロングテキスト',
    partnerMBTI: 'ENFJ',
    compatibilityText: '相性の総括',
    compatibilityAxes: ['価値観整合','会話の相性','感情共有','未来志向','距離感調整'],
    compatibilityScores: [4.5,3.8,4.2,4.0,3.9],
    compatibilityReasons: { '価値観整合': '理由' },
    detailedAdvice: { '共感力': [{ action:'〜', effect:'〜', example:'〜' }] },
    partnerProfile: {
      greenLines: ['〜'], redLines: ['〜'],
      goodPhrases: ['〜'], badPhrases: ['〜'],
      contactStyle:'〜', dateTips:'〜', conflictPattern:'〜',
      reconcileTips:'〜', progression:'〜'
    }
  };
  res.status(200).json({ result });
}
