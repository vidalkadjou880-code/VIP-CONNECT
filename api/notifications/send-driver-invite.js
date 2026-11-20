const https = require('https');

const APP_SECURITY_TOKEN = (process.env.VIP_API_SECRET || 'VIP_CONNECT_SECURE_TOKEN_2026_x880').trim();

function sendBrevoEmail({ apiKey, senderEmail, senderName, toEmail, toName, subject, htmlContent }) {
  return new Promise((resolve) => {
    if (!apiKey) {
      return resolve({
        success: true,
        simulated: true,
        message: 'Email simulé (BREVO_API_KEY non définie sur Vercel).'
      });
    }

    const payload = {
      sender: {
        name: senderName || 'VIP Connect Transport Agency',
        email: senderEmail || 'vidalkadjou880@gmail.com'
      },
      to: [{ email: toEmail, name: toName || 'Chauffeur VIP Connect' }],
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

    const toEmail = (data.toEmail || data.email || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Email chauffeur invalide.' });
    }

    const driverName = `${data.firstname || ''} ${data.lastname || ''}`.trim() || 'Chauffeur VIP';
    const setupUrl = data.setupUrl || 'https://vip-connect.vercel.app';
    const vehicleName = data.vehicleName || 'Changan VIP #1';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Accès Espace Chauffeur VIP Connect</title></head>
<body style="margin:0;padding:0;background:#0b0c10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#f0f0f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 15px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:600px;background:#12141c;border-radius:16px;border:1px solid #c5a880;overflow:hidden;">
        <tr>
          <td style="background:#181a24;padding:24px 28px;border-bottom:2px solid #c5a880;">
            <div style="font-size:22px;font-weight:800;color:#c5a880;letter-spacing:1.5px;">★ VIP CONNECT — ESPACE CHAUFFEUR</div>
            <div style="font-size:12px;color:#a0aec0;margin-top:4px;">Invitation officielle d'activation de votre compte chauffeur</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <h2 style="color:#fff;margin:0 0 12px;">Bonjour ${driverName},</h2>
            <p style="color:#cbd5e0;font-size:14px;line-height:1.6;">
              L'administration <strong>VIP Connect</strong> vient de vous créer votre accès chauffeur officiel.<br>
              Véhicule assigné : <strong style="color:#c5a880;">${vehicleName}</strong><br>
              Identifiant de connexion : <strong>${toEmail}</strong> (ou votre téléphone <strong>${data.phone || ''}</strong>)
            </p>
            <p style="color:#cbd5e0;font-size:14px;line-height:1.6;">
              Cliquez sur le bouton ci-dessous pour <strong>créer votre mot de passe personnel</strong> et accéder à votre Espace Chauffeur (suivi GPS en direct et gestion des départs) :
            </p>
            <div style="text-align:center;margin:26px 0;">
              <a href="${setupUrl}" style="display:inline-block;background:linear-gradient(135deg,#f6e7c1,#c5a880);color:#111118;font-size:15px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:10px;">
                Créer mon mot de passe Chauffeur →
              </a>
            </div>
            <p style="font-size:12px;color:#94a3b8;word-break:break-all;">
              Si le bouton ne s'ouvre pas, copiez ce lien : <a href="${setupUrl}" style="color:#c5a880;">${setupUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#0d0f15;padding:16px 28px;text-align:center;font-size:11px;color:#718096;border-top:1px solid rgba(255,255,255,0.08);">
            Assistance VIP Connect (WhatsApp) : <strong>+237 656 70 13 77</strong>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const result = await sendBrevoEmail({
      apiKey: (process.env.BREVO_API_KEY || '').trim(),
      senderEmail: (process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com').trim(),
      senderName: (process.env.BREVO_SENDER_NAME || 'VIP Connect Transport Agency').trim(),
      toEmail,
      toName: driverName,
      subject: '🚗 VIP Connect : Activez votre compte Chauffeur et créez votre mot de passe',
      htmlContent
    });

    return res.status(200).json({ success: result.success, emailSentTo: toEmail, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'invitation chauffeur.' });
  }
};
