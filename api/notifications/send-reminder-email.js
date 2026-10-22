const https = require('https');

const APP_SECURITY_TOKEN = (process.env.VIP_API_SECRET || 'VIP_CONNECT_SECURE_TOKEN_2026_x880').trim();

// Limiteur de débit en mémoire (max 6 requêtes/minute par IP)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 6;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

function buildReminderEmailHtml(data) {
  const isUrgent = data.reminderType === '1h';
  const badgeText = isUrgent ? '🚨 DÉPART DANS MOINS D UNE HEURE' : '⏰ RAPPEL : DÉPART DANS MOINS DE 2 HEURES';
  const badgeColor = isUrgent ? '#ef4444' : '#f59e0b';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rappel de départ VIP Connect</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f0f0f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0c10; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #12141c; border-radius: 16px; border: 1px solid ${badgeColor}; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
          <tr>
            <td style="background-color: #181a24; padding: 22px 25px; border-bottom: 2px solid ${badgeColor};">
              <span style="display: inline-block; background-color: rgba(245, 158, 11, 0.15); border: 1px solid ${badgeColor}; color: ${badgeColor}; font-size: 11px; font-weight: bold; padding: 6px 12px; border-radius: 6px; text-transform: uppercase;">
                ${badgeText}
              </span>
              <div style="font-size: 22px; font-weight: 800; color: #ffffff; margin-top: 10px;">Votre Navette VIP Part Bientôt</div>
            </td>
          </tr>

          <tr>
            <td style="padding: 25px 25px 15px 25px;">
              <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">
                Bonjour <strong>${data.passengerName || 'Voyageur VIP'}</strong>,<br>
                Nous vous rappelons que votre départ pour <strong>${data.route}</strong> est prévu à <strong>${data.time}</strong> aujourd'hui (${data.date}).
              </p>

              <div style="background-color: #191c28; border-radius: 10px; padding: 18px; margin-bottom: 20px; border: 1px solid rgba(197, 168, 128, 0.25);">
                <div style="font-size: 12px; color: #a0aec0; margin-bottom: 6px;">Référence Billet : <strong style="color: #ffffff; font-family: monospace;">${data.resId || 'N/A'}</strong></div>
                <div style="font-size: 14px; color: #ffffff; margin-bottom: 6px;">Trajet : <strong>${data.route}</strong></div>
                <div style="font-size: 16px; color: #c5a880; font-weight: bold;">Heure de Départ : ${data.time}</div>
                <div style="font-size: 13px; color: #a0aec0; margin-top: 6px;">Place : <strong>${data.seatLabel || data.seatId || 'Siège Confirmé'}</strong> (Véhicule VIP #${data.vehicleId || 1})</div>
              </div>

              <div style="background-color: #1e2230; border-left: 4px solid #c5a880; padding: 15px; border-radius: 6px;">
                <strong style="color: #ffffff; font-size: 13px; display: block; margin-bottom: 6px;">Consignes avant votre arrivée :</strong>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #cbd5e0; line-height: 1.5;">
                  <li>Munissez-vous de votre pièce d'identité originale validée (CNI ou Passeport).</li>
                  <li>Présentez votre billet officiel (ou QR Code) depuis votre smartphone.</li>
                  <li>Présentez-vous au point d'embarquement 15 minutes avant le départ.</li>
                </ul>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 25px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #718096;">
              <p style="margin: 0;">Assistance et Conciergerie VIP Connect : <strong>+237 698 34 68 98</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function sendBrevoEmail({ apiKey, senderEmail, senderName, toEmail, toName, subject, htmlContent }) {
  return new Promise((resolve) => {
    if (!apiKey) {
      return resolve({
        success: true,
        simulated: true,
        message: 'Notification rappel simulée (BREVO_API_KEY non définie).'
      });
    }

    const payload = {
      sender: {
        name: senderName || 'VIP Connect Transport Agency',
        email: senderEmail || 'vidalkadjou880@gmail.com'
      },
      to: [{ email: toEmail, name: toName || 'Voyageur VIP Connect' }],
      subject: subject,
      htmlContent: htmlContent
    };

    const bodyData = JSON.stringify(payload);
    const options = {
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
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let result = {};
        try {
          result = JSON.parse(responseBody || '{}');
        } catch (e) {
          result = { raw: responseBody };
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, messageId: result.messageId || 'SENT', ...result });
        } else {
          resolve({ success: false, error: result.message || responseBody, code: res.statusCode });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.write(bodyData);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const origin = req.headers.origin || '';
  const isAllowedOrigin = !origin || 
    origin.includes('vip-connect') || 
    origin.includes('localhost') || 
    origin.includes('127.0.0.1') ||
    origin.endsWith('.vercel.app');

  if (isAllowedOrigin && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    return res.status(403).json({ success: false, error: 'Origine non autorisée.' });
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VIP-App-Token, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Seul POST est accepté.' });
  }

  // 1. Validation du jeton de sécurité applicatif
  const clientToken = req.headers['x-vip-app-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!clientToken || clientToken !== APP_SECURITY_TOKEN) {
    return res.status(401).json({
      success: false,
      error: 'Accès non autorisé : Jeton d\'application VIP Connect invalide ou manquant.'
    });
  }

  // 2. Limiteur de débit
  const clientIp = (req.headers && req.headers['x-forwarded-for']) || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Limite de requêtes atteinte. Veuillez patienter une minute.'
    });
  }

  try {
    let data = req.body;
    if (!data) {
      data = await new Promise((resolve) => {
        let buf = '';
        req.on('data', chunk => buf += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(buf)); } catch (e) { resolve({}); }
        });
        req.on('error', () => resolve({}));
      });
    } else if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
    }
    data = data || {};

    const toEmail = (data.toEmail || data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!toEmail || !emailRegex.test(toEmail) || toEmail.length > 120) {
      return res.status(400).json({ success: false, error: 'Adresse email destinataire invalide' });
    }

    const passengerName = String(data.passengerName || 'Voyageur VIP').substring(0, 80);
    const reminderType = data.reminderType === '1h' ? '1h' : '2h';
    const isUrgent = reminderType === '1h';
    const subject = isUrgent
      ? `🚨 VIP Connect : Embarquement dans moins d'une heure (${data.time}) !`
      : `⏰ VIP Connect : Votre voyage démarre dans moins de 2h (${data.time})`;

    const htmlContent = buildReminderEmailHtml({
      reminderType,
      resId: data.resId,
      passengerName,
      route: data.route,
      date: data.date,
      time: data.time,
      seatLabel: data.seatLabel,
      seatId: data.seatId,
      vehicleId: data.vehicleId
    });

    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com').trim();
    const senderName = (process.env.BREVO_SENDER_NAME || 'VIP Connect Transport Agency').trim();

    const result = await sendBrevoEmail({
      apiKey,
      senderEmail,
      senderName,
      toEmail,
      toName: passengerName,
      subject,
      htmlContent
    });

    return res.status(200).json({
      success: true,
      reminderType,
      emailSentTo: toEmail,
      ...result
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erreur interne lors de l\'envoi du rappel.' });
  }
};
