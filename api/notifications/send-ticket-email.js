const https = require('https');

function buildTicketEmailHtml(data) {
  const qrData = encodeURIComponent(`VIP-CONNECT|${data.resId}|${(data.passengerName || 'CLIENT').toUpperCase()}|${data.amount || '20000 FCFA'}|${data.route}|${data.date}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrData}`;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Votre Billet VIP Connect</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f0f0f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0c10; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 640px; background-color: #12141c; border-radius: 16px; border: 1px solid #c5a880; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.7);">
          <tr>
            <td style="background: linear-gradient(135deg, #181a24 0%, #202434 100%); padding: 28px 30px; border-bottom: 2px solid #c5a880;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 24px; font-weight: 800; color: #c5a880; letter-spacing: 2px;">★ VIP CONNECT</div>
                    <div style="font-size: 11px; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Service Première Classe • Douala ↔ Yaoundé</div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: rgba(52, 199, 89, 0.15); border: 1px solid #34c759; color: #34c759; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">
                      ✓ Billet Confirmé & Payé
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px 30px 10px 30px;">
              <h1 style="color: #ffffff; font-size: 20px; margin: 0 0 10px 0;">Bonjour ${data.passengerName || 'Cher Client VIP'},</h1>
              <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0;">
                Votre réservation pour le trajet <strong>${data.route}</strong> a été validée avec succès. Vous trouverez votre <strong>Billet Officiel (PDF) scannable joint à cet email</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #191c28; border: 1px solid rgba(197, 168, 128, 0.3); border-radius: 12px; padding: 20px;">
                <tr>
                  <td colspan="2" style="padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #c5a880; letter-spacing: 1px; font-weight: bold;">Référence Billet</div>
                    <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${data.resId || 'RES-00000'}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Itinéraire :</span>
                    <strong style="font-size: 15px; color: #ffffff;">${data.route}</strong>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); text-align: right;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Type :</span>
                    <strong style="font-size: 14px; color: #c5a880;">${data.tripType === 'roundtrip' ? 'Aller-retour' : 'Aller simple'}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Date de départ :</span>
                    <strong style="font-size: 15px; color: #ffffff;">${data.date}</strong>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); text-align: right;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Heure précise :</span>
                    <strong style="font-size: 18px; color: #c5a880;">${data.time}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Siège attribué :</span>
                    <strong style="font-size: 14px; color: #ffffff;">${data.seatLabel || data.seatId || 'Avant'}</strong>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); text-align: right;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Véhicule VIP :</span>
                    <strong style="font-size: 14px; color: #ffffff;">Toyota Privée #${data.vehicleId || 1}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Montant Réglé :</span>
                    <strong style="font-size: 18px; color: #34c759;">${data.amount ? (typeof data.amount === 'number' ? data.amount.toLocaleString('fr-FR') + ' FCFA' : data.amount) : '20 000 FCFA'}</strong>
                  </td>
                  <td style="padding: 12px 0; text-align: right;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Transaction :</span>
                    <span style="font-size: 12px; font-family: monospace; color: #c5a880;">${data.txId || 'OM-VIP'}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; padding: 20px; color: #111118;">
                <tr>
                  <td width="130" align="center" style="vertical-align: middle;">
                    <img src="${qrUrl}" alt="QR Code Embarquement" width="120" height="120" style="display: block; border-radius: 6px; border: 1px solid #ddd;">
                    <span style="font-size: 9px; color: #666; font-family: monospace; display: block; margin-top: 4px;">SCAN EMBARQ.</span>
                  </td>
                  <td style="padding-left: 20px; vertical-align: middle;">
                    <div style="font-size: 13px; font-weight: bold; color: #111118; margin-bottom: 5px;">
                      📍 Points de Rendez-vous & Embarquement
                    </div>
                    <p style="font-size: 11px; color: #4a5568; line-height: 1.5; margin: 0 0 8px 0;">
                      <strong>Douala :</strong> Agence VIP Bonapriso / Rond-Point Deïdo.<br>
                      <strong>Yaoundé :</strong> Agence VIP Bastos / Carrefour Warda.
                    </p>
                    <div style="font-size: 11px; color: #e53e3e; font-weight: bold;">
                      ⏱ Présentation requise 15 minutes avant l'heure de départ.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #10121a; padding: 20px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: #718096;">
              <p style="margin: 0 0 5px 0;">Assistance Voyageur 24h/24 : <strong>+237 699 00 00 00</strong> | contact@vipconnect.cm</p>
              <p style="margin: 0;">© 2026 VIP Connect Transport Agency. Tous droits réservés.</p>
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

function sendBrevoEmail({ apiKey, senderEmail, senderName, toEmail, toName, subject, htmlContent, attachments = [] }) {
  return new Promise((resolve) => {
    if (!apiKey) {
      console.warn('[Brevo Serverless] BREVO_API_KEY non définie.');
      return resolve({
        success: false,
        simulated: true,
        error: 'Clé BREVO_API_KEY non configurée dans Vercel.'
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

    if (attachments && attachments.length > 0) {
      payload.attachment = attachments.map(att => ({
        name: att.name,
        content: att.content
      }));
    }

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
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

    const toEmail = (data.toEmail || data.email || '').trim();
    const passengerName = `${data.firstname || ''} ${data.lastname || ''}`.trim() || data.passengerName || 'Client VIP';

    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse email destinataire invalide' });
    }

    const subject = `🎫 Votre Billet Officiel VIP Connect (${data.route || 'Douala ↔ Yaoundé'}) - Réf: ${data.resId || 'RES'}`;
    const htmlContent = buildTicketEmailHtml({
      resId: data.resId,
      passengerName: passengerName,
      route: data.route,
      date: data.date,
      time: data.time,
      seatLabel: data.seatLabel,
      seatId: data.seatId,
      vehicleId: data.vehicleId,
      amount: data.amount,
      txId: data.txId,
      tripType: data.tripType
    });

    const attachments = [];
    if (data.pdfBase64) {
      attachments.push({
        name: `Billet_VIP_Connect_${(data.resId || 'RESERVATION').replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`,
        content: data.pdfBase64
      });
    }

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
      htmlContent,
      attachments
    });

    return res.status(200).json({
      success: result.success,
      emailSentTo: toEmail,
      hasPdfAttached: attachments.length > 0,
      ...result
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
