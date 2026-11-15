// Vercel serverless function: принимает заявку с сайта и отправляет её в Telegram.
// Токен бота и chat id хранятся в настройках Vercel (Environment Variables), а не в коде сайта.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not configured' });

  let d = req.body || {};
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
  const clean = v => String(v || '').replace(/[<>&]/g, '').slice(0, 300);
  const name = clean(d.name), phone = clean(d.phone), topic = clean(d.topic);
  if (!name || phone.replace(/\D/g, '').length < 10) return res.status(400).json({ ok: false });

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
