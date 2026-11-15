// Vercel serverless function: принимает заявку с сайта и отправляет её в Telegram.
// Токен бота и chat id хранятся в настройках Vercel (Environment Variables), а не в коде сайта.
// Защита от спама: проверка источника, скрытое поле-ловушка, минимальное время заполнения,
// лимит заявок с одного адреса и защита от повторов одного телефона.
const hits = new Map();   // ip -> время запросов
const phones = new Map(); // телефон -> время последней заявки
const WINDOW = 10 * 60 * 1000, MAX_PER_IP = 3, MIN_FILL_MS = 3000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  // 1. Запрос должен идти с самого сайта
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || req.headers.referer || '');
  if (origin) {
    let oh = '';
    try { oh = new URL(origin).host; } catch (e) { oh = ''; }
    if (oh !== host) return res.status(403).json({ ok: false });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not configured' });

  let d = req.body || {};
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }

  // 2. Скрытое поле-ловушка: человек его не видит, а боты заполняют
  if (String(d.website || '').trim() !== '') return res.status(200).json({ ok: true });

  // 3. Слишком быстрая отправка: человек не заполнит форму быстрее 3 секунд
  const ms = Number(d.ms);
  if (!isFinite(ms) || ms < MIN_FILL_MS) return res.status(200).json({ ok: true });

  // 4. Лимит заявок с одного адреса: не больше 3 за 10 минут
  const now = Date.now();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (list.length >= MAX_PER_IP) return res.status(429).json({ ok: false });
  list.push(now); hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW)) hits.delete(k);

  const clean = v => String(v || '').replace(/[<>&]/g, '').slice(0, 300);
  const name = clean(d.name), phone = clean(d.phone), topic = clean(d.topic);
  const digits = phone.replace(/\D/g, '');
  if (!name || digits.length < 10 || digits.length > 15) return res.status(400).json({ ok: false });

  // 5. Один и тот же телефон не чаще раза в 10 минут
  if (phones.has(digits) && now - phones.get(digits) < WINDOW) return res.status(200).json({ ok: true });
  phones.set(digits, now);
  if (phones.size > 500) for (const [k, t] of phones) if (now - t > WINDOW) phones.delete(k);

  const text = '🆕 Новая заявка с сайта Expert Clinic\n\n' +
    'Имя: ' + name + '\nТелефон: ' + phone + '\nИнтересует: ' + topic;
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text })
    });
    if (!r.ok) return res.status(502).json({ ok: false });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false });
  }
};
