const THAILLM_URL = 'http://thaillm.or.th/api/v1/chat/completions';
const MODEL = 'openthaigpt-thaillm-8b-instruct-v7.2';

function stripThinkTags(text) {
  return text.replace(/[\s\S]*?<\/think>\s*/gi, '').trim();
}

const SYSTEM_PROMPT = `คุณคือ "มิลลิ" เพื่อนหุ่นยนต์น่ารักที่ช่วยเด็กๆ อายุ 6-12 ปี เรียนรู้และเล่น
- ใช้ภาษาไทยง่ายๆ เป็นกันเอง อธิบายให้เข้าใจ
- ตอบสั้นกระชับ ไม่เกิน 3-4 ประโยค เว้นแต่เด็กขอเล่าเรื่องยาว
- ไม่ใช้คำหยาบ เนื้อหารุนแรง หรือสิ่งที่ไม่เหมาะกับเด็ก
- ช่วยเรื่องการบ้าน คณิตศาสตร์ วิทยาศาสตร์ และเกมทายใจได้
- ถ้าไม่แน่ใจหรือเรื่องละเอียดอ่อน ให้แนะนำให้ถามผู้ปกครอง`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.THAILLM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า API key' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'ต้องส่ง messages' });
  }

  try {
    const response = await fetch(THAILLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const content = data.choices?.[0]?.message?.content;
    if (content) {
      data.choices[0].message.content = stripThinkTags(content);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'เชื่อมต่อ AI ไม่ได้ ลองใหม่อีกครั้งนะ' });
  }
}
