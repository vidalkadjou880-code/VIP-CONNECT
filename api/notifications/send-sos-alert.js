const https = require('https');

const APP_SECURITY_TOKEN = (process.env.VIP_API_SECRET || 'VIP_CONNECT_SECURE_TOKEN_2026_x880').trim();

function sendBrevoEmail({ apiKey, senderEmail, senderName, toEmail, toName, subject, htmlContent }) {
  return new Promise((resolve) => {
    if (!apiKey) {
      return resolve({ success: true, simulated: true, message: 'Alerte SOS enregistrée (BREVO_API_KEY non définie).' });
    }
    const payload = {
      sender: { name: senderName || 'ALERTE SOS VIP Connect', email: senderEmail || 'vidalkadjou880@gmail.com' },
      to: [{ email: toEmail, name: toName || 'Administration VIP Connect' }],
      subject,
      htmlContent
    };
    const bodyData = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.brevo.com',
      port: 443,
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'Content-Length': Buffer.byteLength(bodyData)
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let result = {};
        try { result = JSON.parse(responseBody || '{}'); } catch (e) { result = { raw: responseBody }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ success: true, ...result });
        else resolve({ success: false, error: result.message || responseBody });
      });
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.write(bodyData);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VIP-App-Token, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Seul POST est accepté.' });

  const clientToken = req.headers['x-vip-app-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!clientToken || clientToken !== APP_SECURITY_TOKEN) {
    return res.status(401).json({ success: false, error: 'Jeton de sécurité invalide.' });
  }

  try {
    let data = req.body;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
    data = data || {};

    const adminEmail = (process.env.ADMIN_ALERT_EMAIL || process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com').trim();
    const mapsLink = (data.lat && data.lng)
      ? `https://www.google.com/maps?q=${data.lat},${data.lng}`
      : 'Position GPS non fournie par l\'appareil';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>ALERTE SOS VIP Connect</title></head>
<body style="margin:0;padding:20px;background:#1a0505;font-family:Arial,sans-serif;color:#fff;">
  <div style="max-width:600px;margin:0 auto;background:#181014;border:2px solid #ef4444;border-radius:14px;padding:24px;">
    <div style="background:#ef4444;color:#fff;padding:10px 16px;border-radius:8px;font-weight:900;font-size:18px;text-align:center;">
      🚨 ALERTE SOS DÉCLENCHÉE PAR UN PASSAGER
    </div>
    <p style="font-size:15px;margin-top:18px;">Un client vient de maintenir le bouton <strong>SOS (3 secondes)</strong> dans l'application VIP Connect :</p>
    <div style="background:#261215;border:1px solid #ef4444;border-radius:10px;padding:16px;line-height:1.8;font-size:14px;">
      <strong>Passager :</strong> ${data.userName || 'Client VIP'}<br>
      <strong>Téléphone :</strong> ${data.userPhone || 'N/A'}<br>
      <strong>Email :</strong> ${data.userEmail || 'N/A'}<br>
      <strong>Heure :</strong> ${new Date().toLocaleString('fr-FR')}<br>
      <strong>Localisation GPS :</strong> ${data.lat && data.lng ? `${data.lat}, ${data.lng}` : 'Indisponible'}
    </div>
    ${data.lat && data.lng ? `<div style="text-align:center;margin-top:20px;"><a href="${mapsLink}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:800;">📍 Voir sa position sur Google Maps</a></div>` : ''}
  </div>
</body></html>`;

    const result = await sendBrevoEmail({
      apiKey: (process.env.BREVO_API_KEY || '').trim(),
      senderEmail: (process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com').trim(),
      senderName: '🚨 SOS VIP Connect',
      toEmail: adminEmail,
      toName: 'Administration VIP Connect',
      subject: `🚨 URGENCE SOS — ${data.userName || 'Passager'} (${data.userPhone || ''})`,
      htmlContent
    });

    return res.status(200).json({ success: result.success, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erreur alerte SOS.' });
  }
};
