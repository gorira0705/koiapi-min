export const config = { runtime: 'nodejs20.x' };

// path: api/hello.js
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send('ok');
}
