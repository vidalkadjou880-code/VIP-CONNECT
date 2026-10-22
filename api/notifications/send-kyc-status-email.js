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

// Nettoyage périodique du cache de limitation
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.startTime > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function buildKycStatusEmailHtml(data) {
  const isApproved = data.status === 'approved';
  const passengerName = data.passengerName || 'Voyageur VIP';
  const motif = data.motif || 'Documents d\'identité jugés illisibles, non conformes ou incomplets.';
  const appUrl = (process.env.APP_URL || 'https://vip-connect.vercel.app').replace(/\/$/, '');

  const accentColor = isApproved ? '#34c759' : '#f59e0b';
  const badgeText = isApproved ? '✓ DOSSIER D\'IDENTITÉ VALIDÉ & APPROUVÉ' : '⚠️ MISE À JOUR DE VOS DOCUMENTS REQUISE';
  const titleText = isApproved ? 'Félicitations, votre compte est validé !' : 'Votre dossier d\'identité n\'a pas pu être validé';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isApproved ? 'Compte VIP Connect Validé' : 'Mise à jour requise VIP Connect'}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f0f0f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0c10; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #12141c; border-radius: 16px; border: 1px solid ${accentColor}; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
          
          <!-- En-tête de marque VIP -->
          <tr>
            <td style="background: linear-gradient(135deg, #181a24 0%, #202434 100%); padding: 26px 30px; border-bottom: 2px solid ${accentColor};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 24px; font-weight: 800; color: #c5a880; letter-spacing: 2px;">★ VIP CONNECT</div>
                    <div style="font-size: 11px; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Service Première Classe • Douala ↔ Yaoundé</div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: ${isApproved ? 'rgba(52, 199, 89, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; border: 1px solid ${accentColor}; color: ${accentColor}; font-size: 11px; font-weight: bold; padding: 6px 12px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${isApproved ? 'Compte Vérifié' : 'Action Requise'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding: 32px 30px 24px 30px;">
              
              <div style="margin-bottom: 22px;">
                <span style="display: inline-block; background: ${isApproved ? 'rgba(52, 199, 89, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; color: ${accentColor}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">
                  ${badgeText}
                </span>
                <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 6px 0 12px 0; line-height: 1.3;">
                  ${titleText}
                </h1>
                <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0;">
                  Bonjour <strong>${passengerName}</strong>,
                </p>
              </div>

              ${isApproved ? `
                <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                  Nous avons le plaisir de vous confirmer que vos documents d'identité ont été vérifiés et certifiés conformes par notre équipe administrative. Votre compte <strong>VIP Connect</strong> est maintenant officiellement activé.
                </p>

                <!-- Bloc des privilèges débloqués -->
                <div style="background-color: #181a24; border-radius: 12px; padding: 20px; margin-bottom: 25px; border: 1px solid rgba(197, 168, 128, 0.3);">
                  <div style="font-size: 13px; font-weight: bold; color: #c5a880; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px;">
                    Vos avantages Première Classe débloqués :
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding: 6px 0; font-size: 13px; color: #f0f0f0;">
                        <span style="color: #34c759; margin-right: 8px;">✓</span> <strong>Réservation instantanée :</strong> Accès direct à l'ensemble de nos départs Douala ↔ Yaoundé.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 13px; color: #f0f0f0;">
                        <span style="color: #34c759; margin-right: 8px;">✓</span> <strong>Choix du siège garanti :</strong> Sélection de votre place favorite dans nos navettes privatisées 3 passagers.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 13px; color: #f0f0f0;">
                        <span style="color: #34c759; margin-right: 8px;">✓</span> <strong>Billetterie dématérialisée :</strong> Réception automatique de votre billet officiel avec QR Code sécurisé.
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Bouton d'action Réservation -->
                <div style="text-align: center; margin: 28px 0 15px 0;">
                  <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #c5a880 0%, #a88d65 100%); color: #0b0c10; font-size: 15px; font-weight: 800; text-decoration: none; padding: 14px 34px; border-radius: 8px; box-shadow: 0 4px 20px rgba(197, 168, 128, 0.4); text-transform: uppercase; letter-spacing: 1px;">
                    Réserver ma navette maintenant →
                  </a>
                </div>
              ` : `
                <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0 0 18px 0;">
                  Notre équipe administrative a examiné les documents d'identité soumis pour votre profil, mais n'a malheureusement pas pu valider votre dossier pour le motif suivant :
                </p>

                <!-- Bloc du motif de rejet -->
                <div style="background-color: rgba(245, 158, 11, 0.08); border-radius: 10px; padding: 18px 20px; margin-bottom: 22px; border: 1px solid rgba(245, 158, 11, 0.35);">
                  <div style="font-size: 12px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
                    Motif de non-conformité :
                  </div>
                  <div style="font-size: 14px; color: #ffffff; font-weight: 500; line-height: 1.5; font-style: italic;">
                    « ${motif} »
                  </div>
                </div>

                <!-- Étapes de mise à jour -->
                <div style="background-color: #181a24; border-radius: 12px; padding: 20px; margin-bottom: 25px; border: 1px solid rgba(197, 168, 128, 0.25);">
                  <div style="font-size: 13px; font-weight: bold; color: #c5a880; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
                    Comment régulariser votre dossier en 1 minute :
                  </div>
                  <ol style="margin: 0; padding-left: 20px; color: #cbd5e0; font-size: 13px; line-height: 1.7;">
                    <li>Connectez-vous à la plateforme VIP Connect et ouvrez la rubrique <strong>« Mon KYC »</strong>.</li>
                    <li>Prenez une photo claire, bien nette et cadrée de votre pièce d'identité (CNI recto/verso ou Passeport).</li>
                    <li>Réalisez un selfie net et bien éclairé avec le visage dégagé.</li>
                    <li>Validez le formulaire pour renvoyer votre dossier à l'administration.</li>
                  </ol>
                </div>

                <!-- Bouton d'action Mise à jour -->
                <div style="text-align: center; margin: 28px 0 15px 0;">
                  <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0b0c10; font-size: 15px; font-weight: 800; text-decoration: none; padding: 14px 34px; border-radius: 8px; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4); text-transform: uppercase; letter-spacing: 1px;">
                    Mettre à jour mes pièces d'identité →
                  </a>
                </div>
              `}

              <div style="font-size: 12px; color: #718096; text-align: center; margin-top: 25px; line-height: 1.5;">
                Pour toute question ou assistance concernant votre dossier, notre service conciergerie est à votre écoute 7j/7 au <strong>+237 699 99 99 99</strong>.
              </div>

            </td>
          </tr>

          <!-- Pied de page VIP -->
          <tr>
            <td style="background-color: #0d0f15; padding: 20px 30px; border-top: 1px solid rgba(197, 168, 128, 0.2); text-align: center;">
              <div style="font-size: 12px; color: #c5a880; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;">VIP CONNECT PREMIÈRE CLASSE</div>
              <div style="font-size: 11px; color: #718096; line-height: 1.5;">
                Liaisons privatisées Douala ↔ Yaoundé par autoroute • Boissons offertes • Sécurité garantie
              </div>
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

function sendBrevoEmail(payload) {
  return new Promise((resolve) => {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.warn('[Brevo KYC Email] Clé BREVO_API_KEY absente.');
      return resolve({ 
        success: false, 
        error: 'BREVO_API_KEY non configurée dans l\'environnement.',
        simulated: true 
      });
    }

    const bodyData = JSON.stringify({
      sender: {
        name: 'VIP Connect',
        email: process.env.BREVO_SENDER_EMAIL || 'notifications@vipconnect.cm'
      },
      to: [{
        email: payload.toEmail,
        name: payload.passengerName || 'Voyageur VIP'
      }],
      subject: payload.subject,
      htmlContent: payload.htmlContent
    });

    const options = {
      hostname: 'api.brevo.com',
      port: 443,
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(bodyData)
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

async function handler(req, res) {
  // En-têtes de sécurité
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Restriction CORS
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
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch(e) { resolve({}); }
        });
      });
    }

    const recipientEmail = (data.toEmail || data.email || '').trim().toLowerCase();
    const status = (data.status || '').trim().toLowerCase();

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: 'Adresse email destinataire invalide' });
    }

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'Statut invalide. Attendu: approved ou rejected.' });
    }

    const passengerName = (data.passengerName || data.name || (data.firstname ? `${data.firstname} ${data.lastname || ''}` : '')).trim() || 'Voyageur VIP';
    const motif = (data.motif || data.comments || '').trim();

    const subject = status === 'approved' 
      ? '✓ Félicitations ! Votre compte VIP Connect a été validé' 
      : '⚠️ Mise à jour requise : Votre dossier d\'identité VIP Connect';

    const htmlContent = buildKycStatusEmailHtml({
      status,
      passengerName,
      motif,
      docType: data.docType
    });

    const emailResult = await sendBrevoEmail({
      toEmail: recipientEmail,
      passengerName,
      subject,
      htmlContent
    });

    return res.status(200).json({
      success: emailResult.success,
      status: status,
      recipient: recipientEmail,
      messageId: emailResult.messageId,
      error: emailResult.error,
      simulated: emailResult.simulated || false
    });
  } catch (err) {
    console.error('[API send-kyc-status-email] Exception:', err);
    return res.status(500).json({ success: false, error: 'Erreur interne du serveur', details: err.message });
  }
};

module.exports = handler;
module.exports.buildKycStatusEmailHtml = buildKycStatusEmailHtml;

