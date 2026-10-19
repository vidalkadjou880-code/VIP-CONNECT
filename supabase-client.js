/**
 * supabase-client.js - Connexion et synchronisation en temps réel avec le projet Supabase
 * Projet : vidalkadjou880-code's Project (ID: ngecktssfnpzcpsjvhhc)
 */

const SUPABASE_CONFIG = {
    url: 'https://ngecktssfnpzcpsjvhhc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZWNrdHNzZm5wemNwc2p2aGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDEyNDEsImV4cCI6MjA5NzYxNzI0MX0.3zAkWkVZXbuxyHRTc0Vk8sXNB9DtS_XdOSH37XftM5k',
    projectId: 'ngecktssfnpzcpsjvhhc'
};

let _supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
        _supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✅ Supabase client initialisé avec succès :', SUPABASE_CONFIG.url);
    } catch (e) {
        console.error('❌ Erreur lors de l\'initialisation de Supabase client:', e);
    }
} else {
    console.warn('⚠️ Librairie Supabase JS non disponible globalement.');
}

const vipSupabase = {
    client: _supabaseClient,
    config: SUPABASE_CONFIG,
    isConnected: false,

    // Tester la connectivité avec le serveur Supabase
    checkConnection: async function() {
        if (!this.client) return false;
        try {
            const { data, error } = await this.client.from('vip_users').select('count', { count: 'exact', head: true });
            if (!error) {
                this.isConnected = true;
                this.updateStatusBadge(true);
                return true;
            }
            console.warn('Supabase ping warning:', error.message);
            this.updateStatusBadge(false);
            return false;
        } catch (err) {
            console.warn('Supabase offline / error:', err);
            this.updateStatusBadge(false);
            return false;
        }
    },

    // Statut de connexion Supabase (badge masqué en production pour l'expérience client)
    updateStatusBadge: function(connected) {
        const existingBadge = document.getElementById('supabase-status-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        if (connected) {
            console.log(`[Supabase] ✅ Cloud Connecté au projet : ${this.config.projectId}`);
        } else {
            console.warn(`[Supabase] ⚠️ Hors-ligne (Cache local actif)`);
        }
    },


    // -------------------------------------------------------------
    // USERS (vip_users)
    // -------------------------------------------------------------
    fetchUsers: async function() {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client.from('vip_users').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                return data.map(u => ({
                    phone: u.phone,
                    firstname: u.firstname,
                    lastname: u.lastname,
                    email: u.email,
                    password: u.password,
                    isAdmin: !!u.is_admin,
                    kyc: u.kyc || { status: 'none' }
                }));
            }
            return null;
        } catch (err) {
            console.warn('Erreur fetchUsers Supabase:', err.message);
            return null;
        }
    },

    saveUser: async function(user) {
        if (!this.client || !user || !user.phone) return;
        try {
            const payload = {
                phone: user.phone,
                firstname: user.firstname || '',
                lastname: user.lastname || '',
                email: user.email || '',
                password: user.password || '',
                is_admin: !!user.isAdmin,
                kyc: user.kyc || { status: 'none' },
                updated_at: new Date().toISOString()
            };
            const { error } = await this.client.from('vip_users').upsert(payload, { onConflict: 'phone' });
            if (error) console.warn('Erreur saveUser Supabase:', error.message);
        } catch (err) {
            console.warn('Exception saveUser Supabase:', err.message);
        }
    },

    // -------------------------------------------------------------
    // RESERVATIONS (vip_reservations)
    // -------------------------------------------------------------
    fetchReservations: async function() {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client.from('vip_reservations').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                return data.map(r => ({
                    id: r.id,
                    date: r.date,
                    time: r.time,
                    route: r.route,
                    phone: r.phone,
                    passengerName: r.passenger_name,
                    txId: r.tx_id,
                    amount: Number(r.amount) || 20000,
                    vehicleId: Number(r.vehicle_id) || 1,
                    seatId: r.seat_id
                }));
            }
            return null;
        } catch (err) {
            console.warn('Erreur fetchReservations Supabase:', err.message);
            return null;
        }
    },

    saveReservation: async function(reservation) {
        if (!this.client || !reservation || !reservation.id) return;
        try {
            const payload = {
                id: reservation.id,
                date: reservation.date,
                time: reservation.time,
                route: reservation.route,
                phone: reservation.phone,
                passenger_name: reservation.passengerName,
                tx_id: reservation.txId,
                amount: reservation.amount,
                vehicle_id: reservation.vehicleId,
                seat_id: reservation.seatId
            };
            const { error } = await this.client.from('vip_reservations').upsert(payload, { onConflict: 'id' });
            if (error) console.warn('Erreur saveReservation Supabase:', error.message);
        } catch (err) {
            console.warn('Exception saveReservation Supabase:', err.message);
        }
    },

    // -------------------------------------------------------------
    // PAYMENTS (vip_payments)
    // -------------------------------------------------------------
    fetchPayments: async function() {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client.from('vip_payments').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                return data.map(p => ({
                    txId: p.tx_id,
                    passengerName: p.passenger_name,
                    phone: p.phone,
                    provider: p.provider,
                    amount: Number(p.amount) || 20000,
                    date: p.date,
                    status: p.status
                }));
            }
            return null;
        } catch (err) {
            console.warn('Erreur fetchPayments Supabase:', err.message);
            return null;
        }
    },

    savePayment: async function(payment) {
        if (!this.client || !payment || !payment.txId) return;
        try {
            const payload = {
                tx_id: payment.txId,
                passenger_name: payment.passengerName,
                phone: payment.phone,
                provider: payment.provider,
                amount: payment.amount,
                date: payment.date,
                status: payment.status || 'success'
            };
            const { error } = await this.client.from('vip_payments').upsert(payload, { onConflict: 'tx_id' });
            if (error) console.warn('Erreur savePayment Supabase:', error.message);
        } catch (err) {
            console.warn('Exception savePayment Supabase:', err.message);
        }
    },

    // -------------------------------------------------------------
    // REVIEWS (vip_reviews)
    // -------------------------------------------------------------
    fetchReviews: async function() {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client.from('vip_reviews').select('*').order('id', { ascending: false });
            if (error) throw error;
            if (data && data.length > 0) {
                return data.map(rv => ({
                    id: Number(rv.id),
                    author: rv.author,
                    role: rv.role,
                    stars: Number(rv.stars) || 5,
                    text: rv.text,
                    date: rv.date
                }));
            }
            return null;
        } catch (err) {
            console.warn('Erreur fetchReviews Supabase:', err.message);
            return null;
        }
    },

    saveReview: async function(review) {
        if (!this.client || !review || !review.id) return;
        try {
            const payload = {
                id: review.id,
                author: review.author,
                role: review.role,
                stars: review.stars,
                text: review.text,
                date: review.date
            };
            const { error } = await this.client.from('vip_reviews').upsert(payload, { onConflict: 'id' });
            if (error) console.warn('Erreur saveReview Supabase:', error.message);
        } catch (err) {
            console.warn('Exception saveReview Supabase:', err.message);
        }
    },

    // -------------------------------------------------------------
    // SUPABASE STORAGE (KYC Documents Réels)
    // -------------------------------------------------------------
    uploadKycDocument: async function(phone, docType, dataUrlOrFile) {
        if (!this.client || !dataUrlOrFile) return null;
        try {
            let blob;
            let ext = 'jpg';
            if (typeof dataUrlOrFile === 'string' && dataUrlOrFile.startsWith('data:')) {
                const parts = dataUrlOrFile.split(',');
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
                const byteString = atob(parts[1]);
                const arrayBuffer = new ArrayBuffer(byteString.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                for (let i = 0; i < byteString.length; i++) {
                    uint8Array[i] = byteString.charCodeAt(i);
                }
                blob = new Blob([arrayBuffer], { type: mime });
            } else if (dataUrlOrFile instanceof Blob || dataUrlOrFile instanceof File) {
                blob = dataUrlOrFile;
                ext = blob.type.includes('png') ? 'png' : 'jpg';
            } else {
                return dataUrlOrFile; // Déjà une URL distante
            }

            const cleanPhone = String(phone).replace(/[^0-9]/g, '');
            const filePath = `${cleanPhone}/${docType}_${Date.now()}.${ext}`;

            const { data, error } = await this.client.storage
                .from('kyc-documents')
                .upload(filePath, blob, {
                    contentType: blob.type || 'image/jpeg',
                    upsert: true
                });

            if (error) {
                console.warn('Erreur téléversement KYC Storage:', error.message);
                return null;
            }

            const { data: publicData } = this.client.storage
                .from('kyc-documents')
                .getPublicUrl(filePath);

            console.log(`Document KYC ${docType} téléversé avec succès sur Supabase Storage :`, publicData.publicUrl);
            return publicData.publicUrl;
        } catch (err) {
            console.error('Exception uploadKycDocument:', err);
            return null;
        }
    },

    // -------------------------------------------------------------
    // SUPABASE AUTH (Envoi d'email avec code OTP à 6 chiffres)
    // -------------------------------------------------------------
    sendAuthOtp: async function(email) {
        if (!this.client || !email) return { success: false, error: "Email requis ou Supabase indisponible" };
        try {
            const currentOrigin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://10.1.1.11:3000';
            const redirectUrl = `${currentOrigin}${window.location.pathname}`;
            const { data, error } = await this.client.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: redirectUrl
                }
            });
            if (error) {
                console.warn("Erreur Supabase signInWithOtp:", error.message);
                return { success: false, error: error.message };
            }
            return { success: true, data };
        } catch (err) {
            console.error("Exception sendAuthOtp:", err);
            return { success: false, error: err.message };
        }
    },

    verifyAuthOtp: async function(email, token) {
        if (!this.client) return { success: false, error: "Client non disponible" };
        try {
            console.log(`Tentative de validation OTP pour ${email} avec le code ${token}...`);
            let res = await this.client.auth.verifyOtp({
                email: email,
                token: token,
                type: 'email'
            });
            if (res.error) {
                console.warn("Échec type 'email', tentative type 'magiclink':", res.error.message);
                res = await this.client.auth.verifyOtp({
                    email: email,
                    token: token,
                    type: 'magiclink'
                });
            }
            if (res.error) {
                console.warn("Échec type 'magiclink', tentative type 'signup':", res.error.message);
                res = await this.client.auth.verifyOtp({
                    email: email,
                    token: token,
                    type: 'signup'
                });
            }
            if (res.error) {
                console.error("Échec définitif vérification OTP:", res.error.message);
                return { success: false, error: res.error.message };
            }
            console.log("✅ Code OTP validé avec succès par Supabase !");
            return { success: true, session: res.data?.session, user: res.data?.user };
        } catch (err) {
            console.error("Exception verifyAuthOtp:", err);
            return { success: false, error: err.message };
        }
    },

    sendPasswordResetOtp: async function(email) {
        if (!this.client || !email) return { success: false, error: "Email requis" };
        try {
            const currentOrigin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://10.1.1.11:3000';
            const redirectUrl = `${currentOrigin}${window.location.pathname}`;
            const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl
            });
            if (error) return { success: false, error: error.message };
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    verifyPasswordResetOtp: async function(email, token, newPassword) {
        if (!this.client) return { success: false, error: "Client non disponible" };
        try {
            let verifyRes = await this.client.auth.verifyOtp({
                email: email,
                token: token,
                type: 'recovery'
            });
            if (verifyRes.error) {
                verifyRes = await this.client.auth.verifyOtp({
                    email: email,
                    token: token,
                    type: 'email'
                });
            }
            if (verifyRes.error) {
                return { success: false, error: verifyRes.error.message };
            }

            const { data: updateData, error: updateError } = await this.client.auth.updateUser({
                password: newPassword
            });
            if (updateError) {
                return { success: false, error: updateError.message };
            }

            return { success: true, user: updateData.user };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

window.vipSupabase = vipSupabase;
