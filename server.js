const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Chargement sécurisé du fichier .env pour protéger les clés privées sur le serveur
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    envLines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
    console.log('[Server] Variables .env chargées avec succès en mémoire sécurisée.');
  }
} catch (e) {
  console.warn('[Server] Note: Lecture directe du fichier .env ignorée.', e.message);
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

// Dossier de journalisation des notifications
const LOGS_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (e) {}
}

const NOTIFICATIONS_LOG_FILE = path.join(LOGS_DIR, 'notifications_history.json');
let notificationsHistory = [];
try {
  if (fs.existsSync(NOTIFICATIONS_LOG_FILE)) {
    notificationsHistory = JSON.parse(fs.readFileSync(NOTIFICATIONS_LOG_FILE, 'utf8') || '[]');
  }
} catch (e) {
  notificationsHistory = [];
}

function recordNotification(entry) {
  try {
    notificationsHistory.unshift({
      id: 'NOTIF-' + Date.now(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    if (notificationsHistory.length > 100) {
      notificationsHistory = notificationsHistory.slice(0, 100);
    }
    fs.writeFileSync(NOTIFICATIONS_LOG_FILE, JSON.stringify(notificationsHistory, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Notifications] Erreur écriture log:', err.message);
  }
}

// -------------------------------------------------------------
// SERVICE BREVO EMAIL (API REST v3)
// Envoi réel des billets PDF et des rappels de voyage
// -------------------------------------------------------------
function sendBrevoEmail({ toEmail, toName, subject, htmlContent, attachments = [] }) {
  return new Promise((resolve, reject) => {
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com').trim();
    const senderName = (process.env.BREVO_SENDER_NAME || 'VIP Connect Transport Agency').trim();

    if (!apiKey) {
      console.log(`[Brevo Email (Simulateur)] Destinataire: ${toEmail} | Sujet: "${subject}" | Attachments: ${attachments.length}`);
      recordNotification({
        type: 'email_simulated',
        toEmail,
        toName,
        subject,
        hasAttachment: attachments.length > 0,
        status: 'simulated_no_api_key',
        note: 'Ajoutez BREVO_API_KEY dans votre fichier .env pour l envoi direct'
      });
      return resolve({
        success: true,
        simulated: true,
        message: 'Notification email simulée (BREVO_API_KEY non définie).'
      });
    }

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: toEmail,
          name: toName || 'Voyageur VIP Connect'
        }
      ],
      subject: subject,
      htmlContent: htmlContent
    };

    if (attachments && attachments.length > 0) {
      payload.attachment = attachments.map(att => ({
        name: att.name,
        content: att.content // Base64 string
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
          console.log(`[Brevo Email] Succès envoi à ${toEmail} (MessageId: ${result.messageId || 'OK'})`);
          recordNotification({
            type: 'email_sent',
            toEmail,
            toName,
            subject,
            messageId: result.messageId,
            status: 'delivered'
          });
          resolve({ success: true, messageId: result.messageId, result });
        } else {
          console.warn(`[Brevo Email] Erreur ${res.statusCode}:`, responseBody);
          recordNotification({
            type: 'email_error',
            toEmail,
            subject,
            error: result.message || responseBody,
            status: 'failed'
          });
          resolve({
            success: false,
            error: result.message || 'Erreur API Brevo',
            statusCode: res.statusCode
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Brevo Email] Exception réseau:', err.message);
      recordNotification({
        type: 'email_network_error',
        toEmail,
        subject,
        error: err.message,
        status: 'error'
      });
      resolve({ success: false, error: err.message });
    });

    req.write(bodyData);
    req.end();
  });
}

// Modèle HTML du Billet Officiel VIP Connect (Envoyé par Email)
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
        <!-- Conteneur Carte Email -->
        <table role="presentation" width="100%" max-width="640" style="max-width: 640px; background-color: #12141c; border-radius: 16px; border: 1px solid #c5a880; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.7);">
          <!-- Header Doré -->
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

          <!-- Message d'introduction -->
          <tr>
            <td style="padding: 25px 30px 10px 30px;">
              <h1 style="color: #ffffff; font-size: 20px; margin: 0 0 10px 0;">Bonjour ${data.passengerName || 'Cher Client VIP'},</h1>
              <p style="color: #cbd5e0; font-size: 14px; line-height: 1.6; margin: 0;">
                Votre réservation pour le trajet <strong>${data.route}</strong> a été validée avec succès. Vous trouverez votre <strong>Billet Officiel (PDF) scannable joint à cet email</strong>.
              </p>
            </td>
          </tr>

          <!-- Fiche de Réservation & Trajet -->
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
                    <strong style="font-size: 18px; color: #34c759;">${data.amount || '20 000 FCFA'}</strong>
                  </td>
                  <td style="padding: 12px 0; text-align: right;">
                    <span style="font-size: 11px; color: #a0aec0; display: block;">Transaction :</span>
                    <span style="font-size: 12px; font-family: monospace; color: #c5a880;">${data.txId || 'OM-VIP'}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- QR Code et Consignes d'embarquement -->
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
                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #4a5568; line-height: 1.5;">
                      <li><strong>Douala</strong> : Agence VIP Connect Bonanjo (Face Tribunal)</li>
                      <li><strong>Yaoundé</strong> : Agence VIP Connect Bastos</li>
                      <li>Présentez-vous <strong>15 minutes avant le départ</strong> muni de votre CNI ou Passeport.</li>
                      <li>Chaque navette est strictement limitée à 3 passagers.</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pied de page -->
          <tr>
            <td style="padding: 20px 30px 30px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #718096;">
              <p style="margin: 0 0 6px 0;">Le fichier PDF officiel de votre carte d'embarquement est joint à ce message.</p>
              <p style="margin: 0;">Besoin d'assistance ? Service Client VIP Connect 24h/24 : <strong>+237 698 34 68 98</strong></p>
              <p style="margin: 12px 0 0 0; color: #4a5568;">&copy; 2026 VIP Connect Transport d'Élite Cameroun.</p>
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

// Modèle HTML du Rappel de Voyage (2h et 1h avant départ)
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
        <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #12141c; border-radius: 16px; border: 1px solid ${badgeColor}; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
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
                <strong style="color: #ffffff; font-size: 13px; display: block; margin-bottom: 6px;">Checklist avant votre arrivée :</strong>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #cbd5e0; line-height: 1.5;">
                  <li>Ayez votre pièce d'identité physique sur vous (CNI ou Passeport).</li>
                  <li>Gardez votre billet PDF ou son QR Code ouvert sur l'écran de votre téléphone.</li>
                  <li>Présentez-vous au point d'embarquement 15 à 30 minutes avant le départ.</li>
                </ul>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 25px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #718096;">
              <p style="margin: 0;">Chauffeur et conciergerie VIP Connect : <strong>+237 698 34 68 98</strong></p>
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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = decodeURIComponent(parsedUrl.pathname);

  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // -------------------------------------------------------------
  // API ROUTER : NOTIFICATIONS (EMAIL BREVO & PUSH SMARTPHONE)
  // -------------------------------------------------------------
  const APP_SECURITY_TOKEN = (process.env.VIP_API_SECRET || 'VIP_CONNECT_SECURE_TOKEN_2026_x880').trim();

  function verifyApiToken(req, res) {
    const token = req.headers['x-vip-app-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!token || token !== APP_SECURITY_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: false,
        error: 'Accès non autorisé : Jeton de sécurité VIP Connect requis.'
      }));
      return false;
    }
    return true;
  }

  if (reqPath.startsWith('/api/notifications/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Statut du service de notifications (Sécurisé par jeton)
    if (reqPath === '/api/notifications/status' && req.method === 'GET') {
      if (!verifyApiToken(req, res)) return;
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'active',
        brevoConfigured: !!process.env.BREVO_API_KEY,
        senderEmail: process.env.BREVO_SENDER_EMAIL || 'vidalkadjou880@gmail.com',
        senderName: process.env.BREVO_SENDER_NAME || 'VIP Connect Transport Agency',
        historyCount: notificationsHistory.length
      }));
      return;
    }

    // Historique des notifications envoyées (Sécurisé par jeton)
    if (reqPath === '/api/notifications/history' && req.method === 'GET') {
      if (!verifyApiToken(req, res)) return;
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        history: notificationsHistory
      }));
      return;
    }

    // Envoi du Billet PDF par Email (Directement dans la boîte mail - Sécurisé par jeton)
    if (reqPath === '/api/notifications/send-ticket-email' && req.method === 'POST') {
      if (!verifyApiToken(req, res)) return;
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) { // Limite 25MB pour pièces jointes volumineuses
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const toEmail = (data.toEmail || data.email || '').trim();
          const passengerName = `${data.firstname || ''} ${data.lastname || ''}`.trim() || data.passengerName || 'Client VIP';

          if (!toEmail || !toEmail.includes('@')) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'Adresse email destinataire invalide' }));
            return;
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
            amount: data.amount ? `${Number(data.amount).toLocaleString('fr-FR')} FCFA` : '20 000 FCFA',
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

          const result = await sendBrevoEmail({
            toEmail,
            toName: passengerName,
            subject,
            htmlContent,
            attachments
          });

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            emailSentTo: toEmail,
            hasPdfAttached: attachments.length > 0,
            ...result
          }));
        } catch (err) {
          console.error('[API send-ticket-email] Erreur:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Envoi du Rappel de Départ (à moins de 2h ou moins de 1h avant le voyage - Sécurisé par jeton)
    if (reqPath === '/api/notifications/send-reminder-email' && req.method === 'POST') {
      if (!verifyApiToken(req, res)) return;
      let body = '';
      req.on('data', chunk => body += chunk);

      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const toEmail = (data.toEmail || data.email || '').trim();
          const passengerName = data.passengerName || 'Voyageur VIP';
          const reminderType = data.reminderType || '2h';

          if (!toEmail || !toEmail.includes('@')) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'Adresse email destinataire invalide' }));
            return;
          }

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

          const result = await sendBrevoEmail({
            toEmail,
            toName: passengerName,
            subject,
            htmlContent,
            attachments: []
          });

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            reminderType,
            emailSentTo: toEmail,
            ...result
          }));
        } catch (err) {
          console.error('[API send-reminder-email] Erreur:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Envoi de Notification de Statut KYC (Approbation ou Rejet - Sécurisé par jeton)
    if (reqPath === '/api/notifications/send-kyc-status-email' && req.method === 'POST') {
      if (!verifyApiToken(req, res)) return;
      let body = '';
      req.on('data', chunk => body += chunk);

      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const toEmail = (data.toEmail || data.email || '').trim().toLowerCase();
          const status = (data.status || '').trim().toLowerCase();
          const passengerName = (data.passengerName || data.name || (data.firstname ? `${data.firstname} ${data.lastname || ''}` : '')).trim() || 'Voyageur VIP';
          const motif = (data.motif || data.comments || '').trim();

          if (!toEmail || !toEmail.includes('@')) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'Adresse email destinataire invalide' }));
            return;
          }

          if (status !== 'approved' && status !== 'rejected') {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'Statut invalide (approved ou rejected attendu)' }));
            return;
          }

          const { buildKycStatusEmailHtml } = require('./api/notifications/send-kyc-status-email.js');
          const htmlContent = buildKycStatusEmailHtml({
            status,
            passengerName,
            motif,
            docType: data.docType
          });

          const subject = status === 'approved' 
            ? '✓ Félicitations ! Votre compte VIP Connect a été validé' 
            : '⚠️ Mise à jour requise : Votre dossier d\'identité VIP Connect';

          const result = await sendBrevoEmail({
            toEmail,
            toName: passengerName,
            subject,
            htmlContent,
            attachments: []
          });

          res.writeHead(200);
          res.end(JSON.stringify({
            success: result.success,
            status,
            emailSentTo: toEmail,
            ...result
          }));
        } catch (err) {
          console.error('[API send-kyc-status-email] Erreur:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // API ROUTER : Passerelle de Paiement Sécurisée
  // -------------------------------------------------------------
  if (reqPath.startsWith('/api/payment/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (reqPath === '/api/payment/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ready',
        secured: true,
        provider: process.env.PAYMENT_PROVIDER || 'Mobile Money Simulation',
        hasApiKey: !!process.env.PAYMENT_API_KEY
      }));
      return;
    }

    if (reqPath === '/api/payment/initiate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const txPrefix = (data.provider || '').includes('Orange') ? 'OM-' : 'MTN-';
          const txId = txPrefix + Math.floor(100000 + Math.random() * 900000);

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            txId: txId,
            message: 'Transaction initiée avec succès dans l environnement sécurisé',
            amount: data.amount,
            phone: data.phone
          }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Données de paiement invalides' }));
        }
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // FICHIERS STATIQUES (Front-end Web & PWA)
  // -------------------------------------------------------------
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 VIP CONNECT - Serveur Prêt pour Déploiement :`);
  console.log(`- Local :   http://127.0.0.1:${PORT}`);
  console.log(`- Réseau :  http://${HOST}:${PORT}`);
  console.log(`- Brevo :   ${process.env.BREVO_API_KEY ? '✅ Connecté' : '⚠️ Non configuré (Mode simulation actif)'}`);
  console.log(`- Supabase: ${process.env.SUPABASE_URL ? '✅ Connecté' : '⚠️ Local'}`);
  console.log(`=======================================================`);
});
