const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

function isThai(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

function detectDirection(text, dir) {
  if (dir === 'th-en') return 'th|en';
  if (dir === 'en-th') return 'en|th';
  return isThai(text) ? 'th|en' : 'en|th';
}

function directionLabel(pair) {
  return pair === 'th|en' ? 'ไทย → อังกฤษ' : 'อังกฤษ → ไทย';
}

async function lookup(text, langpair, de) {
  const params = new URLSearchParams({ q: text, langpair });
  if (de) params.set('de', de);

  const res = await fetch(`${MYMEMORY_URL}?${params}`);
  const data = await res.json();

  if (data.responseStatus === 429) {
    const err = new Error('ค้นหาเยอะเกินไป ลองใหม่ภายหลังนะ');
    err.status = 429;
    throw err;
  }

  if (!data.responseData?.translatedText) {
    const err = new Error('ไม่พบคำแปล');
    err.status = 404;
    throw err;
  }

  const matches = (data.matches || [])
    .filter(m => m.translation && m.translation !== data.responseData.translatedText)
    .slice(0, 8)
    .map(m => ({
      text: m.segment,
      translation: m.translation,
      quality: m.quality,
    }));

  return {
    query: text,
    direction: directionLabel(langpair),
    langpair,
    translation: data.responseData.translatedText,
    matches,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, dir } = req.query;
  const text = (q || '').trim();

  if (!text) return res.status(400).json({ error: 'กรุณาพิมพ์คำที่ต้องการค้นหา' });
  if (text.length > 200) return res.status(400).json({ error: 'คำค้นหายาวเกินไป' });

  try {
    const langpair = detectDirection(text, dir);
    const de = process.env.MYMEMORY_EMAIL || '';
    const result = await lookup(text, langpair, de);
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({ error: err.message || 'ค้นหาไม่ได้ ลองใหม่อีกครั้ง' });
  }
}
