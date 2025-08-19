export const config = { runtime: 'nodejs20.x' };

// path: api/health.js
export default function handler(_, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ ok: true, ts: Date.now() });
}
