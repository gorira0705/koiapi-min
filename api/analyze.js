// Vercel Serverless Function (Node 18+)
// ここでは OpenAI 呼び出しはダミー化し、クライアントのモデルに合わせた JSON を返します。
// 後で OpenAI API 呼び出しへ置き換えてOK。

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const {
      sessionName = '診断',
      chatLog = '',
      source = '',
      relation = '',
      goal = '',
      extraInfo = '',
      speakerGender = 'neutral',
    } = req.body || {};

    // 将来の口調分岐に使える（いまはデータに同梱しておく）
    const tone = speakerGender === 'male' ? '男性寄り' :
                 speakerGender === 'female' ? '女性寄り' : '中立';

    // ---- モック返却（Flutter の DiagnosisResult.mockLong と整合）----
    const result = {
      categories: ["共感力", "質問力", "話題展開", "柔軟性", "テンポ"],
      scores: [4.2, 3.6, 4.1, 3.2, 4.4],
      comments: {
        "共感力": "相手の感情の背景を汲み取り、言い換えで返せています。特に『それ大変だったね』のような感情ラベリングが自然。",
        "質問力": "広げる質問はできていますが、深掘りの“理由/きっかけ”問いかけが少なめ。Why/How系を1発足すだけで熱量が上がります。",
        "話題展開": "自己開示→相手の体験へ橋渡しの流れが上手。相手が語った点に“短い感想＋共感”を挟むとさらに滑らか。",
        "柔軟性": "相手のトーンに寄せる反応がときどき遅れ、硬い印象に。返答の粒度（長短）を相手に合わせるだけで柔らかく見えます。",
        "テンポ": "早過ぎず遅過ぎず、読みやすいテンポ。既読スルー後の再開が丁寧で好印象です。"
      },
      freeSummary:
        "総合的に“安心して話せる人”。ここから親密度を上げるには、Why質問を1ターンだけ入れる／言い換え→質問／週末タイミングで軽い提案、の3点で大きく伸びます。",
      myMBTI: "INFP",
      myMbtiLongText:
        "あなたは“芯の優しさと価値観”を軸に人と関わるタイプ。恋愛では言葉選びが丁寧で、共感の厚みで相手を支えるのが得意。",
      partnerMBTI: "ENFJ",
      compatibilityText:
        "理想と人への配慮が融合する相性。価値観が重なるため信頼が築きやすく、現実への落とし込みも進めやすい。",
      compatibilityAxes: ["価値観整合", "会話の相性", "感情共有", "未来志向", "距離感調整"],
      compatibilityScores: [4.5, 3.8, 4.2, 4.0, 3.9],
      compatibilityReasons: {
        "価値観整合": "理念・意味と人の調和の両輪が回りやすい。",
        "会話の相性": "内面を探る姿勢と温かいまとめ役が噛み合う。",
        "感情共有": "安心安全の空気を双方が大切にできる。",
        "未来志向": "理想と実装の橋渡しが得意なペア。",
        "距離感調整": "“希望の伝え合い”が調整弁。"
      },
      detailedAdvice: {
        "共感力": [
          { action: "要約＋感情ラベリング", effect: "理解感が増す", example: "「それって不安も強かったよね」" }
        ],
        "質問力": [
          { action: "Why/Howを1発", effect: "深さが増す", example: "「どうしてそう思った？」" }
        ],
        "話題展開": [
          { action: "ミニ体験→橋渡し", effect: "沈黙が減る", example: "「カフェ巡り好き。○○さんは？」" }
        ],
        "柔軟性": [
          { action: "文量を合わせる", effect: "話しやすさUP", example: "「了解！じゃあ○時で🙆」" }
        ],
        "テンポ": [
          { action: "軽リアク→本返信", effect: "放置感回避", example: "「読んだ！後で返すね」" }
        ]
      },
      partnerProfile: {
        greenLines: ["具体的な称賛", "“一緒に”を感じる提案"],
        redLines: ["理由なき未読放置", "刺のある冗談"],
        goodPhrases: ["「きっかけは何かあった？」"],
        badPhrases: ["「普通はさ」"],
        contactStyle: "短いやり取りの積み重ねが安心感に。",
        dateTips: "写真映え＋静けさのある場所を。",
        conflictPattern: "配慮不足の一言が火種に。",
        reconcileTips: "事実→意図→感情→今後の順で端的に。",
        progression: "次の小さな関門を置く。"
      }
    };

    // 簡単なエコーバック（デバッグ用）
    result.meta = {
      tone, // 男性寄り/女性寄り/中立
      inputs: { sessionName, source, relation, goal, note: extraInfo },
      chatBytes: Buffer.from(chatLog ?? '').length
    };

    res.status(200).json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message ?? 'unknown error' });
  }
}
