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
    checkConnection: async function () {
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
    updateStatusBadge: function (connected) {
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
    fetchUsers: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_users').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mockPhones = ['671234567', '694567890', '650112233', '699445566', '699999999', '677777777', '688888888'];
                return data
                    .filter(u => !mockPhones.includes(String(u.phone || '').replace(/[^0-9]/g, '')) && !String(u.email || '').includes('business.cm'))
                    .map(u => ({
                        phone: u.phone,
                        firstname: u.firstname,
                        lastname: u.lastname,
                        email: u.email,
                        password: u.password,
                        isAdmin: !!u.is_admin,
                        kyc: u.kyc || { status: 'none' }
                    }));
            }
            return [];
        } catch (err) {
            console.warn('Erreur fetchUsers Supabase:', err.message);
            return [];
        }
    },

    saveUser: async function (user) {
        if (!this.client || !user || !user.phone) return { success: false, error: "Utilisateur ou téléphone manquant" };
        // Ne jamais sauvegarder de faux comptes de test
        const cleanPhone = String(user.phone || '').replace(/[^0-9]/g, '');
        if (['671234567', '694567890', '650112233', '699445566'].includes(cleanPhone)) {
            return { success: false, error: "Numéro de test ignoré" };
        }

        try {
            const normEmail = String(user.email || '').trim().toLowerCase();
            const normPhone = String(user.phone || '').replace(/[^0-9]/g, '').replace(/^237/, '');
            const finalPhone = normPhone || String(user.phone || '').trim();

            // Si un compte existe déjà avec la même adresse email (mais un autre format de téléphone), on met à jour celui-là au lieu de créer un doublon
            if (normEmail) {
                const { data: existingByEmail } = await this.client
                    .from('vip_users')
                    .select('phone')
                    .ilike('email', normEmail)
                    .limit(1);

                if (existingByEmail && existingByEmail.length > 0 && existingByEmail[0].phone !== finalPhone) {
                    const existingPhone = existingByEmail[0].phone;
                    const { data, error } = await this.client
                        .from('vip_users')
                        .update({
                            firstname: user.firstname || '',
                            lastname: user.lastname || '',
                            email: normEmail,
                            password: user.password || '',
                            is_admin: !!user.isAdmin,
                            kyc: user.kyc || { status: 'none' },
                            updated_at: new Date().toISOString()
                        })
                        .eq('phone', existingPhone);
                    if (error) {
                        console.warn('Erreur update saveUser Supabase:', error.message);
                        return { success: false, error: error.message };
                    }
                    return { success: true, data };
                }
            }

            const payload = {
                phone: finalPhone,
                firstname: user.firstname || '',
                lastname: user.lastname || '',
                email: normEmail,
                password: user.password || '',
                is_admin: !!user.isAdmin,
                kyc: user.kyc || { status: 'none' },
                updated_at: new Date().toISOString()
            };
            const { data, error } = await this.client.from('vip_users').upsert(payload, { onConflict: 'phone' });
            if (error) {
                console.warn('Erreur saveUser Supabase:', error.message);
                return { success: false, error: error.message };
            }
            console.log(`[Supabase] ✅ Utilisateur ${user.phone} (${user.firstname} ${user.lastname}) enregistré avec succès.`);
            return { success: true, data };
        } catch (err) {
            console.warn('Exception saveUser Supabase:', err.message);
            return { success: false, error: err.message };
        }
    },

    // -------------------------------------------------------------
    // RESERVATIONS (vip_reservations)
    // -------------------------------------------------------------
    fetchReservations: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_reservations').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                return data
                    .filter(r => !['VIP-RES-901', 'VIP-RES-902'].includes(r.id))
                    .map(r => ({
                        id: r.id,
                        date: r.date,
                        time: r.time,
                        route: r.route,
                        phone: r.phone,
                        passengerName: r.passenger_name,
                        txId: r.tx_id,
                        amount: Number(r.amount) || 20000,
                        vehicleId: Number(r.vehicle_id) || 1,
                        seatId: r.seat_id,
                        boarded: !!r.boarded,
                        boardedAt: r.boarded_at || null,
                        driverName: r.driver_name || ''
                    }));
            }
            return [];
        } catch (err) {
            console.warn('Erreur fetchReservations Supabase:', err.message);
            return [];
        }
    },

    saveReservation: async function (reservation) {
        if (!this.client || !reservation || !reservation.id) return;
        // Ne jamais sauvegarder les réservations de test
        if (['VIP-RES-901', 'VIP-RES-902'].includes(reservation.id)) return;

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
    fetchPayments: async function () {
        if (!this.client) return [];
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
            return [];
        } catch (err) {
            console.warn('Erreur fetchPayments Supabase:', err.message);
            return [];
        }
    },

    savePayment: async function (payment) {
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
    fetchReviews: async function () {
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

    saveReview: async function (review) {
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
    uploadKycDocument: async function (phone, docType, dataUrlOrFile) {
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
    sendAuthOtp: async function (email, metadata = {}) {
        if (!this.client || !email) return { success: false, error: "Email requis ou Supabase indisponible" };
        try {
            const currentOrigin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'https://vip-connect.vercel.app';
            const redirectUrl = `${currentOrigin}${window.location.pathname}`;
            const { data, error } = await this.client.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: redirectUrl,
                    data: metadata
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

    verifyAuthOtp: async function (email, token) {
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

    sendPasswordResetOtp: async function (email) {
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

    verifyPasswordResetOtp: async function (email, token, newPassword) {
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
    },

    // -------------------------------------------------------------
    // SUIVI GPS TEMPS RÉEL DES VÉHICULES (vip_vehicle_locations)
    // -------------------------------------------------------------
    fetchVehicleLocation: async function (vehicleId = 1) {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client
                .from('vip_vehicle_locations')
                .select('*')
                .eq('vehicle_id', vehicleId)
                .maybeSingle();
            if (error) {
                console.warn('[GPS] Table vip_vehicle_locations indisponible:', error.message);
                return null;
            }
            return data || null;
        } catch (err) {
            return null;
        }
    },

    updateVehicleLocation: async function (loc) {
        if (!this.client || !loc) return { success: false, error: 'Supabase indisponible' };
        try {
            const payload = {
                vehicle_id: Number(loc.vehicleId || loc.vehicle_id || 1),
                vehicle_name: loc.vehicleName || loc.vehicle_name || 'Changan VIP #1',
                route: loc.route || 'Douala - Yaoundé',
                lat: Number(loc.lat),
                lng: Number(loc.lng),
                speed_kmh: Number(loc.speedKmh || loc.speed_kmh || 0),
                heading: Number(loc.heading || 0),
                status: loc.status || 'en_route',
                driver_name: loc.driverName || loc.driver_name || '',
                driver_phone: loc.driverPhone || loc.driver_phone || '',
                updated_at: new Date().toISOString()
            };
            const { data, error } = await this.client
                .from('vip_vehicle_locations')
                .upsert(payload, { onConflict: 'vehicle_id' });
            if (error) return { success: false, error: error.message };
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    fetchAllVehicleLocations: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_vehicle_locations').select('*');
            if (error) return [];
            return data || [];
        } catch (err) {
            return [];
        }
    },

    // -------------------------------------------------------------
    // CHAUFFEURS (vip_drivers)
    // -------------------------------------------------------------
    fetchDrivers: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_drivers').select('*').order('created_at', { ascending: false });
            if (error) return [];
            return (data || []).map(d => ({
                id: d.id,
                firstname: d.firstname,
                lastname: d.lastname,
                email: d.email,
                phone: d.phone,
                vehicleName: d.vehicle_name || 'Changan VIP #1',
                vehiclePlate: d.vehicle_plate || '',
                password: d.password || '',
                passwordSet: !!d.password_set,
                inviteToken: d.invite_token || '',
                status: d.status || 'actif'
            }));
        } catch (err) {
            return [];
        }
    },

    saveDriver: async function (driver) {
        if (!this.client || !driver || !driver.id) return { success: false };
        try {
            const payload = {
                id: driver.id,
                firstname: driver.firstname || '',
                lastname: driver.lastname || '',
                email: String(driver.email || '').trim().toLowerCase(),
                phone: String(driver.phone || '').trim(),
                vehicle_name: driver.vehicleName || 'Changan VIP #1',
                vehicle_plate: driver.vehiclePlate || '',
                password: driver.password || '',
                password_set: !!driver.passwordSet,
                invite_token: driver.inviteToken || '',
                status: driver.status || 'actif',
                updated_at: new Date().toISOString()
            };
            const { error } = await this.client.from('vip_drivers').upsert(payload, { onConflict: 'id' });
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    deleteDriver: async function (driverId) {
        if (!this.client || !driverId) return { success: false };
        try {
            const { error } = await this.client.from('vip_drivers').delete().eq('id', driverId);
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // -------------------------------------------------------------
    // VOYAGES / HISTORIQUE CHAUFFEURS (vip_trips)
    // -------------------------------------------------------------
    fetchTrips: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_trips').select('*').order('started_at', { ascending: false });
            if (error) return [];
            return (data || []).map(t => ({
                id: t.id,
                date: t.date,
                time: t.time,
                route: t.route,
                driverId: t.driver_id,
                driverName: t.driver_name,
                driverPhone: t.driver_phone,
                vehicleId: Number(t.vehicle_id) || 1,
                vehicleName: t.vehicle_name || 'Changan VIP #1',
                status: t.status || 'en_cours',
                startedAt: t.started_at,
                endedAt: t.ended_at
            }));
        } catch (err) {
            return [];
        }
    },

    saveTrip: async function (trip) {
        if (!this.client || !trip || !trip.id) return { success: false };
        try {
            const payload = {
                id: trip.id,
                date: trip.date,
                time: trip.time,
                route: trip.route,
                driver_id: trip.driverId || '',
                driver_name: trip.driverName || '',
                driver_phone: trip.driverPhone || '',
                vehicle_id: Number(trip.vehicleId) || 1,
                vehicle_name: trip.vehicleName || 'Changan VIP #1',
                status: trip.status || 'en_cours',
                started_at: trip.startedAt || new Date().toISOString(),
                ended_at: trip.endedAt || null
            };
            const { error } = await this.client.from('vip_trips').upsert(payload, { onConflict: 'id' });
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // -------------------------------------------------------------
    // EMBARQUEMENT QR CODE & PARAMÈTRES CODE PIN (vip_settings)
    // -------------------------------------------------------------
    fetchReservationById: async function (resId) {
        if (!this.client || !resId) return null;
        try {
            const { data, error } = await this.client.from('vip_reservations').select('*').eq('id', resId).maybeSingle();
            if (error || !data) return null;
            return {
                id: data.id,
                date: data.date,
                time: data.time,
                route: data.route,
                phone: data.phone,
                passengerName: data.passenger_name,
                txId: data.tx_id,
                amount: Number(data.amount) || 20000,
                vehicleId: Number(data.vehicle_id) || 1,
                seatId: data.seat_id,
                boarded: !!data.boarded,
                boardedAt: data.boarded_at || null
            };
        } catch (err) {
            return null;
        }
    },

    markReservationBoarded: async function (resId, boardedAtIso) {
        if (!this.client || !resId) return { success: false };
        try {
            const { error } = await this.client
                .from('vip_reservations')
                .update({ boarded: true, boarded_at: boardedAtIso || new Date().toISOString() })
                .eq('id', resId);
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    getSetting: async function (key) {
        if (!this.client || !key) return null;
        try {
            const { data, error } = await this.client.from('vip_settings').select('value').eq('key', key).maybeSingle();
            if (error || !data) return null;
            return data.value;
        } catch (err) {
            return null;
        }
    },

    setSetting: async function (key, value) {
        if (!this.client || !key) return { success: false };
        try {
            const { error } = await this.client
                .from('vip_settings')
                .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // -------------------------------------------------------------
    // ALERTES SOS CLIENTS (vip_sos_alerts)
    // -------------------------------------------------------------
    fetchSosAlerts: async function () {
        if (!this.client) return [];
        try {
            const { data, error } = await this.client.from('vip_sos_alerts').select('*').order('created_at', { ascending: false }).limit(20);
            if (error) return [];
            return data || [];
        } catch (err) {
            return [];
        }
    },

    saveSosAlert: async function (alertObj) {
        if (!this.client || !alertObj) return { success: false };
        try {
            const { error } = await this.client.from('vip_sos_alerts').insert({
                id: alertObj.id,
                user_name: alertObj.userName || 'Passager VIP',
                user_phone: alertObj.userPhone || '',
                user_email: alertObj.userEmail || '',
                lat: alertObj.lat || null,
                lng: alertObj.lng || null,
                message: alertObj.message || 'Alerte SOS maintenue 3 secondes',
                status: alertObj.status || 'active',
                created_at: alertObj.createdAt || new Date().toISOString()
            });
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    resolveSosAlert: async function (id) {
        if (!this.client || !id) return { success: false };
        try {
            const { error } = await this.client.from('vip_sos_alerts').update({ status: 'resolved' }).eq('id', id);
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // Envoi réel d'un e-mail d'activation au chauffeur via Supabase Auth (arrive directement dans sa boîte mail)
    sendDriverInviteEmailViaSupabase: async function (email, setupUrl, metadata = {}) {
        if (!this.client || !email) return { success: false, error: 'Supabase Auth indisponible' };
        try {
            const { data, error } = await this.client.auth.signInWithOtp({
                email: String(email).trim().toLowerCase(),
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: setupUrl,
                    data: {
                        role: 'driver',
                        firstname: metadata.firstname || '',
                        lastname: metadata.lastname || '',
                        phone: metadata.phone || '',
                        vehicleName: metadata.vehicleName || 'Changan VIP #1'
                    }
                }
            });
            if (error) {
                console.warn('[Supabase Auth Driver Invite] Erreur:', error.message);
                return { success: false, error: error.message };
            }
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

window.vipSupabase = vipSupabase;
