export const config = { runtime: 'nodejs20.x' };

export default async function handler(req, res) {
  res.status(200).json({ ok: true, runtime: 'nodejs20.x' });
}
