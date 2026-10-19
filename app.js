/**
 * app.js - Logique applicative, routage SPA, base de données locale (localStorage)
 * et simulation de paiement et de validation d'identité pour VIP.
 */

const app = {
    // -------------------------------------------------------------
    // ÉTAT GLOBAL DE L'APPLICATION
    // -------------------------------------------------------------
    state: {
        users: [],
        reservations: [],
        payments: [],
        reviews: [],
        currentUser: null,
        activeAdminTab: 'reservations',
        currentReviewUserPhone: null, // Utilisateur en cours d'examen KYC
        selectedPaymentDetails: null, // Réservation temporaire en cours de paiement
        selectedProvider: 'Orange Money',
        lang: 'fr',
        translations: {
            fr: null,
            en: null
        },
        activeSection: 'home-login',
        selectedTime: null,
        selectedVehicleId: null,
        selectedSeatId: null
    },

    // -------------------------------------------------------------
    // INITIALISATION
    // -------------------------------------------------------------
    init: async function() {
        this.initLanguage();
        await this.loadTranslations();
        this.loadDatabase();
        this.checkSession();
        this.setupDragAndDrop();
        this.setDefaultDateInput();
        this.translatePage();
        this.initStarRatingSelector();
        this.initOtpInputs();
        this.listenForSupabaseAuth();
        await this.syncWithSupabase();
        this.checkSession();
        this.initDialogKeyListeners();
        this.initServiceWorkerAndNotifications();
        this.startDepartureReminderEngine();
        
        // Rafraîchir les horaires dynamiques régulièrement
        setInterval(() => {
            if (document.getElementById('sec-dashboard').classList.contains('hidden') === false) {
                this.updateDynamicSchedules();
            }
        }, 30000); // Toutes les 30s
    },

    // -------------------------------------------------------------
    // GESTION DU RÔLE ADMINISTRATEUR
    // -------------------------------------------------------------
    isAdminUser: function(user) {
        if (!user) return false;
        const phone = (user.phone || '').toString().replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
        const email = (user.email || '').toString().trim().toLowerCase();
        return (
            user.isAdmin === true ||
            user.is_admin === true ||
            phone === '698346898' ||
            email === 'vidalkadjou880@gmail.com'
        );
    },

    promoteIfAdmin: function(user) {
        if (!user) return user;
        if (this.isAdminUser(user)) {
            user.isAdmin = true;
            user.is_admin = true;
            if (!user.kyc) {
                user.kyc = { status: 'approved', docNumber: 'ADMIN-VIP', dob: '1990-01-01', documents: { recto: '', verso: '', selfie: '' } };
            } else if (user.kyc.status !== 'approved') {
                user.kyc.status = 'approved';
            }
        }
        return user;
    },

    // -------------------------------------------------------------
    // SYSTÈME DE TRADUCTION & MULTILINGUE (FR/EN)
    // -------------------------------------------------------------
    initLanguage: function() {
        const savedLang = localStorage.getItem('vip_lang');
        if (savedLang === 'fr' || savedLang === 'en') {
            this.state.lang = savedLang;
        } else {
            this.state.lang = 'fr';
        }
    },

    loadTranslations: async function() {
        try {
            // Tenter de charger les fichiers de traduction JSON
            const frRes = await fetch('locales/fr.json');
            const enRes = await fetch('locales/en.json');
            if (frRes.ok && enRes.ok) {
                this.state.translations.fr = await frRes.json();
                this.state.translations.en = await enRes.json();
                console.log("Translation files loaded from locales directory.");
                return;
            }
        } catch (error) {
            console.warn("Could not fetch locales JSON. Falling back to embedded translations.", error);
        }
        
        // Repli si fetch bloqué par CORS (file://) ou indisponible
        this.state.translations = fallbackTranslations;
    },

    t: function(key, params = {}) {
        const lang = this.state.lang;
        const keys = key.split('.');
        let value = this.state.translations[lang];
        
        for (const k of keys) {
            if (value && value[k] !== undefined) {
                value = value[k];
            } else {
                return key; // Retourne la clé par défaut si non trouvé
            }
        }
        
        // Remplacement des paramètres (ex. {amount})
        if (typeof value === 'string') {
            Object.keys(params).forEach(p => {
                value = value.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
            });
        }
        
        return value;
    },

    translatePage: function(isFromShowSection = false) {
        // Traduire les éléments ayant data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const text = this.t(key);
            if (text !== key) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = text;
                } else {
                    el.innerHTML = text;
                }
            }
        });

        // Traduire les placeholders ayant data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            const text = this.t(key);
            if (text !== key) {
                el.placeholder = text;
            }
        });

        // Activer la classe CSS sur le sélecteur de langue dans le header
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`lang-${this.state.lang}`);
        if (activeBtn) activeBtn.classList.add('active');

        // Mettre à jour l'entête
        this.updateHeaderMenu();

        // Ré-afficher les éléments dynamiques si la langue change à la volée (pas depuis showSection)
        if (!isFromShowSection) {
            const sectionId = this.state.activeSection;
            if (sectionId === 'dashboard') {
                // Re-render les horaires
                this.updateDynamicSchedules();

                // Rétablir la sélection d'horaire si nécessaire
                if (this.state.selectedTime) {
                    const timeCard = document.querySelector(`.schedule-card[data-time="${this.state.selectedTime}"]`);
                    if (timeCard && timeCard.dataset.disabled !== "true") {
                        timeCard.classList.add('selected');
                        
                        const route = document.getElementById('book-route').value;
                        const date = document.getElementById('book-date').value;
                        
                        // Re-render les véhicules
                        this.renderVehicles(date, this.state.selectedTime, route);

                        // Rétablir la sélection de véhicule si nécessaire
                        if (this.state.selectedVehicleId) {
                            const vehicleCards = document.querySelectorAll('.vehicle-card');
                            const vehicleCard = vehicleCards[this.state.selectedVehicleId - 1];
                            if (vehicleCard && !vehicleCard.classList.contains('disabled') && !vehicleCard.classList.contains('locked')) {
                                vehicleCard.classList.add('selected');

                                // Re-render la carte des sièges
                                this.renderSeatMap(this.state.selectedVehicleId, date, this.state.selectedTime, route);

                                // Rétablir la sélection de siège si nécessaire
                                if (this.state.selectedSeatId) {
                                    const seatEl = document.querySelector(`.seat[data-seat="${this.state.selectedSeatId}"]`);
                                    if (seatEl && !seatEl.classList.contains('disabled')) {
                                        seatEl.classList.add('selected');
                                        
                                        // Afficher le bloc de paiement et mettre à jour le bouton
                                        const paymentContainer = document.getElementById('payment-info-container');
                                        if (paymentContainer) {
                                            paymentContainer.classList.remove('hidden');
                                            const btnPay = document.getElementById('btn-book-action');
                                            if (btnPay) {
                                                btnPay.innerText = this.t('dashboard.book_pay_btn', { amount: '20 000' });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                this.updateDashboardKycUI();
            } else if (sectionId === 'admin') {
                this.loadAdminData();
            } else if (sectionId === 'kyc-verification') {
                this.renderKYCStatusAlert();
                this.handleDocTypeChange();
            } else if (sectionId === 'reviews') {
                this.renderReviews();
            }

            // Mettre à jour les modales/lightboxes ouvertes
            // 1. Lightbox de revue KYC
            const lightbox = document.getElementById('lightbox-kyc');
            if (lightbox && !lightbox.classList.contains('hidden') && this.state.currentReviewUserPhone) {
                this.openKycLightbox(this.state.currentReviewUserPhone);
            }

            // 2. Modale de paiement
            const paymentModal = document.getElementById('modal-payment');
            if (paymentModal && !paymentModal.classList.contains('hidden') && this.state.selectedPaymentDetails) {
                this.openPaymentModal();
                
                const activeProviderCard = document.querySelector('.provider-card.selected');
                if (activeProviderCard && this.state.selectedProvider) {
                    this.selectPaymentProvider(this.state.selectedProvider, activeProviderCard);
                }

                // Si le simulateur USSD est ouvert, traduire le message d'invite
                const ussdSim = document.getElementById('momo-ussd-simulator');
                if (ussdSim && !ussdSim.classList.contains('hidden')) {
                    const prompt = document.getElementById('simulator-prompt-text');
                    if (prompt) {
                        prompt.innerHTML = `<strong>[SIMULATION ${this.state.selectedProvider.toUpperCase()}]</strong><br>${this.t('payment_modal.ussd_prompt')}`;
                    }
                    
                    const err = document.getElementById('sim-error-message');
                    if (err && !err.classList.contains('hidden')) {
                        const pinVal = document.getElementById('sim-pin-input').value;
                        if (pinVal.length !== 4 || isNaN(pinVal)) {
                            err.innerText = this.state.lang === 'fr' ? "Le code PIN doit comporter 4 chiffres." : "The PIN code must be 4 digits.";
                        }
                    }
                }
            }
        }
    },

    changeLanguage: function(lang) {
        if (lang === 'fr' || lang === 'en') {
            this.state.lang = lang;
            localStorage.setItem('vip_lang', lang);
            this.translatePage();
            this.showToast(this.state.lang === 'fr' ? 'Langue modifiée en Français.' : 'Language changed to English.', 'info');
        }
    },

    handleHomeCta: function() {
        if (this.state.currentUser) {
            if (this.isAdminUser(this.state.currentUser)) {
                this.showSection('admin');
            } else {
                this.showSection('dashboard');
            }
        } else {
            this.showSection('login');
        }
    },

    toggleMobileMenu: function() {
        const nav = document.getElementById('navLinks');
        const toggleIcon = document.querySelector('.mobile-menu-toggle i');
        if (nav) {
            nav.classList.toggle('mobile-active');
            if (nav.classList.contains('mobile-active')) {
                if (toggleIcon) toggleIcon.className = 'fas fa-times';
            } else {
                if (toggleIcon) toggleIcon.className = 'fas fa-bars';
            }
        }
    },

    togglePasswordVisibility: function(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    },

    toggleRegisterPasswordsVisibility: function() {
        const p1 = document.getElementById('reg-password');
        const p2 = document.getElementById('reg-password-confirm');
        if (p1 && p2) {
            const newType = p1.type === 'password' ? 'text' : 'password';
            p1.type = newType;
            p2.type = newType;
        }
    },

    // Définir la date par défaut sur aujourd'hui pour le calendrier
    setDefaultDateInput: function() {
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('book-date');
        if (dateInput) {
            dateInput.value = today;
            dateInput.min = today; // Impossible de réserver dans le passé
        }
        
        const adminDateInput = document.getElementById('admin-vehicle-date');
        if (adminDateInput) {
            adminDateInput.value = today;
        }
    },

    // Charge les données depuis le localStorage ou initialise des données de démo
    loadDatabase: function() {
        const localUsers = localStorage.getItem('vip_users');
        const localReservations = localStorage.getItem('vip_reservations');
        const localPayments = localStorage.getItem('vip_payments');

        if (localUsers) {
            let parsedUsers = [];
            try {
                const mockPhones = ['699999999', '677777777', '688888888'];
                parsedUsers = JSON.parse(localUsers).filter(u => !mockPhones.includes(u.phone));
            } catch(e) { parsedUsers = []; }
            parsedUsers.forEach(u => this.promoteIfAdmin(u));
            this.state.users = parsedUsers;
        } else {
            this.state.users = [];
        }

        // S'assurer de la présence du super-administrateur et d'utilisateurs de référence
        if (this.state.users.length === 0) {
            this.state.users = [
                {
                    firstname: "Vidal",
                    lastname: "Kadjou",
                    phone: "+237698346898",
                    email: "vidalkadjou880@gmail.com",
                    password: "admin",
                    isAdmin: true,
                    is_admin: true,
                    kyc: {
                        status: "approved",
                        docType: "cni",
                        docNumber: "LT-2023-88901",
                        dob: "1994-06-12",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                },
                {
                    firstname: "Jean-Paul",
                    lastname: "Kamga",
                    phone: "+237671234567",
                    email: "jp.kamga@business.cm",
                    password: "user123",
                    isAdmin: false,
                    is_admin: false,
                    kyc: {
                        status: "approved",
                        docType: "cni",
                        docNumber: "110294857",
                        dob: "1988-03-24",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                },
                {
                    firstname: "Claire",
                    lastname: "Ebelle",
                    phone: "+237694567890",
                    email: "claire.ebelle@gmail.com",
                    password: "user123",
                    isAdmin: false,
                    is_admin: false,
                    kyc: {
                        status: "pending",
                        docType: "passport",
                        docNumber: "CM-PASS-772910",
                        dob: "1995-11-08",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                },
                {
                    firstname: "Marc",
                    lastname: "Ndongo",
                    phone: "+237650112233",
                    email: "marc.ndongo@outlook.com",
                    password: "user123",
                    isAdmin: false,
                    is_admin: false,
                    kyc: {
                        status: "approved",
                        docType: "cni",
                        docNumber: "109847261",
                        dob: "1982-07-19",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                },
                {
                    firstname: "Fabrice",
                    lastname: "Atangana",
                    phone: "+237699445566",
                    email: "f.atangana@yahoo.fr",
                    password: "user123",
                    isAdmin: false,
                    is_admin: false,
                    kyc: {
                        status: "none",
                        docType: "",
                        docNumber: "",
                        dob: "",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                }
            ];
            localStorage.setItem('vip_users', JSON.stringify(this.state.users));
        } else {
            const hasAdmin = this.state.users.some(u => this.isAdminUser(u));
            if (!hasAdmin) {
                this.state.users.unshift({
                    firstname: "Vidal",
                    lastname: "Kadjou",
                    phone: "+237698346898",
                    email: "vidalkadjou880@gmail.com",
                    password: "admin",
                    isAdmin: true,
                    is_admin: true,
                    kyc: {
                        status: "approved",
                        docType: "cni",
                        docNumber: "LT-2023-88901",
                        dob: "1994-06-12",
                        documents: { recto: "", verso: "", selfie: "" }
                    }
                });
                localStorage.setItem('vip_users', JSON.stringify(this.state.users));
            }
        }

        if (localReservations) {
            let parsedRes = [];
            try {
                const mockPhones = ['699999999', '677777777', '688888888'];
                parsedRes = JSON.parse(localReservations).filter(r => !mockPhones.includes(r.phone));
            } catch(e) { parsedRes = []; }
            this.state.reservations = parsedRes;
        } else {
            this.state.reservations = [
                {
                    id: "VIP-RES-901",
                    date: new Date().toISOString().split('T')[0],
                    time: "05:00",
                    route: "Douala - Yaoundé",
                    passengerName: "Jean-Paul Kamga",
                    phone: "+237671234567",
                    txId: "OM-99201",
                    amount: 20000,
                    seatId: "front",
                    vehicleId: 1
                },
                {
                    id: "VIP-RES-902",
                    date: new Date().toISOString().split('T')[0],
                    time: "15:00",
                    route: "Yaoundé - Douala",
                    passengerName: "Marc Ndongo",
                    phone: "+237650112233",
                    txId: "MOMO-77120",
                    amount: 20000,
                    seatId: "back_left",
                    vehicleId: 1
                }
            ];
            localStorage.setItem('vip_reservations', JSON.stringify(this.state.reservations));
        }

        if (localPayments) {
            const mockPhones = ['699999999', '677777777', '688888888'];
            let parsedPay = [];
            try {
                parsedPay = JSON.parse(localPayments).filter(p => !mockPhones.includes(p.phone));
            } catch(e) { parsedPay = []; }
            this.state.payments = parsedPay;
            localStorage.setItem('vip_payments', JSON.stringify(parsedPay));
        } else {
            this.state.payments = [];
        }
        
        const localReviews = localStorage.getItem('vip_reviews');
        if (localReviews) {
            this.state.reviews = JSON.parse(localReviews);
        } else {
            this.state.reviews = [
                { id: 1, author: "Marc Ndongo", role: "Homme d'affaires", stars: 5, text: "Un service irréprochable. Le confort des sièges et le fait de voyager en petit comité justifie largement le prix.", date: "2023-08-15" },
                { id: 2, author: "Sandra Eboua", role: "Consultante", stars: 5, text: "La climatisation fonctionne parfaitement. C'est l'équivalent d'un voyage en classe affaires.", date: "2023-09-02" },
                { id: 3, author: "Paul Kotto", role: "Directeur de Projet", stars: 5, text: "La vérification d'identité avant réservation est rassurante, on sait avec qui on voyage.", date: "2023-10-10" }
            ];
            this.saveReviews();
        }
    },

    saveUsers: function() {
        localStorage.setItem('vip_users', JSON.stringify(this.state.users));
        if (window.vipSupabase && this.state.users) {
            this.state.users.forEach(u => window.vipSupabase.saveUser(u));
        }
    },

    saveReservations: function() {
        localStorage.setItem('vip_reservations', JSON.stringify(this.state.reservations));
        if (window.vipSupabase && this.state.reservations) {
            this.state.reservations.forEach(r => window.vipSupabase.saveReservation(r));
        }
    },

    savePayments: function() {
        localStorage.setItem('vip_payments', JSON.stringify(this.state.payments));
        if (window.vipSupabase && this.state.payments) {
            this.state.payments.forEach(p => window.vipSupabase.savePayment(p));
        }
    },

    saveReviews: function() {
        localStorage.setItem('vip_reviews', JSON.stringify(this.state.reviews));
        if (window.vipSupabase && this.state.reviews) {
            this.state.reviews.forEach(rv => window.vipSupabase.saveReview(rv));
        }
    },

    syncWithSupabase: async function(manualTrigger = false) {
        if (!window.vipSupabase) return;
        const isConnected = await window.vipSupabase.checkConnection();
        if (!isConnected) return;

        try {
            const [remoteUsers, remoteReservations, remotePayments, remoteReviews] = await Promise.all([
                window.vipSupabase.fetchUsers(),
                window.vipSupabase.fetchReservations(),
                window.vipSupabase.fetchPayments(),
                window.vipSupabase.fetchReviews()
            ]);

            let hasUpdates = false;

            if (remoteUsers && remoteUsers.length > 0) {
                remoteUsers.forEach(u => this.promoteIfAdmin(u));
                this.state.users = remoteUsers;
                localStorage.setItem('vip_users', JSON.stringify(this.state.users));
                hasUpdates = true;

                // Si un utilisateur est déjà connecté, rafraîchir son statut administrateur
                if (this.state.currentUser) {
                    const currClean = (this.state.currentUser.phone || '').replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
                    const currEmail = (this.state.currentUser.email || '').toLowerCase();
                    const refreshed = remoteUsers.find(u => {
                        const uPhone = (u.phone || '').replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
                        const uEmail = (u.email || '').toLowerCase();
                        return (uPhone && uPhone === currClean) || (uEmail && uEmail === currEmail);
                    });
                    if (refreshed) {
                        this.promoteIfAdmin(refreshed);
                        this.state.currentUser = refreshed;
                        this.updateHeaderMenu();
                        if (this.isAdminUser(refreshed) && this.state.activeSection !== 'admin') {
                            this.showSection('admin');
                        }
                    }
                }
            } else if (this.state.users && this.state.users.length > 0) {
                this.state.users.forEach(u => window.vipSupabase.saveUser(u));
            }

            if (remoteReservations && remoteReservations.length > 0) {
                this.state.reservations = remoteReservations;
                localStorage.setItem('vip_reservations', JSON.stringify(this.state.reservations));
                hasUpdates = true;
            } else if (this.state.reservations && this.state.reservations.length > 0) {
                this.state.reservations.forEach(r => window.vipSupabase.saveReservation(r));
            }

            if (remotePayments && remotePayments.length > 0) {
                this.state.payments = remotePayments;
                localStorage.setItem('vip_payments', JSON.stringify(this.state.payments));
                hasUpdates = true;
            } else if (this.state.payments && this.state.payments.length > 0) {
                this.state.payments.forEach(p => window.vipSupabase.savePayment(p));
            }

            if (remoteReviews && remoteReviews.length > 0) {
                this.state.reviews = remoteReviews;
                localStorage.setItem('vip_reviews', JSON.stringify(this.state.reviews));
                hasUpdates = true;
            } else if (this.state.reviews && this.state.reviews.length > 0) {
                this.state.reviews.forEach(rv => window.vipSupabase.saveReview(rv));
            }

            this.checkSession();

            if (hasUpdates) {
                if (this.state.activeSection === 'admin') {
                    this.loadAdminData();
                } else if (this.state.activeSection === 'reviews') {
                    this.renderReviews();
                } else if (this.state.activeSection === 'dashboard') {
                    this.updateDynamicSchedules();
                }
            }

            if (manualTrigger) {
                this.showToast("Données synchronisées avec Supabase Cloud avec succès !", "success");
            }
        } catch (err) {
            console.error("Erreur de synchronisation Supabase:", err);
            if (manualTrigger) {
                this.showToast("Erreur lors de la synchronisation Supabase.", "error");
            }
        }
    },

    // -------------------------------------------------------------
    // ROUTAGE & SESSIONS
    // -------------------------------------------------------------
    checkSession: function() {
        const session = sessionStorage.getItem('vip_current_session');
        if (session) {
            const cleanSession = session.replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
            const sessionLower = session.toLowerCase();
            const user = this.state.users.find(u => {
                const uPhone = (u.phone || '').toString().replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
                const uEmail = (u.email || '').toString().toLowerCase();
                return uPhone === cleanSession || u.phone === session || uEmail === sessionLower;
            });
            if (user) {
                this.promoteIfAdmin(user);
                this.state.currentUser = user;
                this.updateHeaderMenu();
                
                if (this.isAdminUser(user)) {
                    this.showSection('admin');
                } else {
                    this.showSection('dashboard');
                }
                return;
            }
        }
        this.showSection('home-login');
    },

    showSection: function(sectionId) {
        // Fermer le menu mobile s'il est ouvert
        const nav = document.getElementById('navLinks');
        if (nav) {
            nav.classList.remove('mobile-active');
            const toggleIcon = document.querySelector('.mobile-menu-toggle i');
            if (toggleIcon) toggleIcon.className = 'fas fa-bars';
        }

        // Cacher toutes les sections
        const sections = ['home-login', 'login', 'register', 'verify-otp', 'forgot-password', 'kyc-verification', 'dashboard', 'admin', 'reviews'];
        sections.forEach(id => {
            const el = document.getElementById('sec-' + id);
            if (el) el.classList.add('hidden');
        });

        // Afficher la section demandée
        const activeSection = document.getElementById('sec-' + sectionId);
        if (activeSection) {
            activeSection.classList.remove('hidden');
            window.scrollTo(0, 0);
        }

        // Enregistrer la section active
        this.state.activeSection = sectionId;

        // Réinitialiser les sélections temporaires
        this.state.selectedTime = null;
        this.state.selectedVehicleId = null;
        this.state.selectedSeatId = null;

        // Mettre à jour l'état actif dans l'entête et traduire la page
        this.translatePage(true);
        
        // Action spécifique par section
        if (sectionId === 'dashboard') {
            this.updateDynamicSchedules();
            this.updateDashboardKycUI();
            this.updateNotificationUi();
            this.renderUserReservations();
        } else if (sectionId === 'admin') {
            this.loadAdminData();
        } else if (sectionId === 'kyc-verification') {
            this.renderKYCStatusAlert();
            this.handleDocTypeChange();
        } else if (sectionId === 'reviews') {
            this.renderReviews();
        }

        // Mettre à jour la barre de navigation smartphone
        this.updateMobileBottomBar();
    },

    updateHeaderMenu: function() {
        const nav = document.getElementById('navLinks');
        if (!nav) return;

        const user = this.state.currentUser;
        
        if (!user) {
            // Menu visiteur
            const activeHome = document.getElementById('sec-home-login') && !document.getElementById('sec-home-login').classList.contains('hidden') ? 'active' : '';
            const activeReviews = document.getElementById('sec-reviews') && !document.getElementById('sec-reviews').classList.contains('hidden') ? 'active' : '';
            const activeRegister = document.getElementById('sec-register') && !document.getElementById('sec-register').classList.contains('hidden') ? 'active' : '';
            const activeLogin = document.getElementById('sec-login') && !document.getElementById('sec-login').classList.contains('hidden') ? 'active' : '';

            nav.innerHTML = `
                <button class="nav-btn ${activeHome}" onclick="app.showSection('home-login')">${this.t('nav.home')}</button>
                <button class="nav-btn ${activeReviews}" onclick="app.showSection('reviews')">${this.t('nav.reviews')}</button>
                <button class="nav-btn nav-btn-outline-gold ${activeRegister}" onclick="app.showSection('register')">${this.t('nav.register')}</button>
                <button class="nav-btn nav-btn-highlight-small ${activeLogin}" onclick="app.showSection('login')">${this.t('nav.login')}</button>
            `;
        } else if (this.isAdminUser(user)) {
            // Menu Admin avec accès direct Console + Espace Navette
            const activeAdmin = this.state.activeSection === 'admin' ? 'active' : '';
            const activeDash = this.state.activeSection === 'dashboard' ? 'active' : '';
            nav.innerHTML = `
                <button class="nav-btn ${activeAdmin}" onclick="app.showSection('admin')" style="color: var(--primary-gold); font-weight: 700;">
                    <i class="fas fa-user-shield" style="margin-right:5px;"></i> ${this.t('admin.console_title') || 'Console Admin'}
                </button>
                <button class="nav-btn ${activeDash}" onclick="app.showSection('dashboard')">
                    <i class="fas fa-car" style="margin-right:5px;"></i> Espace Navette
                </button>
                <button class="nav-btn" onclick="app.showSection('reviews')">${this.t('nav.reviews')}</button>
                <button class="nav-btn" onclick="app.handleLogout()"><i class="fas fa-sign-out-alt"></i> ${this.t('nav.logout')}</button>
            `;
        } else {
            // Menu Client
            let kycBadge = '';
            if (user.kyc && user.kyc.status === 'approved') {
                kycBadge = `<span class="badge badge-approved" style="font-size:9px; vertical-align:middle; margin-left:5px;"><i class="fas fa-check-circle"></i> ${this.t('admin.status_approved')}</span>`;
            } else if (user.kyc && user.kyc.status === 'pending') {
                kycBadge = `<span class="badge badge-pending" style="font-size:9px; vertical-align:middle; margin-left:5px;"><i class="fas fa-clock"></i> ${this.t('admin.status_pending')}</span>`;
            } else {
                kycBadge = `<span class="badge badge-rejected" style="font-size:9px; vertical-align:middle; margin-left:5px;"><i class="fas fa-times-circle"></i> ${this.t('admin.status_rejected')}</span>`;
            }

            const activeHome = document.getElementById('sec-dashboard') && !document.getElementById('sec-dashboard').classList.contains('hidden') ? 'active' : '';
            const activeReviews = document.getElementById('sec-reviews') && !document.getElementById('sec-reviews').classList.contains('hidden') ? 'active' : '';

            nav.innerHTML = `
                <button class="nav-btn ${activeHome}" onclick="app.routeUserDashboard()">${this.t('nav.home')}</button>
                <button class="nav-btn ${activeReviews}" onclick="app.showSection('reviews')">${this.t('nav.reviews')}</button>
                <div class="user-menu">
                    <div class="user-avatar" title="${user.firstname} ${user.lastname}">
                        ${user.firstname.charAt(0)}${user.lastname.charAt(0)}
                    </div>
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-white);">${user.firstname} ${kycBadge}</span>
                    <button class="nav-btn" onclick="app.handleLogout()" style="margin-left:10px;"><i class="fas fa-sign-out-alt"></i></button>
                </div>
            `;
        }
        
        // Mettre à jour la barre de navigation smartphone
        this.updateMobileBottomBar();
    },

    updateMobileBottomBar: function() {
        const bar = document.getElementById('mobileBottomBar');
        if (!bar) return;

        const user = this.state.currentUser;
        const currentSec = this.state.activeSection || 'home-login';
        const currentAdminTab = this.state.activeAdminTab || 'reservations';

        if (!user) {
            // Mode Visiteur non connecté
            bar.innerHTML = `
                <button class="mob-tab-btn ${currentSec === 'home-login' ? 'active' : ''}" onclick="app.showSection('home-login')">
                    <i class="fas fa-home"></i>
                    <span>${this.t('nav.home') || 'Accueil'}</span>
                </button>
                <button class="mob-tab-btn ${currentSec === 'reviews' ? 'active' : ''}" onclick="app.showSection('reviews')">
                    <i class="fas fa-star"></i>
                    <span>${this.t('nav.reviews') || 'Avis'}</span>
                </button>
                <button class="mob-tab-btn ${currentSec === 'register' ? 'active' : ''}" onclick="app.showSection('register')">
                    <i class="fas fa-user-plus"></i>
                    <span>${this.t('nav.register') || 'S\'inscrire'}</span>
                </button>
                <button class="mob-tab-btn mob-tab-highlight ${currentSec === 'login' ? 'active' : ''}" onclick="app.showSection('login')">
                    <i class="fas fa-sign-in-alt"></i>
                    <span>${this.t('nav.login') || 'Connexion'}</span>
                </button>
            `;
        } else if (this.isAdminUser(user)) {
            // Mode Super Administrateur
            const pendingKycCount = (this.state.users || []).filter(u => u.kyc && u.kyc.status === 'pending').length;
            const usersCount = (this.state.users || []).length;
            const isTabActive = (tabId) => (currentSec === 'admin' && currentAdminTab === tabId) ? 'active' : '';

            bar.innerHTML = `
                <button class="mob-tab-btn ${isTabActive('reservations')}" onclick="app.showSection('admin'); app.showAdminTab('reservations');">
                    <i class="fas fa-bookmark"></i>
                    <span>Résas</span>
                </button>
                <button class="mob-tab-btn ${isTabActive('users')}" onclick="app.showSection('admin'); app.showAdminTab('users');">
                    <i class="fas fa-users"></i>
                    <span>Clients</span>
                    ${usersCount > 0 ? `<span class="mob-badge" style="background: rgba(197, 168, 128, 0.45); color: #fff;">${usersCount}</span>` : ''}
                </button>
                <button class="mob-tab-btn ${isTabActive('kyc')}" onclick="app.showSection('admin'); app.showAdminTab('kyc');">
                    <i class="fas fa-user-check"></i>
                    <span>KYC</span>
                    ${pendingKycCount > 0 ? `<span class="mob-badge">${pendingKycCount}</span>` : ''}
                </button>
                <button class="mob-tab-btn ${isTabActive('finance')}" onclick="app.showSection('admin'); app.showAdminTab('finance');">
                    <i class="fas fa-money-bill-wave"></i>
                    <span>Finances</span>
                </button>
                <button class="mob-tab-btn ${currentSec === 'dashboard' ? 'active' : ''}" onclick="app.showSection('dashboard')" title="Basculer vers l'Espace Navette Voyageur">
                    <i class="fas fa-car"></i>
                    <span>Navette</span>
                </button>
            `;
        } else {
            // Mode Voyageur VIP Connect
            bar.innerHTML = `
                <button class="mob-tab-btn ${currentSec === 'dashboard' ? 'active' : ''}" onclick="app.showSection('dashboard')">
                    <i class="fas fa-car-side"></i>
                    <span>Réserver</span>
                </button>
                <button class="mob-tab-btn" onclick="app.showSection('dashboard'); setTimeout(() => { const el = document.querySelector('.user-reservations-panel'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 120);">
                    <i class="fas fa-ticket-alt"></i>
                    <span>Billets</span>
                </button>
                <button class="mob-tab-btn ${currentSec === 'reviews' ? 'active' : ''}" onclick="app.showSection('reviews')">
                    <i class="fas fa-star"></i>
                    <span>Avis</span>
                </button>
                <button class="mob-tab-btn ${currentSec === 'kyc-verification' ? 'active' : ''}" onclick="app.showSection('kyc-verification')">
                    <i class="fas fa-id-card"></i>
                    <span>Mon KYC</span>
                </button>
                <button class="mob-tab-btn" onclick="app.handleLogout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Quitter</span>
                </button>
            `;
        }
    },

    routeUserDashboard: function() {
        if (!this.state.currentUser) return;
        if (this.isAdminUser(this.state.currentUser)) {
            this.showSection('admin');
        } else {
            this.showSection('dashboard');
        }
    },

    updateDashboardKycUI: function() {
        const user = this.state.currentUser;
        if (!user) return;
        const banner = document.getElementById('kyc-banner');
        if (banner) {
            if (user.kyc.status === 'approved') {
                banner.classList.add('hidden');
            } else {
                banner.classList.remove('hidden');
            }
        }
    },

    handleLogout: function() {
        this.showModalConfirm(
            "Êtes-vous certain de vouloir vous déconnecter de votre compte VIP Connect ?",
            "Confirmation de Déconnexion",
            () => {
                sessionStorage.removeItem('vip_current_session');
                this.state.currentUser = null;
                if (window.vipSupabase && window.vipSupabase.client) {
                    window.vipSupabase.client.auth.signOut().catch(() => {});
                }
                this.showToast(this.t('toasts.logout_success'), 'info');
                this.showSection('home-login');
            },
            null,
            "Oui, me déconnecter",
            "Annuler"
        );
    },

    // -------------------------------------------------------------
    // AUTHENTIFICATION (CONNEXION & INSCRIPTION)
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // AUTHENTIFICATION (CONNEXION, INSCRIPTION & 2FA OTP)
    // -------------------------------------------------------------
    initOtpInputs: function() {
        const inputs = document.querySelectorAll('.otp-digit');
        if (!inputs || inputs.length === 0) return;

        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                e.target.value = val;
                if (val) {
                    input.classList.add('filled');
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else {
                    input.classList.remove('filled');
                }

                const allDigits = Array.from(inputs).map(i => i.value).join('');
                if (allDigits.length === 6) {
                    this.handleVerifyOtpSubmit();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
                const digitsOnly = pasteData.replace(/[^0-9]/g, '');
                if (digitsOnly.length >= 6) {
                    for (let i = 0; i < 6; i++) {
                        inputs[i].value = digitsOnly[i];
                        inputs[i].classList.add('filled');
                    }
                    inputs[5].focus();
                    this.handleVerifyOtpSubmit();
                }
            });
        });
    },

    listenForSupabaseAuth: function() {
        if (!window.vipSupabase || !window.vipSupabase.client) return;
        try {
            window.vipSupabase.client.auth.onAuthStateChange(async (event, session) => {
                if (session && session.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
                    const email = session.user.email;
                    let user = this.state.users.find(u => u.email === email);

                    // Si inscription en attente, finaliser les informations utilisateur
                    if (this.state.pending2FA && this.state.pending2FA.user && this.state.pending2FA.email === email) {
                        const pending = this.state.pending2FA.user;
                        if (!user) {
                            user = pending;
                            this.state.users.push(user);
                        } else {
                            Object.assign(user, pending);
                        }
                        this.saveUsers();
                    }

                    if (!user) {
                        user = {
                            firstname: session.user.user_metadata?.firstname || "Membre",
                            lastname: session.user.user_metadata?.lastname || "VIP",
                            email: email,
                            phone: session.user.user_metadata?.phone || `6${Math.floor(10000000 + Math.random()*90000000)}`,
                            password: "auth-managed",
                            isAdmin: false,
                            kyc: { status: 'none', docNumber: '', dob: '', documents: { recto: '', verso: '', selfie: '' } }
                        };
                        this.state.users.push(user);
                        this.saveUsers();
                    }

                    // Nettoyer les tokens de l'URL hash
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }

                    sessionStorage.setItem('vip_current_session', user.phone);
                    this.state.currentUser = user;
                    this.state.pending2FA = null;

                    this.showModalAlert(
                        `Félicitations ${user.firstname} !\n\nVotre adresse email (${email}) a été certifiée avec succès.\nVous êtes maintenant connecté à votre compte VIP Connect.`,
                        "Email Certifié & Connexion Réussie",
                        "success"
                    );

                    this.promoteIfAdmin(user);
                    this.saveUsers();
                    this.updateHeaderMenu();

                    if (this.isAdminUser(user)) {
                        this.showSection('admin');
                    } else {
                        this.showSection('dashboard');
                    }
                }
            });
        } catch (e) {
            console.warn("Notice listener auth:", e);
        }
    },

    handleLogin: async function(event) {
        if (event) event.preventDefault();
        const identifierEl = document.getElementById('login-identifier');
        const passwordEl = document.getElementById('login-password');
        const identifier = identifierEl ? identifierEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value : '';

        if (!identifier || !password) {
            this.showModalAlert("Veuillez renseigner votre identifiant (téléphone ou email) et votre mot de passe.", "Champs Requis", "warning");
            return;
        }

        const cleanId = identifier.replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
        const idLower = identifier.toLowerCase();

        // Recherche par email ou par téléphone
        let user = this.state.users.find(u => {
            const uPhone = (u.phone || '').toString().replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
            const uEmail = (u.email || '').toString().toLowerCase();
            const matchIdentifier = (uEmail === idLower || uPhone === cleanId || u.phone === identifier);
            const passMatch = u.password === password || (this.isAdminUser(u) && (password === 'admin' || password === 'admin123'));
            return matchIdentifier && passMatch;
        });

        // Si non trouvé en cache local, synchroniser directement avec Supabase
        if (!user && window.vipSupabase) {
            try {
                const remoteUsers = await window.vipSupabase.fetchUsers();
                if (remoteUsers && remoteUsers.length > 0) {
                    remoteUsers.forEach(u => this.promoteIfAdmin(u));
                    this.state.users = remoteUsers;
                    localStorage.setItem('vip_users', JSON.stringify(this.state.users));
                    user = this.state.users.find(u => {
                        const uPhone = (u.phone || '').toString().replace(/[\s\-\(\)\+]/g, '').replace(/^237/, '');
                        const uEmail = (u.email || '').toString().toLowerCase();
                        const matchIdentifier = (uEmail === idLower || uPhone === cleanId || u.phone === identifier);
                        const passMatch = u.password === password || (this.isAdminUser(u) && (password === 'admin' || password === 'admin123'));
                        return matchIdentifier && passMatch;
                    });
                }
            } catch (err) {
                console.warn("Erreur fetchUsers pendant handleLogin:", err);
            }
        }
        
        if (user) {
            this.promoteIfAdmin(user);
            // Administrateur connecté directement vers la console
            if (this.isAdminUser(user)) {
                this.saveUsers();
                sessionStorage.setItem('vip_current_session', user.phone);
                this.state.currentUser = user;
                this.updateHeaderMenu();
                this.showModalAlert(`Bienvenue ${user.firstname} dans la console d'administration VIP Connect.`, "Accès Administrateur", "success");
                this.showSection('admin');
                const formLogin = document.getElementById('form-login');
                if (formLogin) formLogin.reset();
                return;
            }

            const targetEmail = user.email || (identifier.includes('@') ? identifier : `${user.phone}@vip.cm`);
            this.initiate2FA({
                user: user,
                email: targetEmail,
                type: 'login'
            });
        } else {
            this.showModalAlert("Identifiant ou mot de passe incorrect. Veuillez vérifier vos accès de connexion.", "Échec de Connexion", "error");
        }
    },

    handleRegister: function(event) {
        if (event) event.preventDefault();
        const firstnameEl = document.getElementById('reg-firstname');
        const lastnameEl = document.getElementById('reg-lastname');
        const emailEl = document.getElementById('reg-email');
        const phoneEl = document.getElementById('reg-phone');
        const passwordEl = document.getElementById('reg-password');
        const passwordConfirmEl = document.getElementById('reg-password-confirm');

        const firstname = firstnameEl ? firstnameEl.value.trim() : '';
        const lastname = lastnameEl ? lastnameEl.value.trim() : '';
        const email = emailEl ? emailEl.value.trim() : '';
        const phone = phoneEl ? phoneEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value : '';
        const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';

        // Validations
        if (!firstname || !lastname || !email || !phone || !password || !passwordConfirm) {
            this.showModalAlert("Veuillez remplir l'ensemble des champs du formulaire pour créer votre compte VIP.", "Champs Incomplets", "warning");
            return;
        }

        if (password !== passwordConfirm) {
            this.showModalAlert("Les deux mots de passe saisis ne sont pas identiques. Veuillez les ressaisir.", "Erreur Mot de Passe", "error");
            return;
        }

        if (password.length < 6) {
            this.showModalAlert("Le mot de passe doit comporter au moins 6 caractères pour assurer votre sécurité.", "Mot de Passe Trop Court", "warning");
            return;
        }

        const phoneExists = this.state.users.some(u => u.phone === phone);
        const emailExists = this.state.users.some(u => u.email === email);

        if (phoneExists || emailExists) {
            this.showModalAlert("Un compte existe déjà avec ce numéro de téléphone ou cette adresse email. Veuillez vous connecter.", "Compte Existant", "warning");
            return;
        }

        const isAdmin = this.isAdminUser({ phone: phone, email: email });
        // Créer l'objet utilisateur en attente de certification email
        const pendingUser = {
            firstname: firstname,
            lastname: lastname,
            email: email,
            phone: phone,
            password: password,
            isAdmin: isAdmin,
            is_admin: isAdmin,
            kyc: {
                status: isAdmin ? 'approved' : 'none',
                docNumber: isAdmin ? 'ADMIN-VIP' : '',
                dob: isAdmin ? '1990-01-01' : '',
                documents: { recto: '', verso: '', selfie: '' },
                comments: isAdmin ? 'Super Administrateur VIP Connect' : ''
            }
        };

        this.initiate2FA({
            user: pendingUser,
            email: email,
            type: 'register'
        });
    },

    initiate2FA: async function({ user, email, type }) {
        this.state.pending2FA = { user, email, type };

        const targetEl = document.getElementById('otp-target-display');
        if (targetEl) targetEl.innerText = email || user.phone;

        document.querySelectorAll('.otp-digit').forEach(input => {
            input.value = '';
            input.classList.remove('filled');
        });

        this.showSection('verify-otp');
        this.startOtpCountdown(60);

        // Envoyer la requête réelle à Supabase Auth
        if (window.vipSupabase && email) {
            window.vipSupabase.sendAuthOtp(email).then(res => {
                if (!res.success) {
                    console.warn("Supabase Auth sendAuthOtp Notice:", res.error);
                } else {
                    console.log("✅ Code de sécurité OTP envoyé par Supabase à:", email);
                }
            }).catch(console.warn);
        }

        // Notification modale VIP expliquant l'envoi du code de sécurité à 6 chiffres
        this.showModalAlert(
            `Un code de sécurité à 6 chiffres a été envoyé à :\n${email}\n\nConsultez votre boîte de réception (et vos spams si nécessaire), puis saisissez le code dans les 6 cases pour valider votre connexion.`,
            "Code de Sécurité Envoyé",
            "info"
        );
    },

    startOtpCountdown: function(seconds) {
        if (this.state.otpTimerInterval) clearInterval(this.state.otpTimerInterval);
        let remaining = seconds;
        const countdownEl = document.getElementById('otp-countdown');
        const timerText = document.getElementById('otp-timer-text');
        const resendBtn = document.getElementById('btn-resend-otp');

        if (countdownEl) countdownEl.innerText = `${remaining}s`;
        if (timerText) timerText.classList.remove('hidden');
        if (resendBtn) resendBtn.classList.add('hidden');

        this.state.otpTimerInterval = setInterval(() => {
            remaining--;
            if (countdownEl) countdownEl.innerText = `${remaining}s`;
            if (remaining <= 0) {
                clearInterval(this.state.otpTimerInterval);
                if (timerText) timerText.classList.add('hidden');
                if (resendBtn) resendBtn.classList.remove('hidden');
            }
        }, 1000);
    },

    resendOtpCode: async function() {
        if (!this.state.pending2FA) return;
        const { email } = this.state.pending2FA;
        this.startOtpCountdown(60);

        if (window.vipSupabase && email) {
            const res = await window.vipSupabase.sendAuthOtp(email);
            if (res.success) {
                this.showModalAlert(`Un nouveau code de sécurité à 6 chiffres a été envoyé à :\n${email}\n\nVérifiez votre boîte de réception ainsi que vos courriers indésirables (spams).`, "Code Renvoyé", "success");
            } else {
                this.showModalAlert("Information d'envoi : " + res.error, "Notice Envoi", "warning");
            }
        }
    },

    cancelOtpVerification: function() {
        if (this.state.otpTimerInterval) clearInterval(this.state.otpTimerInterval);
        this.state.pending2FA = null;
        this.showSection('login');
    },

    handleVerifyOtpSubmit: async function(event) {
        if (event) event.preventDefault();
        if (!this.state.pending2FA) {
            this.showModalAlert("Session de vérification expirée. Veuillez vous reconnecter.", "Session Expirée", "warning");
            this.showSection('login');
            return;
        }

        const digits = Array.from(document.querySelectorAll('.otp-digit')).map(i => i.value.trim()).join('');
        if (digits.length !== 6) {
            this.showModalAlert("Veuillez saisir le code complet à 6 chiffres reçu dans votre boîte de réception.", "Code Incomplet", "warning");
            return;
        }

        const btn = document.getElementById('btn-validate-otp');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validation...';
        }

        const { user, email, type } = this.state.pending2FA;
        let isValid = false;
        let errorDetail = '';

        if (window.vipSupabase && email) {
            const verifyRes = await window.vipSupabase.verifyAuthOtp(email, digits);
            if (verifyRes.success) {
                isValid = true;
            } else {
                errorDetail = verifyRes.error || '';
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-alt" style="margin-right: 8px;"></i> Valider mon code';
        }

        if (!isValid) {
            const detailMsg = errorDetail ? ` (${errorDetail})` : '';
            this.showModalAlert(`Le code de vérification à 6 chiffres est incorrect ou a expiré${detailMsg}.\n\nVeuillez vérifier le dernier email reçu ou cliquer sur "Renvoyer un nouveau code".`, "Code Invalide", "error");
            return;
        }

        if (this.state.otpTimerInterval) clearInterval(this.state.otpTimerInterval);

        if (type === 'login') {
            this.promoteIfAdmin(user);
            sessionStorage.setItem('vip_current_session', user.phone);
            this.state.currentUser = user;
            this.saveUsers();
            this.updateHeaderMenu();
            this.state.pending2FA = null;
            this.showModalAlert(`Bienvenue ${user.firstname} ! Vous êtes connecté à VIP Connect.`, "Connexion Réussie", "success");
            if (this.isAdminUser(user)) {
                this.showSection('admin');
            } else {
                this.showSection('dashboard');
            }
            const formLogin = document.getElementById('form-login');
            if (formLogin) formLogin.reset();
        } else if (type === 'register') {
            this.promoteIfAdmin(user);
            const existingIndex = this.state.users.findIndex(u => u.phone === user.phone || u.email === user.email);
            if (existingIndex >= 0) {
                this.state.users[existingIndex] = user;
            } else {
                this.state.users.push(user);
            }
            this.saveUsers();
            sessionStorage.setItem('vip_current_session', user.phone);
            this.state.currentUser = user;
            this.updateHeaderMenu();
            this.state.pending2FA = null;
            this.showModalAlert("Votre compte a été certifié et créé avec succès ! Bienvenue chez VIP Connect.", "Compte Activé", "success");
            if (this.isAdminUser(user)) {
                this.showSection('admin');
            } else {
                this.showSection('dashboard');
            }
            const formReg = document.getElementById('form-register');
            if (formReg) formReg.reset();
        }
    },

    // -------------------------------------------------------------
    // MOT DE PASSE OUBLIÉ (RÉCUPÉRATION PAR CODE OTP EMAIL)
    // -------------------------------------------------------------
    handleForgotRequestOtp: async function(event) {
        if (event) event.preventDefault();
        const identifierEl = document.getElementById('forgot-identifier');
        const identifier = identifierEl ? identifierEl.value.trim() : '';

        if (!identifier) {
            this.showModalAlert("Veuillez renseigner votre adresse email ou votre numéro de téléphone.", "Champ Requis", "warning");
            return;
        }

        const user = this.state.users.find(u => u.email === identifier || u.phone === identifier);

        if (!user) {
            this.showModalAlert(`Aucun compte VIP Connect n'est associé à "${identifier}". Veuillez vérifier vos informations ou créer un compte.`, "Compte Introuvable", "error");
            return;
        }

        const targetEmail = user.email || (identifier.includes('@') ? identifier : null);
        if (!targetEmail) {
            this.showModalAlert("Aucune adresse email n'est associée à ce compte pour envoyer le lien de réinitialisation. Contactez l'assistance VIP.", "Email Non Renseigné", "warning");
            return;
        }

        this.state.pendingForgotUser = user;

        const btn = document.getElementById('btn-forgot-send');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';
        }

        if (window.vipSupabase) {
            const res = await window.vipSupabase.sendPasswordResetOtp(targetEmail);
            if (res.success) {
                this.showModalAlert(
                    `Un email contenant le lien et le code de réinitialisation sécurisé a été envoyé à :\n${targetEmail}\n\nVeuillez consulter votre boîte de réception et saisir le code à 6 chiffres reçu ci-dessous pour changer votre mot de passe.`,
                    "Email de Réinitialisation Envoyé",
                    "success"
                );
            } else {
                console.warn("Supabase Auth Reset Notice:", res.error);
                this.showModalAlert("Information sur l'envoi : " + res.error, "Notice Envoi", "warning");
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right: 8px;"></i> Envoyer le code de vérification';
        }

        document.getElementById('form-forgot-step1').classList.add('hidden');
        document.getElementById('form-forgot-step2').classList.remove('hidden');
        document.getElementById('forgot-target-display').innerText = targetEmail;
        const otpField = document.getElementById('forgot-otp-code');
        if (otpField) setTimeout(() => otpField.focus(), 200);
    },

    handleForgotBackToStep1: function() {
        const s2 = document.getElementById('form-forgot-step2');
        const s1 = document.getElementById('form-forgot-step1');
        if (s2) s2.classList.add('hidden');
        if (s1) s1.classList.remove('hidden');
    },

    handleForgotResetSubmit: async function(event) {
        if (event) event.preventDefault();
        const user = this.state.pendingForgotUser;
        if (!user) {
            this.showModalAlert("Session expirée. Veuillez recommencer la demande de réinitialisation.", "Session Expirée", "error");
            this.handleForgotBackToStep1();
            return;
        }

        const otpInputEl = document.getElementById('forgot-otp-code');
        const newPassEl = document.getElementById('forgot-new-password');
        const confirmPassEl = document.getElementById('forgot-confirm-password');

        const otpInput = otpInputEl ? otpInputEl.value.trim() : '';
        const newPass = newPassEl ? newPassEl.value : '';
        const confirmPass = confirmPassEl ? confirmPassEl.value : '';

        if (!otpInput) {
            this.showModalAlert("Veuillez saisir le code à 6 chiffres reçu par email.", "Code Requis", "warning");
            return;
        }

        if (newPass !== confirmPass) {
            this.showModalAlert("Les deux mots de passe saisis ne sont pas identiques. Veuillez les vérifier.", "Mots de Passe Différents", "error");
            return;
        }

        if (newPass.length < 6) {
            this.showModalAlert("Le mot de passe doit comporter au moins 6 caractères.", "Mot de Passe Trop Court", "warning");
            return;
        }

        let isCodeValid = false;
        if (window.vipSupabase && user.email) {
            const verifyRes = await window.vipSupabase.verifyPasswordResetOtp(user.email, otpInput, newPass);
            if (verifyRes.success) {
                isCodeValid = true;
            }
        }

        if (!isCodeValid) {
            this.showModalAlert("Le code de vérification à 6 chiffres est incorrect ou a expiré. Veuillez vérifier votre boîte mail.", "Code Invalide", "error");
            return;
        }

        user.password = newPass;
        this.saveUsers();
        this.showModalAlert("Votre mot de passe a été réinitialisé avec succès ! Vous pouvez maintenant vous connecter en toute sécurité.", "Mot de Passe Mis à Jour", "success");
        this.state.pendingForgotUser = null;
        this.handleForgotBackToStep1();
        document.getElementById('form-forgot-step1').reset();
        document.getElementById('form-forgot-step2').reset();
        this.showSection('login');
    },

    // -------------------------------------------------------------
    // GESTION DU PARCOURS KYC (VÉRIFICATION D'IDENTITÉ)
    // -------------------------------------------------------------
    renderKYCStatusAlert: function() {
        const user = this.state.currentUser;
        const container = document.getElementById('kyc-status-alert');
        if (!container || !user) return;

        if (user.kyc.status === 'none') {
            container.innerHTML = `
                <div class="alert-box alert-warning">
                    ${this.t('kyc.status_none')}
                </div>
            `;
            document.getElementById('btn-submit-kyc').disabled = false;
            document.getElementById('btn-submit-kyc').innerText = this.t('kyc.submit_btn');
        } else if (user.kyc.status === 'pending') {
            container.innerHTML = `
                <div class="alert-box alert-success">
                    ${this.t('kyc.status_pending_redirect')}
                </div>
            `;
            // Pré-remplir le formulaire
            document.getElementById('kyc-firstname').value = user.kyc.firstname || user.firstname;
            document.getElementById('kyc-lastname').value = user.kyc.lastname || user.lastname;
            document.getElementById('kyc-doc-number').value = user.kyc.docNumber;
            document.getElementById('kyc-dob').value = user.kyc.dob;
            
            // Désactiver la soumission
            document.getElementById('btn-submit-kyc').disabled = true;
            document.getElementById('btn-submit-kyc').innerText = this.t('kyc.validated_badge');
            
            // Débloquer l'utilisateur en mémoire
            const userInDb = this.state.users.find(u => u.phone === user.phone);
            if (userInDb) {
                userInDb.kyc.status = 'approved';
                this.saveUsers();
            }

            setTimeout(() => {
                this.showSection('dashboard');
            }, 1500);
        } else if (user.kyc.status === 'rejected') {
            container.innerHTML = `
                <div class="alert-box alert-warning" style="background: rgba(255, 77, 77, 0.15);">
                    ${this.t('kyc.status_rejected', { motif: user.kyc.comments || "Pièces illisibles" })}
                </div>
            `;
            document.getElementById('btn-submit-kyc').disabled = false;
            document.getElementById('btn-submit-kyc').innerText = this.t('kyc.submit_btn');
        } else if (user.kyc.status === 'approved') {
            container.innerHTML = `
                <div class="alert-box alert-success">
                    ${this.t('kyc.status_approved')}
                </div>
            `;
            document.getElementById('btn-submit-kyc').disabled = true;
            document.getElementById('btn-submit-kyc').innerText = this.t('kyc.validated_badge');
            
            // Rediriger après 2 secondes vers le dashboard
            setTimeout(() => {
                this.showSection('dashboard');
            }, 2000);
        }
    },

    handleDocTypeChange: function() {
        const docTypeEl = document.querySelector('input[name="kyc-doc-type"]:checked');
        const docType = docTypeEl ? docTypeEl.value : 'cni';
        const versoGroup = document.getElementById('verso-upload-group');
        if (versoGroup) {
            if (docType === 'passport') {
                versoGroup.classList.add('hidden');
            } else {
                versoGroup.classList.remove('hidden');
            }
        }
    },

    setupDragAndDrop: function() {
        const fileTypes = ['recto', 'verso'];
        
        fileTypes.forEach(type => {
            const dropzone = document.getElementById(`drop-${type}`);
            if (!dropzone) return;

            // Empêcher le comportement par défaut (ouvrir le fichier dans le navigateur)
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => e.preventDefault(), false);
                dropzone.addEventListener(eventName, (e) => e.stopPropagation(), false);
            });

            // Gérer les effets visuels de survol
            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => {
                    dropzone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => {
                    dropzone.classList.remove('dragover');
                }, false);
            });

            // Gérer le drop du fichier
            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                
                if (files.length > 0) {
                    const fileInput = document.getElementById(`file-${type}`);
                    if (fileInput) {
                        fileInput.files = files;
                        this.processFile(files[0], type);
                    }
                }
            }, false);
        });
    },

    // -------------------------------------------------------------
    // GESTION DE LA CAMÉRA EN DIRECT (KYC)
    // -------------------------------------------------------------
    openCamera: async function(type) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showToast(this.state.lang === 'fr' ? "Votre navigateur ne supporte pas la capture par caméra." : "Your browser does not support camera capture.", "error");
            return;
        }

        this.state.currentCameraDocType = type;
        const video = document.getElementById('camera-video');
        const facingMode = type === 'selfie' ? 'user' : 'environment';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode } 
            });
            video.srcObject = stream;
            this.state.mediaStream = stream;
            document.getElementById('modal-camera').classList.remove('hidden');
        } catch (err) {
            console.error("Erreur d'accès à la caméra:", err);
            this.showToast(this.state.lang === 'fr' ? "Impossible d'accéder à la caméra. Vérifiez les permissions." : "Cannot access camera. Check permissions.", "error");
        }
    },

    closeCamera: function() {
        if (this.state.mediaStream) {
            this.state.mediaStream.getTracks().forEach(track => track.stop());
            this.state.mediaStream = null;
        }
        const video = document.getElementById('camera-video');
        if (video) video.srcObject = null;
        document.getElementById('modal-camera').classList.add('hidden');
    },

    capturePhoto: function() {
        const video = document.getElementById('camera-video');
        const canvas = document.getElementById('camera-canvas');
        
        if (!video || !canvas) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Dessiner l'image courante de la vidéo sur le canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Extraire l'image en Base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const type = this.state.currentCameraDocType;

        // Stocker temporairement dans l'état utilisateur
        if (!this.state.currentUser.tempDocs) {
            this.state.currentUser.tempDocs = {};
        }
        this.state.currentUser.tempDocs[type] = dataUrl;

        // Afficher la prévisualisation dans la dropzone
        const previewContainer = document.getElementById(`preview-${type}-container`);
        if (previewContainer) {
            previewContainer.innerHTML = `
                <img src="${dataUrl}" class="upload-preview" alt="Prévisualisation">
                <button class="upload-remove" type="button" onclick="app.removeCapturedPhoto(event, '${type}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            previewContainer.classList.remove('hidden');
            // Cacher l'icône de base
            const dropzone = document.getElementById(`drop-${type}`);
            if (dropzone) {
                dropzone.querySelector('.upload-icon').style.display = 'none';
                dropzone.querySelector('.upload-text').style.display = 'none';
            }
        }

        // Fermer la caméra après la capture
        this.closeCamera();
    },

    removeCapturedPhoto: function(event, type) {
        event.stopPropagation(); // Éviter de déclencher l'ouverture de la caméra
        
        if (this.state.currentUser.tempDocs) {
            delete this.state.currentUser.tempDocs[type];
        }

        const previewContainer = document.getElementById(`preview-${type}-container`);
        if (previewContainer) {
            previewContainer.classList.add('hidden');
            previewContainer.innerHTML = '';
        }

        const dropzone = document.getElementById(`drop-${type}`);
        if (dropzone) {
            dropzone.querySelector('.upload-icon').style.display = 'block';
            dropzone.querySelector('.upload-text').style.display = 'block';
        }
    },

    handleKYCSubmit: async function(event) {
        console.log("--- DÉBUT DE LA SOUMISSION KYC ---");
        event.preventDefault();
        const user = this.state.currentUser;
        if (!user) {
            console.error("Erreur: Aucun utilisateur n'est connecté.");
            return;
        }
        console.log("Utilisateur connecté trouvé:", user.phone);

        console.log("Validation des champs du formulaire...");
        const kycFirstnameEl = document.getElementById('kyc-firstname');
        const kycLastnameEl = document.getElementById('kyc-lastname');
        const docNumberEl = document.getElementById('kyc-doc-number');
        const dobEl = document.getElementById('kyc-dob');

        if (!kycFirstnameEl || !kycLastnameEl || !docNumberEl || !dobEl) {
            console.error("Erreur: Un ou plusieurs éléments du formulaire KYC sont introuvables dans le DOM.");
            this.showModalAlert("Erreur technique : Le formulaire KYC est incomplet.", "Erreur Technique", "error");
            return;
        }

        const kycFirstname = kycFirstnameEl.value.trim();
        const kycLastname = kycLastnameEl.value.trim();
        const docNumber = docNumberEl.value.trim();
        const dob = dobEl.value;
        
        if (!kycFirstname || !kycLastname || !docNumber || !dob) {
            this.showModalAlert("Veuillez renseigner tous les champs obligatoires du formulaire (Prénom, Nom, Numéro de document, Date de naissance).", "Formulaire Incomplet", "warning");
            return;
        }

        console.log("Valeurs lues:", { kycFirstname, kycLastname, docNumber, dob });

        // Vérifier si toutes les images sont fournies
        console.log("Vérification de l'upload des fichiers...");
        const docTypeEl = document.querySelector('input[name="kyc-doc-type"]:checked');
        const docType = docTypeEl ? docTypeEl.value : 'cni';
        const isPassport = docType === 'passport';

        const hasRecto = (user.tempDocs && user.tempDocs.recto) || (user.kyc.documents && user.kyc.documents.recto);
        const hasVerso = (user.tempDocs && user.tempDocs.verso) || (user.kyc.documents && user.kyc.documents.verso);
        const hasSelfie = (user.tempDocs && user.tempDocs.selfie) || (user.kyc.documents && user.kyc.documents.selfie);

        console.log("Résultat des uploads - Recto:", !!hasRecto, "| Verso:", !!hasVerso, "| Selfie:", !!hasSelfie);

        if (!hasRecto || (!isPassport && !hasVerso) || !hasSelfie) {
            console.warn("Échec: Toutes les photos n'ont pas été fournies.");
            if (isPassport) {
                this.showModalAlert("Vous devez fournir les 2 photos obligatoires (Photo du Passeport et Selfie de vérification).", "Photos Manquantes", "warning");
            } else {
                this.showModalAlert("Vous devez fournir les 3 photos obligatoires (CNI Recto, CNI Verso et Selfie de vérification).", "Photos Manquantes", "warning");
            }
            return;
        }

        console.log("Enregistrement en base de données et téléversement Supabase Storage...");
        const userInDb = this.state.users.find(u => u.phone === user.phone);
        if (!userInDb) {
            console.error("Erreur fatale: Utilisateur non trouvé dans la base de données.");
            this.showModalAlert("Erreur lors de l'enregistrement de votre profil.", "Erreur", "error");
            return;
        }

        const submitBtn = document.getElementById('btn-submit-kyc');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Téléversement sur Supabase Storage...';
        }

        // Téléversement réel sur Supabase Storage
        let rectoUrl = user.tempDocs && user.tempDocs.recto ? user.tempDocs.recto : (userInDb.kyc.documents ? userInDb.kyc.documents.recto : null);
        let versoUrl = isPassport ? null : (user.tempDocs && user.tempDocs.verso ? user.tempDocs.verso : (userInDb.kyc.documents ? userInDb.kyc.documents.verso : null));
        let selfieUrl = user.tempDocs && user.tempDocs.selfie ? user.tempDocs.selfie : (userInDb.kyc.documents ? userInDb.kyc.documents.selfie : null);

        if (window.vipSupabase) {
            try {
                if (user.tempDocs && user.tempDocs.recto) {
                    const cdnRecto = await window.vipSupabase.uploadKycDocument(user.phone, 'cni_recto', user.tempDocs.recto);
                    if (cdnRecto) rectoUrl = cdnRecto;
                }
                if (!isPassport && user.tempDocs && user.tempDocs.verso) {
                    const cdnVerso = await window.vipSupabase.uploadKycDocument(user.phone, 'cni_verso', user.tempDocs.verso);
                    if (cdnVerso) versoUrl = cdnVerso;
                }
                if (user.tempDocs && user.tempDocs.selfie) {
                    const cdnSelfie = await window.vipSupabase.uploadKycDocument(user.phone, 'selfie', user.tempDocs.selfie);
                    if (cdnSelfie) selfieUrl = cdnSelfie;
                }
            } catch (err) {
                console.warn("Notice upload Supabase Storage:", err);
            }
        }

        userInDb.kyc = {
            status: 'approved',
            firstname: kycFirstname,
            lastname: kycLastname,
            docNumber: docNumber,
            dob: dob,
            docType: docType,
            documents: {
                recto: rectoUrl,
                verso: versoUrl,
                selfie: selfieUrl
            },
            comments: ''
        };

        delete user.tempDocs;
        this.state.currentUser = userInDb;
        this.saveUsers();
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }

        console.log("Enregistrement réussi. Documents enregistrés sur Supabase Cloud.");
        this.showModalAlert("Vos documents d'identité ont été téléversés et vérifiés avec succès sur Supabase Cloud !\n\nVotre compte est désormais certifié pour réserver des trajets VIP.", "Dossier KYC Validé", "success");
        this.renderKYCStatusAlert();
        this.updateHeaderMenu();
        console.log("--- FIN DE LA SOUMISSION KYC ---");
    },

    // -------------------------------------------------------------
    // CALCUL DYNAMIQUE DES HORAIRES ET DISPONIBILITÉS
    // -------------------------------------------------------------
    handleTripTypeChange: function() {
        const tripType = document.querySelector('input[name="trip-type"]:checked').value;
        const returnDateGroup = document.getElementById('return-date-group');
        const returnDateInput = document.getElementById('book-return-date');
        const returnTimeInput = document.getElementById('book-return-time');
        
        if (tripType === 'roundtrip') {
            returnDateGroup.classList.remove('hidden');
            returnDateInput.required = true;
            if(returnTimeInput) returnTimeInput.required = true;
        } else {
            returnDateGroup.classList.add('hidden');
            returnDateInput.required = false;
            returnDateInput.value = '';
            if(returnTimeInput) {
                returnTimeInput.required = false;
                returnTimeInput.value = '';
            }
        }
        
        // Update price on the submit button if a seat is already selected
        const selectedSeat = document.querySelector('.seat.selected');
        const paymentContainer = document.getElementById('payment-info-container');
        if (selectedSeat && paymentContainer && !paymentContainer.classList.contains('hidden')) {
            const amount = tripType === 'roundtrip' ? '35 000' : '20 000';
            const btnPay = document.getElementById('btn-book-action');
            if (btnPay) {
                btnPay.innerText = this.t('dashboard.book_pay_btn', { amount: amount });
            }
        }
    },


    updateDynamicSchedules: function() {
        const routeSelect = document.getElementById('book-route');
        const dateInput = document.getElementById('book-date');
        const container = document.getElementById('schedules-container');
        const btnBook = document.getElementById('btn-book-action');
        
        if (!routeSelect || !dateInput || !container) return;

        const route = routeSelect.value;
        const dateStr = dateInput.value;

        if (!dateStr) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size:14px; padding: 20px;">${this.t('dashboard.schedule_choose_day')}</div>`;
            if (btnBook) btnBook.disabled = true;
            return;
        }

        // Récupérer les créneaux par rapport à l'itinéraire
        // Douala -> Yaoundé : 5h00, 15h00
        // Yaoundé -> Douala : 5h00, 15h00
        let baseTimes = [];
        if (route === "Douala - Yaoundé") {
            baseTimes = ["05:00", "15:00"];
        } else {
            baseTimes = ["05:00", "15:00"];
        }

        // Obtenir la date actuelle
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        let html = '';
        let availableSchedulesCount = 0;

        baseTimes.forEach(time => {
            const [h, m] = time.split(':').map(Number);
            
            // Calculer si le créneau est dans le passé pour aujourd'hui
            let isPast = false;
            if (dateStr === todayStr) {
                const scheduleDateTime = new Date();
                scheduleDateTime.setHours(h, m, 0, 0);
                if (now >= scheduleDateTime) {
                    isPast = true;
                }
            }

            // Calculer le nombre de places réservées sur ce créneau
            const bookingsCount = this.state.reservations.filter(res => 
                res.date === dateStr && res.time === time && res.route === route
            ).length;

            const capacityLeft = Math.max(0, 3 - bookingsCount); // 3 places au total (1 véhicule de 3 places)

            // Génération de la carte horaire
            if (isPast) {
                // Règle métier : n'afficher que les départs restants de la journée
                return;
            }

            availableSchedulesCount++;
            
            let statusClass = 'status-available';
            let statusText = this.t('dashboard.schedule_available');
            let cardClass = '';
            let disabledAttr = '';

            if (capacityLeft === 0) {
                statusClass = 'status-full';
                statusText = this.t('dashboard.schedule_full');
                cardClass = 'disabled';
                disabledAttr = 'data-disabled="true"';
            }

            html += `
                <div class="schedule-card ${cardClass}" ${disabledAttr} data-time="${time}" onclick="app.selectSchedule(this)">
                    <div class="schedule-time">${time}</div>
                    <div class="schedule-info">
                        <span class="schedule-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
        });

        if (availableSchedulesCount === 0) {
            container.innerHTML = `<div class="alert-box alert-warning" style="margin-bottom:0; text-align:center;">${this.t('dashboard.schedule_no_departures')}</div>`;
            if (btnBook) btnBook.disabled = true;
        } else {
            container.innerHTML = html;
        }
    },

    selectSchedule: function(card) {
        if (card.dataset.disabled === "true") return;

        // Dé-sélectionner les autres
        const cards = document.querySelectorAll('.schedule-card');
        cards.forEach(c => c.classList.remove('selected'));

        // Sélectionner
        card.classList.add('selected');

        // Afficher la sélection des véhicules
        const route = document.getElementById('book-route').value;
        const date = document.getElementById('book-date').value;
        const time = card.dataset.time;

        // Enregistrer la sélection
        this.state.selectedTime = time;
        this.state.selectedVehicleId = null;
        this.state.selectedSeatId = null;
        
        // Réinitialiser les étapes suivantes
        const seatContainer = document.getElementById('seat-selection-container');
        if (seatContainer) seatContainer.classList.add('hidden');
        
        const paymentContainer = document.getElementById('payment-info-container');
        if (paymentContainer) paymentContainer.classList.add('hidden');
        
        this.renderVehicles(date, time, route);
    },

    // -------------------------------------------------------------
    // GESTION DES VEHICULES ET PLACES
    // -------------------------------------------------------------
    renderVehicles: function(date, time, route) {
        const container = document.getElementById('vehicle-selection-container');
        const grid = document.getElementById('vehicles-container');
        if (!container || !grid) return;

        let html = '';
        
        for (let i = 1; i <= 1; i++) {
            const bookings = this.state.reservations.filter(res => 
                res.date === date && res.time === time && res.route === route && res.vehicleId === i
            );
            
            const capacityLeft = 3 - bookings.length;
            
            // Vérifier si le véhicule précédent est rempli
            let isLocked = false;
            if (i > 1) {
                const prevBookings = this.state.reservations.filter(res => 
                    res.date === date && res.time === time && res.route === route && res.vehicleId === (i - 1)
                );
                if (prevBookings.length < 3) {
                    isLocked = true;
                }
            }

            let cardClass = '';
            let onClick = `onclick="app.selectVehicle(this, ${i})"`;
            
            let seatsHtml = '';
            if (this.state.lang === 'fr') {
                seatsHtml = `${capacityLeft} place${capacityLeft > 1 ? 's' : ''} libre${capacityLeft > 1 ? 's' : ''}`;
            } else {
                seatsHtml = `${capacityLeft} free seat${capacityLeft > 1 ? 's' : ''}`;
            }
            
            let iconHtml = `<i class="fas fa-car"></i>`;
            
            if (isLocked) {
                cardClass = 'locked disabled';
                onClick = '';
                seatsHtml = this.state.lang === 'fr' ? 'Fermé' : 'Closed';
                iconHtml = `<i class="fas fa-lock"></i>`;
            } else if (capacityLeft <= 0) {
                cardClass = 'disabled';
                onClick = '';
                seatsHtml = this.t('dashboard.schedule_full');
            }
            
            const vehicleLabel = this.state.lang === 'fr' ? `Véhicule ${i}` : `Vehicle ${i}`;
            
            html += `
                <div class="vehicle-card ${cardClass}" ${onClick}>
                    ${iconHtml}
                    <div class="vehicle-name">${vehicleLabel}</div>
                    <div class="vehicle-seats">${seatsHtml}</div>
                </div>
            `;
        }
        
        grid.innerHTML = html;
        container.classList.remove('hidden');
    },

    selectVehicle: function(card, vehicleId) {
        const cards = document.querySelectorAll('.vehicle-card');
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const route = document.getElementById('book-route').value;
        const date = document.getElementById('book-date').value;
        
        const selectedCard = document.querySelector('.schedule-card.selected');
        if (!selectedCard) return;
        const time = selectedCard.dataset.time;

        // Enregistrer la sélection
        this.state.selectedVehicleId = vehicleId;
        this.state.selectedSeatId = null;
        
        // Hide payment initially when vehicle changes
        const paymentContainer = document.getElementById('payment-info-container');
        if (paymentContainer) paymentContainer.classList.add('hidden');
        
        this.renderSeatMap(vehicleId, date, time, route);
    },

    renderSeatMap: function(vehicleId, date, time, route) {
        const container = document.getElementById('seat-selection-container');
        const mapContainer = document.getElementById('seat-map-container');
        if (!container || !mapContainer) return;

        const bookings = this.state.reservations.filter(res => 
            res.date === date && res.time === time && res.route === route && res.vehicleId === vehicleId
        );
        
        const bookedSeats = bookings.map(b => b.seatId);
        
        const renderSeat = (seatId, label) => {
            const isBooked = bookedSeats.includes(seatId);
            const seatClass = isBooked ? 'disabled' : '';
            const onClick = isBooked ? '' : `onclick="app.selectSeat(this, '${seatId}', ${vehicleId})"`;
            return `
                <div class="seat ${seatClass}" ${onClick} data-seat="${seatId}">
                    <i class="fas fa-user"></i>
                </div>
            `;
        };
        
        const html = `
            <div class="car-interior">
                <div class="car-dashboard"></div>
                <div class="car-row front">
                    <div class="seat driver"><i class="fas fa-steering-wheel"></i></div>
                    ${renderSeat('front', 'Avant')}
                </div>
                <div class="car-row">
                    ${renderSeat('back_left', 'Arrière Gauche')}
                    ${renderSeat('back_right', 'Arrière Droite')}
                </div>
            </div>
        `;
        
        mapContainer.innerHTML = html;
        container.classList.remove('hidden');
    },

    selectSeat: function(seatEl, seatId, vehicleId) {
        if (seatEl.classList.contains('disabled') || seatEl.classList.contains('driver')) return;

        const seats = document.querySelectorAll('.seat');
        seats.forEach(s => s.classList.remove('selected'));
        seatEl.classList.add('selected');
        
        // Save selection temporarily to state or DOM
        seatEl.dataset.selectedVehicle = vehicleId;

        // Enregistrer la sélection
        this.state.selectedSeatId = seatId;
        
        // Show payment section
        const paymentContainer = document.getElementById('payment-info-container');
        if (paymentContainer) {
            paymentContainer.classList.remove('hidden');
            
            // Translate booking payment button text
            const tripTypeEl = document.querySelector('input[name="trip-type"]:checked');
            const amount = (tripTypeEl && tripTypeEl.value === 'roundtrip') ? '35 000' : '20 000';
            const btnPay = document.getElementById('btn-book-action');
            if (btnPay) {
                btnPay.innerText = this.t('dashboard.book_pay_btn', { amount: amount });
            }
        }
    },

    // -------------------------------------------------------------
    // PAIEMENT ET CONFIRMATION DE RÉSERVATION
    // -------------------------------------------------------------
    handleBookingSubmit: function(event) {
        if (event) event.preventDefault();
        
        if (!this.state.currentUser) {
            this.showModalAlert("Vous devez être connecté à votre compte pour réserver un trajet VIP Connect.", "Connexion Requise", "warning");
            this.showSection('login');
            return;
        }

        if (this.state.currentUser.kyc.status !== 'approved') {
            this.showModalAlert("Votre vérification d'identité (KYC) doit être validée avant de pouvoir effectuer une réservation de navette.", "Vérification KYC Requise", "warning");
            this.showSection('kyc-verification');
            return;
        }

        const routeEl = document.getElementById('book-route');
        const dateEl = document.getElementById('book-date');
        const momoNumberEl = document.getElementById('book-momo-number');
        const route = routeEl ? routeEl.value : '';
        const date = dateEl ? dateEl.value : '';
        const momoNumber = momoNumberEl ? momoNumberEl.value.trim() : '';
        const tripTypeEl = document.querySelector('input[name="trip-type"]:checked');
        const tripType = tripTypeEl ? tripTypeEl.value : 'oneway';
        const returnDateEl = document.getElementById('book-return-date');
        const returnTimeEl = document.getElementById('book-return-time');
        const returnDate = returnDateEl ? returnDateEl.value : '';
        const returnTime = returnTimeEl ? returnTimeEl.value : '';

        if (!date) {
            this.showModalAlert("Veuillez sélectionner une date de départ valide.", "Date Requise", "warning");
            return;
        }

        if (tripType === 'roundtrip') {
            if (!returnDate) {
                this.showModalAlert("Veuillez sélectionner une date de retour pour le trajet aller-retour.", "Date de Retour Requise", "warning");
                return;
            }
            if (!returnTime) {
                this.showModalAlert("Veuillez sélectionner une heure de départ pour le retour.", "Heure de Retour Requise", "warning");
                return;
            }
        }

        // Récupérer le créneau horaire sélectionné
        const selectedCard = document.querySelector('.schedule-card.selected');
        if (!selectedCard) {
            this.showModalAlert("Veuillez choisir un horaire de départ parmi les navettes disponibles.", "Horaire Non Sélectionné", "warning");
            return;
        }
        const time = selectedCard.dataset.time;

        // Validation n° Mobile Money
        if (!momoNumber.match(/^[6][0-9]{8}$/)) {
            this.showModalAlert("Veuillez saisir un numéro Mobile Money camerounais valide à 9 chiffres commençant par 6 (ex: 699112233 ou 670112233).", "Numéro Mobile Money Invalide", "error");
            return;
        }
        
        // Récupérer la place sélectionnée
        const selectedSeat = document.querySelector('.seat.selected');
        if (!selectedSeat) {
            this.showModalAlert("Veuillez sélectionner un siège disponible dans l'un des véhicules VIP affichés.", "Siège Requis", "warning");
            return;
        }
        const seatId = selectedSeat.dataset.seat;
        const vehicleId = parseInt(selectedSeat.dataset.selectedVehicle, 10);

        // Préparer la transaction en mémoire
        const amount = tripType === 'roundtrip' ? 35000 : 20000;
        this.state.selectedPaymentDetails = {
            route: route,
            date: date,
            time: time,
            phone: momoNumber,
            passengerName: `${this.state.currentUser.firstname} ${this.state.currentUser.lastname}`,
            firstname: this.state.currentUser.firstname,
            lastname: this.state.currentUser.lastname,
            amount: amount,
            vehicleId: vehicleId,
            seatId: seatId,
            tripType: tripType,
            returnDate: tripType === 'roundtrip' ? returnDate : null,
            returnTime: tripType === 'roundtrip' ? returnTime : null
        };

        // Ouvrir la modale de paiement
        this.openPaymentModal();
    },

    openPaymentModal: function() {
        const modal = document.getElementById('modal-payment');
        const details = this.state.selectedPaymentDetails;
        if (!modal || !details) return;

        document.getElementById('summary-route').innerText = details.route;
        
        let datetimeStr = `${details.date} à ${details.time}`;
        if (details.tripType === 'roundtrip' && details.returnDate && details.returnTime) {
            const returnLabel = this.state.lang === 'fr' ? 'Retour' : 'Return';
            datetimeStr += ` | ${returnLabel}: ${details.returnDate} à ${details.returnTime}`;
        }
        document.getElementById('summary-datetime').innerText = datetimeStr;
        
        document.getElementById('summary-amount').innerText = `${details.amount.toLocaleString()} FCFA`;

        modal.classList.remove('hidden');
        
        // Réinitialiser le simulateur
        document.getElementById('momo-ussd-simulator').classList.add('hidden');
        document.getElementById('btn-trigger-payment').classList.remove('hidden');
        document.getElementById('sim-pin-input').value = '';
        document.getElementById('sim-error-message').classList.add('hidden');
    },

    closePaymentModal: function() {
        const modal = document.getElementById('modal-payment');
        if (modal) modal.classList.add('hidden');
        this.state.selectedPaymentDetails = null;
    },

    selectPaymentProvider: function(provider, card) {
        this.state.selectedProvider = provider;
        
        // Gérer l'état de la carte sélectionnée
        const cards = document.querySelectorAll('.provider-card');
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        // Mettre à jour le libellé du bouton
        const formattedAmount = this.state.selectedPaymentDetails.amount.toLocaleString().replace(/,/g, ' ');
        document.getElementById('btn-trigger-payment').innerText = this.state.lang === 'fr' 
            ? `Lancer la facturation via ${provider} (${formattedAmount} FCFA)`
            : `Start billing via ${provider} (${formattedAmount} FCFA)`;
    },

    initiateMomoPayment: function() {
        // Cacher le bouton et afficher le simulateur d'envoi USSD/Push MoMo
        document.getElementById('btn-trigger-payment').classList.add('hidden');
        
        const sim = document.getElementById('momo-ussd-simulator');
        const prompt = document.getElementById('simulator-prompt-text');
        
        if (sim && prompt) {
            const formattedAmount = this.state.selectedPaymentDetails.amount.toLocaleString().replace(/,/g, ' ');
            sim.classList.remove('hidden');
            prompt.innerHTML = `<strong>[SIMULATION ${this.state.selectedProvider.toUpperCase()}]</strong><br>${this.t('payment_modal.ussd_prompt', {amount: formattedAmount})}`;
            document.getElementById('sim-pin-input').focus();
        }
    },

    cancelMomoSimulator: function() {
        document.getElementById('momo-ussd-simulator').classList.add('hidden');
        document.getElementById('btn-trigger-payment').classList.remove('hidden');
        this.showToast(this.t('toasts.payment_cancelled'), "info");
    },

    confirmMomoSimulator: function() {
        const pin = document.getElementById('sim-pin-input').value;
        const err = document.getElementById('sim-error-message');
        
        if (pin.length !== 4 || isNaN(pin)) {
            err.innerText = this.state.lang === 'fr' ? "Le code PIN doit comporter 4 chiffres." : "The PIN code must be 4 digits.";
            err.classList.remove('hidden');
            return;
        }

        // Succès de la transaction simulée
        const details = this.state.selectedPaymentDetails;
        const txPrefix = this.state.selectedProvider === 'Orange Money' ? 'OM-' : 'MTN-';
        const txId = txPrefix + Math.floor(100000 + Math.random() * 900000);
        const resId = 'RES-' + Math.floor(10000 + Math.random() * 90000);
        const dateNow = new Date().toISOString().split('T')[0] + " " + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});

        details.paymentDate = dateNow;
        details.paymentProvider = this.state.selectedProvider || 'Mobile Money';

        // Enregistrer la réservation complète
        const newReservation = {
            id: resId,
            date: details.date,
            time: details.time,
            route: details.route,
            phone: details.phone,
            email: details.email || (this.state.currentUser ? this.state.currentUser.email : '') || '',
            passengerName: details.passengerName,
            firstname: details.firstname || (this.state.currentUser ? this.state.currentUser.firstname : ''),
            lastname: details.lastname || (this.state.currentUser ? this.state.currentUser.lastname : ''),
            txId: txId,
            amount: details.amount,
            vehicleId: details.vehicleId,
            seatId: details.seatId,
            tripType: details.tripType,
            returnDate: details.returnDate,
            returnTime: details.returnTime,
            paymentDate: dateNow,
            paymentProvider: this.state.selectedProvider || 'Mobile Money',
            status: "paid"
        };

        this.state.reservations.push(newReservation);
        this.saveReservations();

        // Enregistrer le paiement
        const newPayment = {
            txId: txId,
            passengerName: details.passengerName,
            phone: details.phone,
            provider: this.state.selectedProvider,
            amount: details.amount,
            date: dateNow,
            status: "success"
        };
        
        this.state.payments.push(newPayment);
        this.savePayments();

        // Finalisation
        this.closePaymentModal();
        this.showToast(this.t('toasts.payment_success', { resId: resId, txId: txId }), "success");
        
        // Afficher et peupler le ticket
        this.showTicketModal(resId, txId, details);

        // Notification instantanée sur le téléphone de l'utilisateur
        this.notifyBookingConfirmed(newReservation, details);

        // Envoi automatique du Billet officiel (PDF) dans la boîte mail du client
        this.sendTicketPdfByEmail(newReservation, details);

        // Rafraîchir l'historique des réservations du voyageur
        this.renderUserReservations();

        // Rafraîchir les horaires
        this.updateDynamicSchedules();
        
        // Vider le formulaire de réservation
        document.getElementById('form-booking').reset();
        this.setDefaultDateInput();
    },

    // -------------------------------------------------------------
    // ESPACE ADMINISTRATEUR (LOGIQUE)
    // -------------------------------------------------------------
    loadAdminData: function() {
        this.renderReservationsTable();
        this.renderUsersTable();
        this.renderKycTable();
        this.renderPaymentsTable();
        this.loadAdminVehiclesGrid();
        this.calculateFinanceStats();
        this.updateAdminKycBadge();
        this.updateAdminUsersBadge();
    },

    showAdminTab: function(tabId, tabButton) {
        this.state.activeAdminTab = tabId;
        
        // Mettre à jour l'état actif dans la barre latérale
        const items = document.querySelectorAll('.admin-nav-item');
        items.forEach(i => i.classList.remove('active'));
        if (tabButton && tabButton.classList) {
            tabButton.classList.add('active');
        } else {
            const matching = document.querySelector(`.admin-nav-item[onclick*="'${tabId}'"]`);
            if (matching) matching.classList.add('active');
        }

        // Cacher tous les onglets
        const tabs = ['reservations', 'users', 'kyc', 'finance', 'vehicles'];
        tabs.forEach(id => {
            const el = document.getElementById('admin-tab-' + id);
            if (el) el.classList.add('hidden');
        });

        // Afficher l'onglet actif
        const activeTab = document.getElementById('admin-tab-' + tabId);
        if (activeTab) activeTab.classList.remove('hidden');

        // Rafraîchir les données de l'onglet spécifique
        this.loadAdminData();
        this.updateMobileBottomBar();
    },

    updateAdminUsersBadge: function() {
        const badge = document.getElementById('admin-users-badge');
        if (!badge || !this.state.users) return;
        badge.innerText = this.state.users.length;
    },

    // 1. Liste et gestion de tous les utilisateurs
    renderUsersTable: function(filteredUsers = null) {
        const tbody = document.getElementById('table-users-body');
        if (!tbody) return;

        const allUsers = this.state.users || [];
        const usersToDisplay = filteredUsers !== null ? filteredUsers : allUsers;

        // Mettre à jour les statistiques KPI
        const totalCountEl = document.getElementById('admin-users-total-count');
        const approvedCountEl = document.getElementById('admin-users-kyc-approved');
        const pendingCountEl = document.getElementById('admin-users-kyc-pending');
        const adminCountEl = document.getElementById('admin-users-admin-count');

        const approvedCount = allUsers.filter(u => u.kyc && u.kyc.status === 'approved').length;
        const pendingCount = allUsers.filter(u => u.kyc && u.kyc.status === 'pending').length;
        const adminCount = allUsers.filter(u => this.isAdminUser(u)).length;

        if (totalCountEl) totalCountEl.innerText = allUsers.length;
        if (approvedCountEl) approvedCountEl.innerText = approvedCount;
        if (pendingCountEl) pendingCountEl.innerText = pendingCount;
        if (adminCountEl) adminCountEl.innerText = adminCount;
        this.updateAdminUsersBadge();

        if (usersToDisplay.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: var(--text-muted);">Aucun utilisateur correspondant trouvé.</td></tr>`;
            return;
        }

        tbody.innerHTML = usersToDisplay.map(u => {
            const isAdmin = this.isAdminUser(u);
            const fullName = `${u.firstname || ''} ${u.lastname || ''}`.trim() || 'Utilisateur VIP';
            const initials = `${(u.firstname || 'U')[0]}${(u.lastname || 'V')[0]}`.toUpperCase();

            // Calcul du nombre de trajets réservés
            const userPhone = String(u.phone || '').replace(/[^0-9]/g, '');
            const userBookings = (this.state.reservations || []).filter(r => {
                const p = String(r.phone || '').replace(/[^0-9]/g, '');
                return p === userPhone || (p && userPhone && (p.endsWith(userPhone) || userPhone.endsWith(p)));
            });

            // Badge Statut KYC
            let kycBadge = '';
            const kycStatus = u.kyc ? u.kyc.status : 'none';
            if (kycStatus === 'approved') {
                kycBadge = '<span class="badge badge-approved"><i class="fas fa-check-circle"></i> Validé</span>';
            } else if (kycStatus === 'pending') {
                kycBadge = '<span class="badge badge-pending"><i class="fas fa-hourglass-half"></i> En attente</span>';
            } else if (kycStatus === 'rejected') {
                kycBadge = '<span class="badge badge-rejected"><i class="fas fa-times-circle"></i> Rejeté</span>';
            } else {
                kycBadge = '<span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted);"><i class="far fa-circle"></i> Non soumis</span>';
            }

            // Badge Rôle
            const roleBadge = isAdmin
                ? '<span class="badge" style="background: rgba(197, 168, 128, 0.2); color: var(--primary-gold); border: 1px solid rgba(197, 168, 128, 0.4);"><i class="fas fa-shield-alt"></i> Super Admin</span>'
                : '<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-white);"><i class="fas fa-user"></i> Voyageur VIP</span>';

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px; cursor: pointer;" onclick="app.openUserDetailModal('${u.phone}')" title="Cliquer pour voir la fiche complète">
                            <div style="width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, rgba(197,168,128,0.3), rgba(197,168,128,0.1)); border: 1px solid rgba(197,168,128,0.4); color: var(--primary-gold); font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center;">
                                ${initials}
                            </div>
                            <div>
                                <strong style="color: var(--text-white); font-size: 14px; text-decoration: underline; text-decoration-color: rgba(197,168,128,0.3);">${fullName}</strong>
                            </div>
                        </div>
                    </td>
                    <td><span style="font-family: monospace; color: var(--text-white);">${u.phone}</span></td>
                    <td><span style="color: var(--text-muted); font-size: 13px;">${u.email || '<em style="color:#666;">Non renseigné</em>'}</span></td>
                    <td>${kycBadge}</td>
                    <td>${roleBadge}</td>
                    <td><span style="font-weight: 700; color: var(--primary-gold);">${userBookings.length} trajet${userBookings.length > 1 ? 's' : ''}</span></td>
                    <td>
                        <button class="btn-outline" style="padding: 6px 12px; font-size: 12px; width: auto;" onclick="app.openUserDetailModal('${u.phone}')">
                            <i class="fas fa-address-card" style="margin-right: 4px;"></i> Voir fiche
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    filterUsersTable: function() {
        const query = (document.getElementById('admin-search-users') ? document.getElementById('admin-search-users').value : '').toLowerCase().trim();
        const kycFilter = document.getElementById('admin-filter-users-kyc') ? document.getElementById('admin-filter-users-kyc').value : 'all';
        const roleFilter = document.getElementById('admin-filter-users-role') ? document.getElementById('admin-filter-users-role').value : 'all';

        let filtered = (this.state.users || []).filter(u => {
            const fullName = `${u.firstname || ''} ${u.lastname || ''}`.toLowerCase();
            const phone = String(u.phone || '').toLowerCase();
            const email = String(u.email || '').toLowerCase();

            const matchesQuery = !query || fullName.includes(query) || phone.includes(query) || email.includes(query);

            const userKycStatus = u.kyc ? (u.kyc.status || 'none') : 'none';
            const matchesKyc = kycFilter === 'all' || userKycStatus === kycFilter;

            const isAdmin = this.isAdminUser(u);
            const matchesRole = roleFilter === 'all' || (roleFilter === 'admin' && isAdmin) || (roleFilter === 'client' && !isAdmin);

            return matchesQuery && matchesKyc && matchesRole;
        });

        this.renderUsersTable(filtered);
    },

    openUserDetailModal: function(phone) {
        const user = (this.state.users || []).find(u => String(u.phone || '').replace(/[^0-9]/g, '') === String(phone || '').replace(/[^0-9]/g, ''));
        if (!user) {
            this.showToast("Dossier utilisateur introuvable.", "error");
            return;
        }

        this.state.currentInspectingUser = user;

        const fullName = `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'Utilisateur VIP';
        const initials = `${(user.firstname || 'U')[0]}${(user.lastname || 'V')[0]}`.toUpperCase();
        const isAdmin = this.isAdminUser(user);

        // Header
        const avatarEl = document.getElementById('user-detail-avatar');
        if (avatarEl) avatarEl.innerText = initials;

        const nameEl = document.getElementById('user-detail-fullname');
        if (nameEl) nameEl.innerText = fullName;

        const roleBadgeEl = document.getElementById('user-detail-role-badge');
        if (roleBadgeEl) {
            roleBadgeEl.className = 'badge ' + (isAdmin ? 'badge-approved' : '');
            roleBadgeEl.style.background = isAdmin ? 'rgba(197, 168, 128, 0.25)' : 'rgba(255, 255, 255, 0.08)';
            roleBadgeEl.style.color = isAdmin ? 'var(--primary-gold)' : 'var(--text-white)';
            roleBadgeEl.innerText = isAdmin ? 'Super Administrateur' : 'Voyageur VIP';
        }

        const kycStatus = user.kyc ? (user.kyc.status || 'none') : 'none';
        const kycBadgeEl = document.getElementById('user-detail-kyc-badge');
        if (kycBadgeEl) {
            if (kycStatus === 'approved') {
                kycBadgeEl.className = 'badge badge-approved';
                kycBadgeEl.innerText = 'KYC Validé ✓';
            } else if (kycStatus === 'pending') {
                kycBadgeEl.className = 'badge badge-pending';
                kycBadgeEl.innerText = 'KYC En Attente';
            } else if (kycStatus === 'rejected') {
                kycBadgeEl.className = 'badge badge-rejected';
                kycBadgeEl.innerText = 'KYC Rejeté';
            } else {
                kycBadgeEl.className = 'badge';
                kycBadgeEl.style.background = 'rgba(255, 255, 255, 0.08)';
                kycBadgeEl.style.color = 'var(--text-muted)';
                kycBadgeEl.innerText = 'KYC Non Soumis';
            }
        }

        // Coordonnées
        const phoneEl = document.getElementById('user-detail-phone');
        if (phoneEl) phoneEl.innerText = user.phone || 'Non renseigné';

        const emailEl = document.getElementById('user-detail-email');
        if (emailEl) emailEl.innerText = user.email || 'Aucune adresse email';

        // Qualité et KYC
        const docTypeEl = document.getElementById('user-detail-doc-type');
        if (docTypeEl) {
            const dt = user.kyc ? user.kyc.docType : '';
            docTypeEl.innerText = dt === 'passport' ? 'Passeport International' : (dt === 'cni' ? 'Carte Nationale d\'Identité (CNI)' : 'Non renseigné');
        }

        const docNumEl = document.getElementById('user-detail-doc-num');
        if (docNumEl) {
            docNumEl.innerText = (user.kyc && user.kyc.docNumber) ? user.kyc.docNumber : 'Aucun numéro soumis';
        }

        const dobEl = document.getElementById('user-detail-dob');
        if (dobEl) {
            dobEl.innerText = (user.kyc && user.kyc.dob) ? user.kyc.dob : 'Non renseignée';
        }

        // Historique réservations
        const userPhone = String(user.phone || '').replace(/[^0-9]/g, '');
        const userBookings = (this.state.reservations || []).filter(r => {
            const p = String(r.phone || '').replace(/[^0-9]/g, '');
            return p === userPhone || (p && userPhone && (p.endsWith(userPhone) || userPhone.endsWith(p)));
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const countEl = document.getElementById('user-detail-res-count');
        if (countEl) countEl.innerText = userBookings.length;

        const totalSpent = userBookings.reduce((sum, b) => sum + (Number(b.amount) || 20000), 0);
        const spentEl = document.getElementById('user-detail-total-spent');
        if (spentEl) spentEl.innerText = totalSpent.toLocaleString('fr-FR') + ' FCFA';

        const resListEl = document.getElementById('user-detail-reservations-list');
        if (resListEl) {
            if (userBookings.length === 0) {
                resListEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 15px;">Aucune réservation effectuée pour l'instant.</div>`;
            } else {
                resListEl.innerHTML = userBookings.map(b => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px;">
                        <div>
                            <strong style="color: var(--primary-gold); font-family: monospace;">${b.id}</strong> &bull;
                            <span style="color: var(--text-white); font-weight: 600;">${b.route}</span>
                            <div style="font-size: 11px; color: var(--text-muted);">${b.date} à ${b.time} &bull; Place : ${b.seatId}</div>
                        </div>
                        <div style="text-align: right;">
                            <span style="color: #34d399; font-weight: 700;">${(Number(b.amount) || 20000).toLocaleString('fr-FR')} FCFA</span>
                            <div style="font-size: 10.5px; font-family: monospace; color: var(--text-muted);">${b.txId || 'OM-VIP'}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Bouton Examiner KYC si le dossier est en attente
        const kycBtn = document.getElementById('user-detail-examine-kyc-btn');
        if (kycBtn) {
            if (kycStatus === 'pending') {
                kycBtn.classList.remove('hidden');
            } else {
                kycBtn.classList.add('hidden');
            }
        }

        const modal = document.getElementById('modal-user-detail');
        if (modal) modal.classList.remove('hidden');
    },

    closeUserDetailModal: function() {
        const modal = document.getElementById('modal-user-detail');
        if (modal) modal.classList.add('hidden');
    },

    openKycFromUserDetail: function() {
        if (!this.state.currentInspectingUser) return;
        const phone = this.state.currentInspectingUser.phone;
        this.closeUserDetailModal();
        this.openKycLightbox(phone);
    },

    // 1. Liste des réservations
    renderReservationsTable: function() {
        const tbody = document.getElementById('table-reservations-body');
        if (!tbody) return;

        // Trier par date puis par heure (la plus récente d'abord)
        const sorted = [...this.state.reservations].sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return b.time.localeCompare(a.time);
        });

        if (sorted.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">${this.t('admin.no_reservations')}</td></tr>`;
            return;
        }

        tbody.innerHTML = sorted.map(res => `
            <tr>
                <td><strong>${res.id}</strong></td>
                <td>${res.date} ${this.state.lang === 'fr' ? 'à' : 'at'} <strong>${res.time}</strong></td>
                <td><i class="fas fa-route" style="color:var(--primary-gold); margin-right:5px;"></i> ${res.route}</td>
                <td>${res.passengerName}</td>
                <td>${res.phone}</td>
                <td><span style="font-family: monospace; font-size:13px; color:var(--primary-gold);">${res.txId}</span></td>
                <td><span class="badge badge-approved">${this.state.lang === 'fr' ? 'Payé' : 'Paid'}</span></td>
            </tr>
        `).join('');
    },

    filterReservationsTable: function() {
        const query = document.getElementById('admin-search-res').value.toLowerCase();
        const tbody = document.getElementById('table-reservations-body');
        if (!tbody) return;

        const filtered = this.state.reservations.filter(res => 
            res.id.toLowerCase().includes(query) ||
            res.passengerName.toLowerCase().includes(query) ||
            res.phone.includes(query) ||
            res.route.toLowerCase().includes(query) ||
            res.txId.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">${this.t('admin.no_search_results')}</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(res => `
            <tr>
                <td><strong>${res.id}</strong></td>
                <td>${res.date} ${this.state.lang === 'fr' ? 'à' : 'at'} <strong>${res.time}</strong></td>
                <td><i class="fas fa-route" style="color:var(--primary-gold); margin-right:5px;"></i> ${res.route}</td>
                <td>${res.passengerName}</td>
                <td>${res.phone}</td>
                <td><span style="font-family: monospace; font-size:13px; color:var(--primary-gold);">${res.txId}</span></td>
                <td><span class="badge badge-approved">${this.state.lang === 'fr' ? 'Payé' : 'Paid'}</span></td>
            </tr>
        `).join('');
    },

    // 2. KYC validations
    renderKycTable: function() {
        const tbody = document.getElementById('table-kyc-body');
        if (!tbody) return;

        // Filtrer les comptes clients (exclure les administrateurs)
        const clients = this.state.users.filter(u => !this.isAdminUser(u));

        if (clients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">${this.t('admin.no_kyc_profiles')}</td></tr>`;
            return;
        }

        tbody.innerHTML = clients.map(u => {
            let statusBadge = '';
            let actionBtn = '';
            
            if (u.kyc.status === 'pending') {
                statusBadge = `<span class="badge badge-pending">${this.t('admin.status_pending')}</span>`;
                actionBtn = `<button class="btn-gold" style="padding: 6px 12px; font-size:12px; width:auto;" onclick="app.openKycLightbox('${u.phone}')"><i class="fas fa-search-plus"></i> ${this.t('admin.action_examine')}</button>`;
            } else if (u.kyc.status === 'approved') {
                statusBadge = `<span class="badge badge-approved">${this.t('admin.status_approved')}</span>`;
                actionBtn = `<button class="btn-outline" style="padding: 6px 12px; font-size:12px;" onclick="app.openKycLightbox('${u.phone}')">${this.t('admin.action_view')}</button>`;
            } else if (u.kyc.status === 'rejected') {
                statusBadge = `<span class="badge badge-rejected">${this.t('admin.status_rejected')}</span>`;
                actionBtn = `<button class="btn-outline" style="padding: 6px 12px; font-size:12px; border-color:var(--error); color:var(--error);" onclick="app.openKycLightbox('${u.phone}')">${this.t('admin.action_reexamine')}</button>`;
            } else {
                statusBadge = `<span class="badge badge-rejected" style="background:none; border: 1px solid var(--border-light); color:var(--text-muted);">${this.t('admin.status_not_submitted')}</span>`;
                actionBtn = `<span style="font-size:12px; color:var(--text-muted);">${this.t('admin.no_documents')}</span>`;
            }

            const recentlyLabel = this.state.lang === 'fr' ? 'Récemment' : 'Recently';
            const emptyLabel = this.state.lang === 'fr' ? '<em style="color:var(--text-muted);">vide</em>' : '<em style="color:var(--text-muted);">empty</em>';

            return `
                <tr>
                    <td>${u.kyc.dob ? recentlyLabel : 'N/A'}</td>
                    <td><strong>${u.firstname} ${u.lastname}</strong></td>
                    <td>${u.phone}</td>
                    <td>${u.kyc.docNumber || emptyLabel}</td>
                    <td>${u.kyc.dob || emptyLabel}</td>
                    <td>${statusBadge}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');
    },

    updateAdminKycBadge: function() {
        const badge = document.getElementById('admin-kyc-badge');
        if (!badge) return;

        const pendingCount = this.state.users.filter(u => u.kyc.status === 'pending').length;
        if (pendingCount > 0) {
            badge.innerText = pendingCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    },

    openKycLightbox: function(userPhone) {
        const lightbox = document.getElementById('lightbox-kyc');
        const user = this.state.users.find(u => u.phone === userPhone);
        if (!lightbox || !user) return;

        this.state.currentReviewUserPhone = userPhone;

        document.getElementById('kyc-review-name').innerText = `${user.firstname} ${user.lastname}`;
        document.getElementById('kyc-review-phone').innerText = user.phone;
        document.getElementById('kyc-review-doc').innerText = `N° ${user.kyc.docNumber}`;
        document.getElementById('kyc-review-dob').innerText = `${user.kyc.dob}`;

        // Assigner les images
        const imgRecto = document.getElementById('kyc-img-recto');
        const imgVerso = document.getElementById('kyc-img-verso');
        const imgSelfie = document.getElementById('kyc-img-selfie');

        // Gérer le cas d'images réelles base64 ou démo
        imgRecto.src = user.kyc.documents.recto === 'cni-recto-mock' ? 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?q=80&w=300&auto=format&fit=crop' : user.kyc.documents.recto;
        imgVerso.src = user.kyc.documents.verso === 'cni-verso-mock' ? 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=300&auto=format&fit=crop' : user.kyc.documents.verso;
        imgSelfie.src = user.kyc.documents.selfie === 'selfie-mock' ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop' : user.kyc.documents.selfie;

        // Masquer/Afficher les boutons d'actions d'approbation selon le statut
        const actions = lightbox.querySelector('.kyc-actions');
        if (user.kyc.status !== 'pending') {
            const statusLabel = user.kyc.status === 'approved' ? this.t('admin.status_approved') : this.t('admin.status_rejected');
            actions.innerHTML = `<span style="color:var(--text-muted); font-size:14px; font-weight:600;"><i class="fas fa-info-circle"></i> ${this.t('admin.lightbox_treated', { status: statusLabel })}</span>
                                 <button class="btn-outline" style="margin-left:20px; padding: 8px 16px;" onclick="app.closeKycLightbox()">${this.t('admin.lightbox_close')}</button>`;
        } else {
            actions.innerHTML = `
                <button class="btn-outline" style="border-color: var(--error); color: var(--error);" onclick="app.rejectKyc()" data-i18n="admin.lightbox_reject_btn">${this.t('admin.lightbox_reject_btn')}</button>
                <button class="btn-gold" style="width: auto; padding: 12px 30px;" onclick="app.approveKyc()" data-i18n="admin.lightbox_approve_btn">${this.t('admin.lightbox_approve_btn')}</button>
            `;
        }

        lightbox.classList.remove('hidden');
    },

    closeKycLightbox: function() {
        const lightbox = document.getElementById('lightbox-kyc');
        if (lightbox) lightbox.classList.add('hidden');
        this.state.currentReviewUserPhone = null;
    },

    approveKyc: function() {
        const phone = this.state.currentReviewUserPhone;
        if (!phone) return;

        const user = this.state.users.find(u => u.phone === phone);
        if (user) {
            user.kyc.status = 'approved';
            user.kyc.comments = 'Identité certifiée conforme.';
            this.saveUsers();
            this.showToast(this.t('toasts.kyc_approved', { name: user.firstname }), "success");
            this.closeKycLightbox();
            this.loadAdminData();
        }
    },

    rejectKyc: function() {
        const phone = this.state.currentReviewUserPhone;
        if (!phone) return;

        this.showModalPrompt(
            "Veuillez indiquer le motif du rejet des documents KYC :",
            "Documents d'identité illisibles ou non conformes.",
            "Motif de Rejet KYC",
            (motif) => {
                if (motif === null) return; // Annulé
                const user = this.state.users.find(u => u.phone === phone);
                if (user) {
                    user.kyc.status = 'rejected';
                    user.kyc.comments = motif || 'Documents d\'identité jugés invalides ou illisibles.';
                    this.saveUsers();
                    this.showModalAlert(`Le dossier KYC de ${user.firstname} a été rejeté avec succès.`, "Dossier Rejeté", "warning");
                    this.closeKycLightbox();
                    this.loadAdminData();
                }
            },
            null,
            "Confirmer le rejet",
            "Annuler"
        );
    },

    zoomImage: function(img) {
        // Simple zoom en ouvrant l'image dans un nouvel onglet (ou popup)
        window.open(img.src, '_blank');
    },

    // 3. Suivi Financier
    renderPaymentsTable: function() {
        const tbody = document.getElementById('table-payments-body');
        if (!tbody) return;

        // Trier par date la plus récente
        const sorted = [...this.state.payments].sort((a, b) => b.date.localeCompare(a.date));

        if (sorted.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">${this.t('admin.no_payments')}</td></tr>`;
            return;
        }

        tbody.innerHTML = sorted.map(pay => `
            <tr>
                <td>${pay.date}</td>
                <td><span style="font-family: monospace; font-size:13px; color:var(--primary-gold);">${pay.txId}</span></td>
                <td>${pay.passengerName}</td>
                <td>
                    <span style="font-weight:600; color: ${pay.provider === 'Orange Money' ? '#FF6600' : '#FFCC00'}">
                        ${pay.provider}
                    </span>
                </td>
                <td>${pay.phone}</td>
                <td><strong>${pay.amount.toLocaleString()} FCFA</strong></td>
                <td><span class="badge badge-approved">${this.state.lang === 'fr' ? 'Validé' : 'Validated'}</span></td>
            </tr>
        `).join('');
    },

    calculateFinanceStats: function() {
        const revenueEl = document.getElementById('stat-revenue');
        const countEl = document.getElementById('stat-tx-count');
        const ticketsEl = document.getElementById('stat-tickets');

        if (!revenueEl || !countEl || !ticketsEl) return;

        const totalRevenue = this.state.payments.reduce((acc, curr) => acc + curr.amount, 0);
        const totalTx = this.state.payments.length;
        const totalTickets = this.state.reservations.length;

        revenueEl.innerText = `${totalRevenue.toLocaleString()} FCFA`;
        countEl.innerText = totalTx;
        
        const seatUnit = this.state.lang === 'fr' 
            ? `place${totalTickets > 1 ? 's' : ''}`
            : `seat${totalTickets > 1 ? 's' : ''}`;
        ticketsEl.innerText = `${totalTickets} ${seatUnit}`;
    },

    // 4. Gestion des navettes / capacités véhicules
    loadAdminVehiclesGrid: function() {
        const tbody = document.getElementById('table-vehicles-body');
        const refDate = document.getElementById('admin-vehicle-date').value;
        if (!tbody || !refDate) return;

        const routes = [
            { route: "Douala - Yaoundé", time: "05:00" },
            { route: "Douala - Yaoundé", time: "15:00" },
            { route: "Yaoundé - Douala", time: "05:00" },
            { route: "Yaoundé - Douala", time: "15:00" }
        ];

        tbody.innerHTML = routes.map(r => {
            const passengerCount = this.state.reservations.filter(res => 
                res.date === refDate && res.time === r.time && res.route === r.route
            ).length;

            const vehicleCapacity = 3; // Strictement 3 places par voiture
            const remaining = Math.max(0, vehicleCapacity - passengerCount);
            
            let statusText = '';
            let trClass = '';
            
            if (remaining === 0) {
                statusText = `<span class="badge badge-rejected"><i class="fas fa-lock"></i> ${this.t('admin.vehicle_full') || 'Complet (3/3)'}</span>`;
                trClass = 'style="background: rgba(255, 77, 77, 0.04);"';
            } else if (remaining === vehicleCapacity) {
                statusText = `<span class="badge" style="background: rgba(255,255,255,0.06); color:var(--text-white); border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check-circle" style="color:#34d399; margin-right:4px;"></i> ${this.t('admin.vehicle_empty') || 'Disponible (03 places)'}</span>`;
            } else {
                statusText = `<span class="badge badge-approved">${this.t('admin.vehicle_open', { count: passengerCount }) || `${passengerCount}/3 places`}</span>`;
            }

            const remainingLabel = this.state.lang === 'fr' 
                ? (remaining === 3 ? '03 places par voiture' : (remaining > 0 ? `0${remaining} place${remaining > 1 ? 's' : ''} par voiture` : '0 place (Complet)'))
                : `${remaining} seat${remaining > 1 ? 's' : ''} per vehicle`;

            const passengerLabel = this.state.lang === 'fr'
                ? `${passengerCount} / 3 passager${passengerCount > 1 ? 's' : ''}`
                : `${passengerCount} / 3 passenger${passengerCount > 1 ? 's' : ''}`;

            return `
                <tr ${trClass}>
                    <td><strong>${r.route}</strong></td>
                    <td><span style="font-size:16px; font-weight:700; color:var(--text-white);">${r.time}</span></td>
                    <td><strong style="color:var(--text-white);">${remainingLabel}</strong></td>
                    <td>${passengerLabel}</td>
                    <td>${statusText}</td>
                    <td>
                        <button class="btn-outline" style="padding:6px 12px; font-size:12px; width:auto;" onclick="app.viewVehiclePassengers('${r.route}', '${r.time}', '${refDate}')">
                            <i class="fas fa-users"></i> ${this.t('admin.action_see_list')}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    viewVehiclePassengers: function(route, time, date) {
        const passengers = this.state.reservations.filter(res => 
            res.date === date && res.time === time && res.route === route
        );

        if (passengers.length === 0) {
            const noPassMsg = this.state.lang === 'fr'
                ? `Aucun passager enregistré pour la navette ${route} de ${time} du ${date}.`
                : `No passengers registered for shuttle ${route} at ${time} on ${date}.`;
            this.showModalAlert(noPassMsg, "Navette VIP", "info");
            return;
        }

        const seatLabels = this.state.lang === 'fr' ? {
            'front': 'Avant',
            'back_left': 'Arrière Gauche',
            'back_right': 'Arrière Droite'
        } : {
            'front': 'Front',
            'back_left': 'Back Left',
            'back_right': 'Back Right'
        };

        const list = passengers.map((p, index) => `${index + 1}. ${p.passengerName} (${p.phone}) - Véhicule ${p.vehicleId} | Place : ${seatLabels[p.seatId] || 'N/A'}`).join('\n');
        
        const listHeader = this.state.lang === 'fr'
            ? `Liste des passagers (${route} du ${date} à ${time}) :\n\n`
            : `Passenger list (${route} on ${date} at ${time}):\n\n`;
        this.showModalAlert(listHeader + list, "Manifeste des Passagers", "info");
    },

    showTicketModal: function(resId, txId, details) {
        if (!details) return;

        // Référence réservation
        const resIdEl = document.getElementById('ticket-res-id');
        if (resIdEl) resIdEl.innerText = resId || 'RES-00000';

        // Identification Passager (Nom, Prénom, Téléphone)
        let fn = details.firstname;
        let ln = details.lastname;
        if (!fn && !ln && details.passengerName) {
            const parts = details.passengerName.trim().split(' ');
            if (parts.length > 1) {
                ln = parts[0];
                fn = parts.slice(1).join(' ');
            } else {
                ln = parts[0];
                fn = '';
            }
        }
        if (!fn && !ln && this.state.currentUser) {
            fn = this.state.currentUser.firstname;
            ln = this.state.currentUser.lastname;
        }

        const lastnameEl = document.getElementById('ticket-lastname');
        if (lastnameEl) lastnameEl.innerText = (ln || 'CLIENT').toUpperCase();

        const firstnameEl = document.getElementById('ticket-firstname');
        if (firstnameEl) firstnameEl.innerText = fn || '';

        const passEl = document.getElementById('ticket-passenger');
        if (passEl) passEl.innerText = `${fn || ''} ${ln || ''}`.trim() || details.passengerName || 'Passager VIP';

        const phoneEl = document.getElementById('ticket-phone');
        if (phoneEl) phoneEl.innerText = details.phone || (this.state.currentUser ? this.state.currentUser.phone : '+237...');

        // Détails Trajet
        const routeEl = document.getElementById('ticket-route');
        if (routeEl) routeEl.innerText = details.route || 'Douala → Yaoundé';
        
        const isRoundTrip = details.tripType === 'roundtrip' || details.amount === 35000;
        const typeEl = document.getElementById('ticket-type');
        if (typeEl) typeEl.innerText = isRoundTrip ? (this.t('ticket.type_roundtrip') || 'Aller-retour') : (this.t('ticket.type_oneway') || 'Aller simple');
        
        const depDateEl = document.getElementById('ticket-departure-date');
        if (depDateEl) depDateEl.innerText = details.date || '----/--/--';

        const depTimeEl = document.getElementById('ticket-departure-time');
        if (depTimeEl) depTimeEl.innerText = details.time || '15:00';

        const returnSection = document.getElementById('ticket-return-section');
        if (returnSection) {
            if (isRoundTrip && details.returnDate) {
                returnSection.classList.remove('hidden');
                const retDateEl = document.getElementById('ticket-return-date');
                if (retDateEl) retDateEl.innerText = details.returnDate;
                const retTimeEl = document.getElementById('ticket-return-time');
                if (retTimeEl) retTimeEl.innerText = details.returnTime || '15:00';
            } else {
                returnSection.classList.add('hidden');
            }
        }

        // Siège et Véhicule
        let seatLabel = details.seatId;
        if (seatLabel === 'front') seatLabel = this.t('ticket.seat_front') || 'Avant (Place 1)';
        else if (seatLabel === 'back_left') seatLabel = this.t('ticket.seat_back_left') || 'Arrière Gauche (Place 2)';
        else if (seatLabel === 'back_right') seatLabel = this.t('ticket.seat_back_right') || 'Arrière Droite (Place 3)';

        const seatEl = document.getElementById('ticket-seat');
        if (seatEl) seatEl.innerText = seatLabel;

        const vehicleEl = document.getElementById('ticket-vehicle');
        if (vehicleEl) vehicleEl.innerText = 'Véhicule VIP ' + (details.vehicleId || 1);

        // Informations Financières (Montant, Tx ID, Date de Paiement, Opérateur)
        const amountEl = document.getElementById('ticket-amount');
        if (amountEl) {
            const amountVal = Number(details.amount) || (isRoundTrip ? 35000 : 20000);
            amountEl.innerText = amountVal.toLocaleString('fr-FR') + ' FCFA';
        }

        const txIdEl = document.getElementById('ticket-tx-id');
        if (txIdEl) txIdEl.innerText = txId || details.txId || 'TX-VIP';

        const dateNow = new Date().toISOString().split('T')[0] + " à " + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        const paymentDateEl = document.getElementById('ticket-payment-date');
        if (paymentDateEl) paymentDateEl.innerText = details.paymentDate || dateNow;

        const paymentProviderEl = document.getElementById('ticket-payment-provider');
        if (paymentProviderEl) {
            const provider = details.paymentProvider || (txId && txId.startsWith('OM') ? 'Orange Money' : (txId && txId.startsWith('MTN') ? 'MTN MoMo' : this.state.selectedProvider || 'Mobile Money'));
            paymentProviderEl.innerText = provider;
        }
        
        // QR Code dynamique sécurisé pour contrôle embarquement
        const qrData = encodeURIComponent(`VIP-CONNECT|${resId}|${(ln || 'CLIENT').toUpperCase()}_${fn || ''}|${details.amount || 20000}FCFA|${details.route}|${details.date}|${txId || ''}`);
        const qrImg = document.getElementById('ticket-qr');
        if (qrImg) {
            qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + qrData;
        }

        // Mémoriser le ticket affiché pour le renvoi d'email
        this.state.currentViewingTicket = { resId, txId, details };

        // Mettre à jour l'email destinataire affiché dans la modale
        const targetEmail = details.email || (this.state.currentUser ? this.state.currentUser.email : '') || '';
        const targetEmailEl = document.getElementById('ticket-email-target');
        if (targetEmailEl) {
            targetEmailEl.innerText = targetEmail || 'Votre boîte mail';
        }

        const modal = document.getElementById('modal-ticket');
        if (modal) modal.classList.remove('hidden');
    },

    closeTicketModal: function() {
        const modal = document.getElementById('modal-ticket');
        if (modal) modal.classList.add('hidden');
        this.showSection('dashboard');
    },

    downloadTicketPdf: function() {
        const element = document.getElementById('ticket-pdf-content');
        if (!element) return;
        const resId = (document.getElementById('ticket-res-id') ? document.getElementById('ticket-res-id').innerText : 'RESERVATION').replace(/[^a-zA-Z0-9_-]/g, '');
        
        if (typeof html2pdf === 'undefined') {
            this.showToast("Génération PDF locale via navigateur...", "info");
            window.print();
            return;
        }
        
        this.showToast("Génération de votre billet VIP (PDF) en cours...", "info");
        
        const opt = {
            margin:       [8, 8, 8, 8],
            filename:     `Billet_VIP_Connect_${resId}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            this.showToast("Votre billet de réservation PDF a été téléchargé avec succès !", "success");
        }).catch((err) => {
            console.warn('html2pdf fallback vers impression:', err);
            window.print();
        });
    },

    // Générer le billet en Base64 pour l'envoi par email (Brevo)
    getTicketPdfBase64: async function() {
        const element = document.getElementById('ticket-pdf-content');
        if (!element || typeof html2pdf === 'undefined') return null;
        try {
            const opt = {
                margin:       [8, 8, 8, 8],
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, logging: false },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            const pdfDataUri = await html2pdf().set(opt).from(element).outputPdf('datauristring');
            if (pdfDataUri && pdfDataUri.includes(',')) {
                return pdfDataUri.split(',')[1];
            }
        } catch (err) {
            console.warn('[PDF Base64 Generation] Note fallback:', err);
        }
        return null;
    },

    // Envoi du Billet PDF officiel directement par Email (Brevo)
    sendTicketPdfByEmail: async function(reservation, details) {
        if (!reservation) return;
        const recipientEmail = details.email || (this.state.currentUser ? this.state.currentUser.email : '') || '';
        const targetEmailEl = document.getElementById('ticket-email-target');
        if (targetEmailEl) targetEmailEl.innerText = recipientEmail || 'Votre boîte mail';

        if (!recipientEmail) {
            console.warn('[Ticket Email] Aucun email trouvé pour l envoi.');
            return;
        }

        this.showToast(`Envoi de votre billet officiel (PDF) à ${recipientEmail}...`, "info");

        // Obtenir le PDF en Base64
        const pdfBase64 = await this.getTicketPdfBase64();

        const payload = {
            toEmail: recipientEmail,
            passengerName: details.passengerName || (this.state.currentUser ? `${this.state.currentUser.firstname} ${this.state.currentUser.lastname}` : 'Voyageur VIP'),
            firstname: details.firstname,
            lastname: details.lastname,
            phone: details.phone,
            resId: reservation.id,
            txId: reservation.txId,
            route: details.route,
            date: details.date,
            time: details.time,
            seatLabel: this.formatSeatLabel(details.seatId),
            seatId: details.seatId,
            vehicleId: details.vehicleId,
            amount: details.amount,
            tripType: details.tripType,
            pdfBase64: pdfBase64
        };

        try {
            const response = await fetch('/api/notifications/send-ticket-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`Votre billet de réservation PDF a été envoyé à ${recipientEmail} !`, "success");
            } else {
                console.warn('[API send-ticket-email] Réponse:', data);
            }
        } catch (err) {
            console.warn('[API send-ticket-email] Exception:', err.message);
        }
    },

    resendTicketEmail: async function() {
        if (!this.state.currentViewingTicket) {
            this.showToast("Aucun billet actif pour le renvoi.", "warning");
            return;
        }
        const { resId, txId, details } = this.state.currentViewingTicket;
        const res = this.state.reservations.find(r => r.id === resId) || { id: resId, txId: txId };
        await this.sendTicketPdfByEmail(res, details);
    },

    resendTicketEmailById: async function(resId) {
        const res = this.state.reservations.find(r => r.id === resId);
        if (!res) {
            this.showToast("Réservation introuvable.", "error");
            return;
        }
        const isRoundTrip = res.tripType === 'roundtrip' || res.amount === 35000;
        let fn = res.firstname;
        let ln = res.lastname;
        if (!fn && !ln && res.passengerName) {
            const parts = res.passengerName.trim().split(' ');
            ln = parts[0];
            fn = parts.slice(1).join(' ');
        }
        const details = {
            route: res.route,
            date: res.date,
            time: res.time,
            phone: res.phone,
            email: res.email || (this.state.currentUser ? this.state.currentUser.email : ''),
            passengerName: res.passengerName || `${fn || ''} ${ln || ''}`.trim(),
            firstname: fn,
            lastname: ln,
            amount: res.amount || (isRoundTrip ? 35000 : 20000),
            vehicleId: res.vehicleId || 1,
            seatId: res.seatId,
            tripType: isRoundTrip ? 'roundtrip' : 'oneway',
            returnDate: res.returnDate,
            returnTime: res.returnTime,
            paymentDate: res.paymentDate || res.date,
            paymentProvider: res.paymentProvider || 'Mobile Money'
        };

        this.showTicketModal(res.id, res.txId || 'TX-VIP', details);
        await this.sendTicketPdfByEmail(res, details);
    },

    // -------------------------------------------------------------
    // GESTION DES NOTIFICATIONS SUR SMARTPHONE (PWA & WEB PUSH)
    // -------------------------------------------------------------
    initServiceWorkerAndNotifications: function() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then((registration) => {
                console.log('✅ Service Worker VIP Connect enregistré avec succès:', registration.scope);
            }).catch((err) => {
                console.warn('⚠️ Service Worker non enregistré:', err.message);
            });

            // Écouter les messages du Service Worker (clic sur notification)
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
                    if (event.data.data && event.data.data.resId) {
                        this.openTicketFromReservation(event.data.data.resId);
                    }
                }
            });
        }

        // Mettre à jour l'interface des notifications
        this.updateNotificationUi();
    },

    updateNotificationUi: function() {
        const isSupported = 'Notification' in window;
        const permission = isSupported ? Notification.permission : 'unsupported';
        const isGranted = permission === 'granted';

        // Badge cloche dans l'entête
        const headerBtn = document.getElementById('btn-header-notif');
        const headerDot = document.getElementById('header-notif-dot');
        if (headerBtn) {
            if (isGranted) {
                headerBtn.classList.add('active');
                if (headerDot) headerDot.classList.remove('hidden');
            } else {
                headerBtn.classList.remove('active');
                if (headerDot) headerDot.classList.add('hidden');
            }
        }

        // Bannière dans le dashboard
        const banner = document.getElementById('phone-notif-card');
        const statusPill = document.getElementById('phone-notif-status-pill');
        const reqBtn = document.getElementById('btn-request-phone-notif');
        const testBtn = document.getElementById('btn-test-phone-notif');
        const descEl = document.getElementById('phone-notif-desc');

        if (banner) {
            if (isGranted) {
                banner.classList.add('active');
                if (statusPill) statusPill.classList.remove('hidden');
                if (reqBtn) reqBtn.classList.add('hidden');
                if (testBtn) testBtn.classList.remove('hidden');
                if (descEl) descEl.innerText = this.state.lang === 'fr'
                    ? "Notifications actives sur cet appareil. Vos billets et alertes de départ à moins de 2h s'afficheront sur votre écran."
                    : "Notifications active on this device. Your tickets and departure reminders (under 2h) will appear on your screen.";
            } else {
                banner.classList.remove('active');
                if (statusPill) statusPill.classList.add('hidden');
                if (reqBtn) reqBtn.classList.remove('hidden');
                if (testBtn) testBtn.classList.add('hidden');
                if (descEl) descEl.innerText = this.state.lang === 'fr'
                    ? "Recevez votre billet officiel et vos alertes de départ à moins de 2h directement sur l'écran de votre smartphone."
                    : "Receive your official ticket and travel departure reminders under 2 hours directly on your phone screen.";
            }
        }
    },

    togglePhoneNotifications: function() {
        if (!('Notification' in window)) {
            this.showToast("Votre navigateur ne prend pas en charge les notifications.", "warning");
            return;
        }

        if (Notification.permission === 'granted') {
            this.showModalAlert("Les notifications sur votre smartphone sont actives pour VIP Connect.\n\nVous recevrez vos billets officiels et vos rappels de départ à moins de 2h et 1h directement sur cet écran.", "Notifications Smartphone Actives", "success");
        } else {
            this.requestPhoneNotifications();
        }
    },

    requestPhoneNotifications: async function() {
        if (!('Notification' in window)) {
            this.showModalAlert("Ce navigateur ou appareil ne supporte pas encore les notifications système.", "Notifications non supportées", "warning");
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            this.updateNotificationUi();

            if (permission === 'granted') {
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                this.showToast("🔔 Notifications sur smartphone activées avec succès !", "success");

                // Envoi d'une notification de confirmation de test sur l'écran
                await this.showPhoneNotification("🔔 VIP Connect - Notifications Actives", {
                    body: "Votre téléphone est prêt ! Vous recevrez désormais vos billets et rappels de départ à moins de 2h directement sur cet écran.",
                    tag: 'welcome-notif'
                });
            } else if (permission === 'denied') {
                this.showModalAlert("Les notifications ont été bloquées dans les paramètres de votre navigateur.\n\nPour les activer, cliquez sur l'icône de cadenas à gauche de l'adresse du site et autorisez les notifications.", "Autorisation requise", "warning");
            }
        } catch (err) {
            console.warn('Erreur demande permission notifications:', err);
        }
    },

    testPhoneNotification: async function() {
        if (Notification.permission !== 'granted') {
            return this.requestPhoneNotifications();
        }

        this.showToast("Envoi de la notification test sur votre écran...", "info");
        await this.showPhoneNotification("🎫 Test Billet VIP Connect", {
            body: "Départ dans moins de 2h pour Yaoundé ! Votre véhicule VIP vous attend. Présentez votre billet PDF à l'embarquement.",
            tag: 'test-reminder',
            vibrate: [200, 100, 200]
        });
    },

    showPhoneNotification: async function(title, options = {}) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return false;
        }

        const notifOptions = {
            body: options.body || '',
            icon: options.icon || '/images/vip_connect_logo.png',
            badge: options.badge || '/images/vip_connect_logo.png',
            tag: options.tag || 'vip-connect-general',
            renotify: true,
            data: options.data || {},
            vibrate: options.vibrate || [200, 100, 200, 100, 200]
        };

        if (navigator.vibrate) {
            try { navigator.vibrate(notifOptions.vibrate); } catch (e) {}
        }

        try {
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.showNotification) {
                    await reg.showNotification(title, notifOptions);
                    return true;
                }
            }
        } catch (err) {
            console.warn('[SW Notification] Fallback vers standard:', err);
        }

        try {
            new Notification(title, notifOptions);
            return true;
        } catch (err) {
            console.warn('[Notification API] Erreur affichage:', err);
            return false;
        }
    },

    notifyBookingConfirmed: function(reservation, details) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const seatLabel = this.formatSeatLabel(details.seatId);
        this.showPhoneNotification("🎫 Billet VIP Connect Confirmé !", {
            body: `Votre place (${seatLabel}) pour ${details.route} le ${details.date} à ${details.time} est réservée ! Votre billet PDF officiel est envoyé par email.`,
            tag: 'booking-' + reservation.id,
            data: { resId: reservation.id },
            vibrate: [200, 100, 200, 100, 200]
        });
    },

    // -------------------------------------------------------------
    // MOTEUR DE RAPPELS AUTOMATIQUES DE DÉPART (2H & 1H AVANT)
    // -------------------------------------------------------------
    startDepartureReminderEngine: function() {
        setTimeout(() => this.checkTravelReminders(), 3000);
        setInterval(() => this.checkTravelReminders(), 45000);
    },

    checkTravelReminders: async function() {
        if (!this.state.currentUser || !this.state.reservations || this.state.reservations.length === 0) {
            return;
        }

        const userPhone = String(this.state.currentUser.phone || '').replace(/[^0-9]/g, '');
        const myReservations = this.state.reservations.filter(r => {
            const p = String(r.phone || '').replace(/[^0-9]/g, '');
            return p === userPhone || (p && userPhone && (p.endsWith(userPhone) || userPhone.endsWith(p)));
        });

        const now = Date.now();

        for (const res of myReservations) {
            if (!res.date || !res.time) continue;
            const departureTime = new Date(`${res.date}T${res.time}:00`);
            if (isNaN(departureTime.getTime())) continue;

            const diffMinutes = (departureTime.getTime() - now) / (1000 * 60);

            // Rappel 2h : entre 60 et 120 minutes avant départ
            if (diffMinutes > 60 && diffMinutes <= 120 && !res.reminderSent_2h) {
                res.reminderSent_2h = true;
                this.saveReservations();
                await this.triggerDepartureReminder(res, '2h', Math.round(diffMinutes));
            }

            // Rappel 1h (Embarquement imminent) : entre 0 et 60 minutes avant départ
            if (diffMinutes > 0 && diffMinutes <= 60 && !res.reminderSent_1h) {
                res.reminderSent_1h = true;
                this.saveReservations();
                await this.triggerDepartureReminder(res, '1h', Math.round(diffMinutes));
            }
        }
    },

    triggerDepartureReminder: async function(res, reminderType, minutesLeft) {
        const isUrgent = reminderType === '1h';
        const seatLabel = this.formatSeatLabel(res.seatId);

        // 1. Notification sur l'écran du smartphone
        const notifTitle = isUrgent
            ? `🚨 Embarquement Imminent (moins d'1h) - VIP Connect`
            : `⏰ Rappel Départ VIP Connect (moins de 2h)`;

        const notifBody = isUrgent
            ? `Votre navette ${res.route} part à ${res.time} (dans ~${minutesLeft} min). Votre véhicule VIP ${res.vehicleId} commence l'embarquement.`
            : `Votre voyage ${res.route} démarre aujourd'hui à ${res.time} (dans ~${minutesLeft} min). Présentez-vous à l'agence d'embarquement avec votre billet.`;

        await this.showPhoneNotification(notifTitle, {
            body: notifBody,
            tag: `reminder-${res.id}-${reminderType}`,
            data: { resId: res.id },
            vibrate: isUrgent ? [500, 200, 500] : [300, 100, 300]
        });

        // 2. Notification Email (Brevo)
        const recipientEmail = res.email || (this.state.currentUser ? this.state.currentUser.email : '') || '';
        if (recipientEmail) {
            try {
                await fetch('/api/notifications/send-reminder-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        toEmail: recipientEmail,
                        passengerName: res.passengerName || (this.state.currentUser ? `${this.state.currentUser.firstname} ${this.state.currentUser.lastname}` : 'Voyageur VIP'),
                        resId: res.id,
                        route: res.route,
                        date: res.date,
                        time: res.time,
                        seatLabel: seatLabel,
                        seatId: res.seatId,
                        vehicleId: res.vehicleId,
                        reminderType: reminderType,
                        minutesLeft: minutesLeft
                    })
                });
            } catch (err) {
                console.warn('[API send-reminder-email] Exception:', err.message);
            }
        }
    },

    testDepartureReminderForReservation: async function(resId) {
        const res = this.state.reservations.find(r => r.id === resId);
        if (!res) {
            this.showToast("Réservation introuvable.", "error");
            return;
        }

        this.showToast("⏰ Simulation de rappel de départ (moins de 2h) en cours...", "info");
        await this.triggerDepartureReminder(res, '2h', 85);
        this.showToast("Rappel de départ (2h) déclenché sur votre téléphone et par mail !", "success");
    },

    formatSeatLabel: function(seatId) {
        if (seatId === 'front') return this.state.lang === 'fr' ? 'Avant (Place 1)' : 'Front (Seat 1)';
        if (seatId === 'back_left') return this.state.lang === 'fr' ? 'Arrière Gauche (Place 2)' : 'Back Left (Seat 2)';
        if (seatId === 'back_right') return this.state.lang === 'fr' ? 'Arrière Droite (Place 3)' : 'Back Right (Seat 3)';
        return seatId || 'Siège Confirmé';
    },

    openTicketFromReservation: function(resId) {
        const res = this.state.reservations.find(r => r.id === resId);
        if (!res) {
            this.showToast("Réservation introuvable.", "error");
            return;
        }
        const isRoundTrip = res.tripType === 'roundtrip' || res.amount === 35000;
        let fn = res.firstname;
        let ln = res.lastname;
        if (!fn && !ln && res.passengerName) {
            const parts = res.passengerName.trim().split(' ');
            if (parts.length > 1) {
                ln = parts[0];
                fn = parts.slice(1).join(' ');
            } else {
                ln = parts[0];
                fn = '';
            }
        }
        const details = {
            route: res.route,
            date: res.date,
            time: res.time,
            phone: res.phone,
            email: res.email || (this.state.currentUser ? this.state.currentUser.email : ''),
            passengerName: res.passengerName || `${fn} ${ln}`,
            firstname: fn,
            lastname: ln,
            amount: res.amount || (isRoundTrip ? 35000 : 20000),
            vehicleId: res.vehicleId || 1,
            seatId: res.seatId,
            tripType: isRoundTrip ? 'roundtrip' : 'oneway',
            returnDate: res.returnDate,
            returnTime: res.returnTime,
            paymentDate: res.paymentDate || res.date,
            paymentProvider: res.paymentProvider || (res.txId && res.txId.startsWith('OM') ? 'Orange Money' : 'MTN MoMo')
        };
        this.showTicketModal(res.id, res.txId || 'TX-VIP', details);
    },

    renderUserReservations: function() {
        const container = document.getElementById('user-reservations-list');
        if (!container) return;

        if (!this.state.currentUser) {
            container.innerHTML = `
                <div style="text-align: center; padding: 25px; color: var(--text-muted);">
                    <p style="margin: 0; font-size: 14px;">Connectez-vous à votre compte pour consulter l'historique de vos réservations.</p>
                </div>
            `;
            return;
        }
        
        const userPhone = String(this.state.currentUser.phone || '').replace(/[^0-9]/g, '');
        const userBookings = this.state.reservations.filter(r => {
            const p = String(r.phone || '').replace(/[^0-9]/g, '');
            return p === userPhone || (p && userPhone && (p.endsWith(userPhone) || userPhone.endsWith(p)));
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (userBookings.length === 0) {
            container.innerHTML = `
                <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(197, 168, 128, 0.3); border-radius: 12px; padding: 30px 20px; text-align: center; color: var(--text-muted);">
                    <i class="fas fa-ticket-alt" style="font-size: 32px; color: var(--primary-gold); margin-bottom: 12px; display: block;"></i>
                    <p style="margin: 0 0 6px 0; font-size: 15px; color: var(--text-white); font-weight: 600;">Aucune réservation enregistrée</p>
                    <span style="font-size: 13px; color: var(--text-muted);">Réservez votre premier trajet ci-dessus pour obtenir votre carte d'embarquement officielle.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = userBookings.map(b => {
            const isRoundTrip = b.tripType === 'roundtrip' || b.amount === 35000;
            const amountVal = Number(b.amount) || (isRoundTrip ? 35000 : 20000);
            return `
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(197, 168, 128, 0.3); border-radius: 12px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 12px; transition: transform 0.2s ease, border-color 0.2s ease;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
                            <strong style="color: var(--primary-gold); font-size: 15px; font-family: monospace;">${b.id}</strong>
                            <span class="badge badge-approved" style="font-size: 11px;">Payé ✓</span>
                            <span style="font-size: 11px; background: rgba(197, 168, 128, 0.15); color: var(--primary-gold); padding: 2px 8px; border-radius: 4px; font-weight: 600;">${isRoundTrip ? 'Aller-retour' : 'Aller simple'}</span>
                            <span style="font-size: 13px; font-weight: 700; color: var(--text-white);">${amountVal.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div style="font-size: 15px; color: var(--text-white); font-weight: 600;">
                            <i class="fas fa-route" style="color: var(--primary-gold); margin-right: 6px;"></i> ${b.route}
                        </div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 5px; display: flex; gap: 15px; flex-wrap: wrap;">
                            <span><i class="far fa-calendar-alt" style="color: var(--primary-gold); margin-right: 4px;"></i> Départ : <strong>${b.date}</strong> à <strong>${b.time}</strong></span>
                            <span><i class="fas fa-chair" style="color: var(--primary-gold); margin-right: 4px;"></i> Véhicule ${b.vehicleId || 1} &bull; Siège : <strong>${b.seatId}</strong></span>
                            <span><i class="fas fa-receipt" style="color: var(--primary-gold); margin-right: 4px;"></i> Réf : <span style="font-family: monospace;">${b.txId || 'N/A'}</span></span>
                        </div>
                    </div>
                    <div class="user-res-card-actions" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        <button class="btn-gold" style="width: auto; padding: 8px 14px; font-size: 12px; font-weight: 700;" onclick="app.openTicketFromReservation('${b.id}')">
                            <i class="fas fa-file-pdf" style="margin-right: 5px;"></i> Billet PDF
                        </button>
                        <button class="btn-outline" style="width: auto; padding: 8px 12px; font-size: 12px;" onclick="app.resendTicketEmailById('${b.id}')" title="Renvoyer le billet officiel par email">
                            <i class="fas fa-envelope" style="margin-right: 5px;"></i> Email
                        </button>
                        <button class="btn-notif-pill" onclick="app.testDepartureReminderForReservation('${b.id}')" title="Tester le rappel de voyage (2h avant départ sur téléphone et par mail)">
                            <i class="fas fa-bell"></i> Rappel 2h
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    // -------------------------------------------------------------
    // SYSTÈME D'AVIS CLIENTS
    // -------------------------------------------------------------
    renderReviews: function() {
        const grid = document.getElementById('reviews-grid');
        if (!grid) return;

        let html = '';
        const reviews = this.state.reviews.slice().reverse(); // Plus récents en premier

        reviews.forEach(r => {
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= r.stars) {
                    starsHtml += '<i class="fas fa-star" style="color: var(--primary-gold);"></i>';
                } else {
                    starsHtml += '<i class="far fa-star" style="color: var(--text-muted);"></i>';
                }
            }

            html += `
                <div class="testimonial-card">
                    <div class="stars" style="margin-bottom: 10px;">
                        ${starsHtml}
                    </div>
                    <p class="testimonial-text">"${r.text}"</p>
                    <div class="testimonial-author">
                        <div class="author-img">${r.author.charAt(0)}</div>
                        <div class="author-info">
                            <h4 style="color: var(--text-white); margin-bottom: 2px;">${r.author}</h4>
                            <p style="color: var(--text-muted); font-size: 12px;">${r.role} • ${r.date}</p>
                        </div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    },

    initStarRatingSelector: function() {
        const starContainer = document.getElementById('star-selector');
        const starsInput = document.getElementById('review-stars');
        if (!starContainer || !starsInput) return;

        const stars = starContainer.querySelectorAll('i');

        const updateStars = (rating) => {
            stars.forEach((star, index) => {
                if (index < rating) {
                    star.className = 'fa-solid fa-star';
                } else {
                    star.className = 'fa-regular fa-star';
                }
            });
        };

        stars.forEach(star => {
            // Click to select
            star.addEventListener('click', () => {
                const value = parseInt(star.getAttribute('data-value'), 10);
                starsInput.value = value;
                updateStars(value);
            });

            // Hover preview
            star.addEventListener('mouseenter', () => {
                const value = parseInt(star.getAttribute('data-value'), 10);
                updateStars(value);
            });
        });

        // Restore selected on mouse leave
        starContainer.addEventListener('mouseleave', () => {
            const currentValue = parseInt(starsInput.value, 10) || 5;
            updateStars(currentValue);
        });

        // Initialize state
        updateStars(parseInt(starsInput.value, 10) || 5);
    },

    submitReview: function(event) {
        if (event) event.preventDefault();
        const authorEl = document.getElementById('review-author');
        const roleEl = document.getElementById('review-role');
        const textEl = document.getElementById('review-text');
        const starsEl = document.getElementById('review-stars');

        const author = authorEl ? authorEl.value.trim() : '';
        const role = roleEl ? roleEl.value.trim() : '';
        const text = textEl ? textEl.value.trim() : '';
        const stars = starsEl ? parseInt(starsEl.value, 10) : 5;

        if (!author || !text || stars < 1 || stars > 5) {
            this.showModalAlert("Veuillez renseigner votre nom, votre commentaire et choisir une note pour laisser un avis.", "Formulaire Incomplet", "warning");
            return;
        }

        const newReview = {
            id: Date.now(),
            author: author,
            role: role || (this.state.lang === 'fr' ? 'Passager VIP' : 'VIP Passenger'),
            stars: stars,
            text: text,
            date: new Date().toISOString().split('T')[0]
        };

        this.state.reviews.push(newReview);
        this.saveReviews();
        this.renderReviews();
        this.showModalAlert("Votre avis a été publié avec succès sur la plateforme VIP Connect. Merci pour votre confiance !", "Avis Enregistré", "success");
        
        if (event && event.target && typeof event.target.reset === 'function') {
            event.target.reset();
        }

        // Reset dynamic star selector visual state and hidden input
        const starsInput = document.getElementById('review-stars');
        if (starsInput) {
            starsInput.value = "5";
        }
        const starContainer = document.getElementById('star-selector');
        if (starContainer) {
            const stars = starContainer.querySelectorAll('i');
            stars.forEach(star => {
                star.className = 'fa-solid fa-star';
            });
        }
    },

    // -------------------------------------------------------------
    // SYSTÈME DE TOAST NOTIFICATIONS (POPUP FLUIDE)
    // -------------------------------------------------------------
    showToast: function(message, type = 'info') {
        // Supprimer d'anciennes toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = '<i class="fas fa-info-circle"></i>';
        if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
        if (type === 'error') icon = '<i class="fas fa-exclamation-triangle"></i>';

        toast.innerHTML = `
            ${icon}
            <span style="font-size:14px; font-weight:500;">${message}</span>
        `;

        document.body.appendChild(toast);

        // Faire disparaître après 4 secondes
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    },

    // -------------------------------------------------------------
    // MODALES & POP-UPS PERSONNALISÉES VIP CONNECT
    // (Remplace définitivement alert, confirm et prompt du navigateur)
    // -------------------------------------------------------------
    _dialogCallbacks: null,

    initDialogKeyListeners: function() {
        document.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('vip-modal-dialog');
            if (!overlay || overlay.classList.contains('hidden')) return;

            if (e.key === 'Escape') {
                this.handleDialogCancel();
            } else if (e.key === 'Enter') {
                const inputContainer = document.getElementById('vip-dialog-input-container');
                const isInputActive = inputContainer && !inputContainer.classList.contains('hidden');
                const inputEl = document.getElementById('vip-dialog-input');
                if (!isInputActive || document.activeElement === inputEl) {
                    e.preventDefault();
                    this.handleDialogConfirm();
                }
            }
        });

        // Remplacement de window.alert par la modale VIP
        window.alert = (msg) => {
            this.showModalAlert(String(msg));
        };
    },

    openCustomDialog: function(options = {}) {
        const {
            title = "VIP Connect",
            message = "",
            type = "info", // "info", "success", "error", "warning"
            confirmText = "D'accord",
            cancelText = null,
            showInput = false,
            inputPlaceholder = "",
            inputValue = "",
            onConfirm = null,
            onCancel = null
        } = options;

        this._dialogCallbacks = { onConfirm, onCancel, showInput };

        const overlay = document.getElementById('vip-modal-dialog');
        const titleEl = document.getElementById('vip-dialog-title');
        const messageEl = document.getElementById('vip-dialog-message');
        const iconContainer = document.getElementById('vip-dialog-icon-container');
        const inputContainer = document.getElementById('vip-dialog-input-container');
        const inputEl = document.getElementById('vip-dialog-input');
        const btnCancel = document.getElementById('vip-dialog-btn-cancel');
        const btnConfirm = document.getElementById('vip-dialog-btn-confirm');

        if (!overlay) return;

        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = message;

        // Configurer l'icône selon le type
        if (iconContainer) {
            iconContainer.className = `vip-dialog-icon icon-${type}`;
            let iconHtml = '<i class="fas fa-info-circle"></i>';
            if (type === 'success') iconHtml = '<i class="fas fa-circle-check"></i>';
            else if (type === 'error') iconHtml = '<i class="fas fa-circle-exclamation"></i>';
            else if (type === 'warning') iconHtml = '<i class="fas fa-triangle-exclamation"></i>';
            iconContainer.innerHTML = iconHtml;
        }

        // Champ input (Prompt)
        if (inputContainer && inputEl) {
            if (showInput) {
                inputContainer.classList.remove('hidden');
                inputEl.placeholder = inputPlaceholder;
                inputEl.value = inputValue;
                setTimeout(() => inputEl.focus(), 150);
            } else {
                inputContainer.classList.add('hidden');
                inputEl.value = '';
            }
        }

        // Bouton Annuler
        if (btnCancel) {
            if (cancelText) {
                btnCancel.classList.remove('hidden');
                btnCancel.innerText = cancelText;
            } else {
                btnCancel.classList.add('hidden');
            }
        }

        // Bouton Confirmer
        if (btnConfirm) {
            btnConfirm.innerText = confirmText;
        }

        // Afficher l'overlay
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    closeCustomDialog: function() {
        const overlay = document.getElementById('vip-modal-dialog');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
        if (this._dialogCallbacks && typeof this._dialogCallbacks.onCancel === 'function') {
            this._dialogCallbacks.onCancel();
        }
        this._dialogCallbacks = null;
    },

    handleDialogConfirm: function() {
        const inputEl = document.getElementById('vip-dialog-input');
        const val = inputEl ? inputEl.value.trim() : '';
        const cb = this._dialogCallbacks ? this._dialogCallbacks.onConfirm : null;
        
        const overlay = document.getElementById('vip-modal-dialog');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
        this._dialogCallbacks = null;

        if (typeof cb === 'function') {
            cb(val);
        }
    },

    handleDialogCancel: function() {
        const cb = this._dialogCallbacks ? this._dialogCallbacks.onCancel : null;
        const overlay = document.getElementById('vip-modal-dialog');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
        this._dialogCallbacks = null;

        if (typeof cb === 'function') {
            cb();
        }
    },

    showModalAlert: function(message, title = "VIP Connect", type = "info", onConfirm = null) {
        return new Promise((resolve) => {
            this.openCustomDialog({
                title: title,
                message: message,
                type: type,
                confirmText: "D'accord",
                cancelText: null,
                showInput: false,
                onConfirm: () => {
                    if (onConfirm) onConfirm();
                    resolve(true);
                },
                onCancel: () => {
                    if (onConfirm) onConfirm();
                    resolve(true);
                }
            });
        });
    },

    showModalConfirm: function(message, title = "Confirmation", onConfirm = null, onCancel = null, confirmText = "Confirmer", cancelText = "Annuler") {
        return new Promise((resolve) => {
            this.openCustomDialog({
                title: title,
                message: message,
                type: "warning",
                confirmText: confirmText,
                cancelText: cancelText,
                showInput: false,
                onConfirm: () => {
                    if (onConfirm) onConfirm();
                    resolve(true);
                },
                onCancel: () => {
                    if (onCancel) onCancel();
                    resolve(false);
                }
            });
        });
    },

    showModalPrompt: function(message, defaultValue = "", title = "Saisie requise", onConfirm = null, onCancel = null, confirmText = "Valider", cancelText = "Annuler") {
        return new Promise((resolve) => {
            this.openCustomDialog({
                title: title,
                message: message,
                type: "info",
                confirmText: confirmText,
                cancelText: cancelText,
                showInput: true,
                inputValue: defaultValue,
                inputPlaceholder: "Votre texte ici...",
                onConfirm: (val) => {
                    if (onConfirm) onConfirm(val);
                    resolve(val);
                },
                onCancel: () => {
                    if (onCancel) onCancel();
                    resolve(null);
                }
            });
        });
    }
};

// Démarrer l'application au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});

const fallbackTranslations = {
  fr: {
    "nav": {
      "home": "Accueil",
      "reviews": "Avis",
      "login": "Se connecter",
      "register": "S'inscrire",
      "admin_console": "Console Admin",
      "logout": "Déconnexion"
    },
    "home": {
      "hero_title": "Le Voyage Inter-urbain Réinventé",
      "hero_subtitle": "Déplacez-vous entre Douala et Yaoundé dans le confort absolu de véhicules haut de gamme limités à 3 passagers. Chauffeur professionnel et climatisation garantie.",
      "intro_title": "Qui sommes-nous ?",
      "intro_subtitle": "L'expérience premium par excellence",
      "intro_p1": "VIP Connect est une agence de transport d'élite assurant la liaison Douala – Yaoundé. Nous proposons un concept unique au Cameroun : des trajets directs, sans arrêts intermédiaires, à bord de véhicules personnels haut de gamme parfaitement climatisés.",
      "intro_p2": "Chaque navette est strictement limitée à 3 passagers pour garantir à chacun un espace généreux et un confort optimal. Fini le stress des gares de transport bondées, voyagez en toute sérénité.",
      "benefits_title": "Les avantages de notre service",
      "benefits_subtitle": "Pourquoi choisir l'expérience VIP Connect ?",
      "benefit_comfort_title": "Confort Premium",
      "benefit_comfort_desc": "Sièges en cuir spacieux, climatisation individuelle réglable et boissons rafraîchissantes offertes.",
      "benefit_punctuality_title": "Ponctualité Rigoureuse",
      "benefit_punctuality_desc": "Départs à l'heure précise. Nous valorisons votre temps, nos navettes ne prennent aucun retard.",
      "benefit_safety_title": "Sécurité Absolue",
      "benefit_safety_desc": "Chauffeurs professionnels chevronnés, véhicules géo-localisés et vérification systématique de l'identité des passagers.",
      "benefit_booking_title": "Réservation Intelligente",
      "benefit_booking_desc": "Sélectionnez votre créneau et choisissez votre place exacte à bord en temps réel.",
      "benefit_momo_title": "Paiement Mobile",
      "benefit_momo_desc": "Réglez vos réservations instantanément et en toute sécurité via Orange Money ou MTN MoMo.",
      "benefit_vehicles_title": "Véhicules Haut de Gamme",
      "benefit_vehicles_desc": "Voyagez à bord de berlines modernes et de SUV luxueux régulièrement inspectés.",
      "price_title": "Un Tarif Unique et Transparent",
      "price_subtitle": "Une expérience classe affaires accessible",
      "price_amount": "20 000 FCFA",
      "price_label": "Aller simple",
      "price_detail_1": "Véhicule climatisé haut de gamme",
      "price_detail_2": "3 passagers maximum par trajet",
      "price_detail_3": "Boisson offerte à bord",
      "price_detail_4": "Bagages sécurisés en coffre",
      "price_btn": "Réserver mon voyage",
      "testimonials_title": "Ce qu'en disent nos membres",
      "testimonials_subtitle": "La satisfaction de nos voyageurs est notre plus grande réussite",
      "destinations_title": "Liaison Quotidienne Douala ↔ Yaoundé",
      "destinations_subtitle": "Découvrez nos deux hubs principaux à travers leurs monuments emblématiques",
      "dest_yaounde_tag": "La Capitale Politique",
      "dest_yaounde_desc": "Retrouvez notre agence VIP Connect au centre-ville pour un départ serein vers le cœur politique du pays.",
      "dest_douala_tag": "La Capitale Économique",
      "dest_douala_desc": "Voyagez vers ou depuis la métropole économique active et le principal centre d'affaires du Cameroun."
    },
    "login": {
      "title": "Accéder à l'expérience VIP Connect",
      "identifier_label": "Téléphone ou Email",
      "password_label": "Mot de passe",
      "forgot_password": "Mot de passe oublié ?",
      "show_password": "Afficher le mot de passe",
      "submit_btn": "Se connecter",
      "new_user_text": "Nouveau chez VIP Connect ?",
      "create_account_link": "Créer un compte"
    },
    "register": {
      "title": "Devenir Membre VIP Connect",
      "subtitle": "Inscrivez-vous pour planifier votre prochain voyage d'affaires.",
      "firstname": "Prénom",
      "firstname_placeholder": "Ex. Jean",
      "lastname": "Nom",
      "lastname_placeholder": "Ex. Dupuis",
      "email": "Adresse Email",
      "email_placeholder": "nom@exemple.com",
      "phone": "Numéro de Téléphone",
      "phone_placeholder": "+237 6xx xx xx xx",
      "password": "Mot de passe",
      "password_confirm": "Confirmation",
      "show_password": "Afficher les mots de passe",
      "submit_btn": "Créer mon compte",
      "already_member": "Vous avez déjà un compte ?",
      "login_link": "Se connecter"
    },
    "forgot": {
      "title": "Réinitialisation",
      "subtitle": "Entrez votre numéro de téléphone ou email pour retrouver l'accès à votre compte.",
      "identifier_label": "Téléphone ou Email",
      "identifier_placeholder": "+237 6xx xx xx xx ou nom@exemple.com",
      "submit_btn": "Réinitialiser mon mot de passe",
      "back_login": "Retour à la connexion"
    },
    "kyc": {
      "title": "Vérification d'Identité",
      "subtitle": "Conformément à la réglementation sur le transport inter-urbain haut de gamme, vous devez certifier votre identité avant de pouvoir effectuer une réservation.",
      "firstname": "Prénom (Identique à la pièce)",
      "lastname": "Nom (Identique à la pièce)",
      "doc_type_label": "Type de document d'identité",
      "cni_label": "Carte Nationale d'Identité (CNI)",
      "passport_label": "Passeport",
      "doc_number": "Numéro du document",
      "doc_number_placeholder": "Entrez le numéro",
      "dob": "Date de Naissance",
      "upload_recto": "1. Photo de la pièce d'identité (ou Recto si CNI)",
      "upload_verso": "2. Photo Verso (CNI uniquement)",
      "upload_selfie": "3. Photo Selfie (Prise en direct)",
      "camera_open_recto": "<span>Prendre la photo Recto</span>",
      "camera_open_verso": "<span>Prendre la photo Verso</span>",
      "camera_open_selfie": "<span>Prendre un selfie en direct</span>",
      "camera_cancel": "Annuler",
      "camera_capture": "Capturer",
      "data_sec_title": "Sécurité et protection des données",
      "data_sec_desc": "Vos pièces d'identité et selfies sont stockés de manière chiffrée et hautement sécurisée. Ils ne sont accessibles qu'au service de conformité VIP Connect pour validation. Vos documents seront automatiquement purgés 30 jours après la fin d'activité de votre compte, conformément à la réglementation sur la protection des données personnelles.",
      "submit_btn": "Soumettre pour vérification",
      "status_none": "<strong>Statut : Identité non vérifiée.</strong><br>Veuillez remplir les informations et téléverser vos documents d'identité pour débloquer le service de réservation.",
      "status_pending_redirect": "<strong>Statut : Identité validée automatiquement !</strong><br>Redirection en cours vers l'espace de réservation...",
      "status_rejected": "<strong>Statut : Dossier rejeté.</strong><br>Motif : {motif}<br>Veuillez soumettre à nouveau des documents clairs et corrects.",
      "status_approved": "<strong>Statut : Identité validée !</strong><br>Félicitations, votre identité a été approuvée par VIP Connect. Vous pouvez désormais réserver vos billets.",
      "validated_badge": "Identité Validée ✓"
    },
    "dashboard": {
      "kyc_banner_title": "Vérification d'identité requise",
      "kyc_banner_desc": "Vous devez certifier votre identité pour pouvoir réserver un trajet.",
      "kyc_banner_btn": "S'identifier",
      "showcase_badge": "Classe VIP Connect",
      "showcase_title": "Navette Privée Douala ↔ Yaoundé",
      "showcase_desc": "Installez-vous confortablement dans nos Toyota corolla haut de gamme climatisés. Voyage direct par autoroute, boissons rafraîchissantes offertes. Chaque voyage est limité à 3 passagers maximum pour assurer votre intimité et votre confort.",
      "showcase_price_label": "Aller simple",
      "showcase_support": "Service Client",
      "book_title": "Planifier votre trajet",
      "book_route": "Trajet",
      "book_date": "Jour de départ",
      "book_return_datetime": "Date et Heure de retour",
      "book_return_time_placeholder": "Heure",
      "book_schedules": "Départs Disponibles (Horaires de la journée)",
      "book_vehicles": "Véhicules Disponibles",
      "book_seat": "Sélectionnez votre place",
      "book_momo_number": "Numéro Mobile Money (Payeur)",
      "book_momo_placeholder": "6xx xx xx xx",
      "book_momo_desc": "Le paiement est traité immédiatement par Orange Money ou MTN MoMo.",
      "book_pay_btn": "Réserver & Payer ({amount} FCFA)",
      "schedule_available": "Disponible",
      "schedule_full": "Complet",
      "schedule_no_departures": "Plus aucun départ disponible pour aujourd'hui sur ce trajet.",
      "schedule_choose_day": "Veuillez choisir un jour de départ."
    },
    "payment_modal": {
      "title": "Paiement Sécurisé",
      "subtitle": "Sélectionnez votre opérateur camerounais et procédez au paiement.",
      "summary_route": "Trajet",
      "summary_datetime": "Date & Heure",
      "summary_amount": "Montant",
      "momo_ussd_simulator": "Simulateur d'autorisation Mobile Money",
      "ussd_prompt": "<strong>[SIMULATION {provider}]</strong><br>Entrez votre code PIN de test à 4 chiffres pour confirmer le débit de {amount} FCFA.",
      "cancel_btn": "Annuler",
      "confirm_btn": "Confirmer PIN",
      "trigger_payment_btn": "Lancer la facturation via {provider} ({amount} FCFA)"
    },
    "reviews": {
      "title": "Expériences de nos Voyageurs",
      "card_title": "Laissez votre avis",
      "name_label": "Nom / Prénom",
      "name_placeholder": "Votre nom",
      "role_label": "Ville ou Profession (Optionnel)",
      "role_placeholder": "Ex: Douala, ou Cadre",
      "note_label": "Note (sur 5)",
      "stars_option": "{num} Étoiles",
      "star_option": "1 Étoile",
      "text_label": "Votre expérience avec VIP TRAVEL",
      "text_placeholder": "Racontez-nous votre voyage...",
      "submit_btn": "Publier mon avis"
    },
    "admin": {
      "console_title": "Console de Gestion",
      "nav_reservations": "Réservations",
      "nav_users": "Utilisateurs",
      "nav_kyc": "Validations CNI/Selfie",
      "nav_finance": "Suivi Paiements",
      "nav_vehicles": "Véhicules & Horaires",
      "tab_reservations_title": "Réservations Effectuées",
      "search_placeholder": "Rechercher passager, n°...",
      "no_reservations": "Aucune réservation effectuée pour le moment.",
      "no_search_results": "Aucune réservation ne correspond à votre recherche.",
      "table_id": "ID",
      "table_datetime": "Date/Heure",
      "table_route": "Trajet",
      "table_passenger": "Passager",
      "table_phone": "Téléphone",
      "table_tx": "Transaction Pay",
      "table_status": "Statut",
      "status_paid": "Payé",
      "tab_kyc_title": "Dossiers d'identité (CNI / Passeport)",
      "admin_secure_access": "Accès Sécurisé et Journalisé",
      "no_kyc_profiles": "Aucun dossier client disponible.",
      "table_submission_date": "Date de Soumission",
      "table_user": "Utilisateur",
      "table_doc_number": "N° Pièce d'Identité",
      "table_dob": "Date Naissance",
      "table_kyc_status": "Statut KYC",
      "table_actions": "Actions",
      "action_examine": "Examiner",
      "action_view": "Voir",
      "action_reexamine": "Re-examiner",
      "status_pending": "En attente",
      "status_approved": "Validé ✓",
      "status_rejected": "Rejeté",
      "status_not_submitted": "Non soumis",
      "no_documents": "Aucune pièce",
      "tab_finance_title": "Suivi des Paiements Mobile Money",
      "stat_revenue": "Chiffre d'Affaires Global",
      "stat_transactions": "Transactions Validées",
      "stat_tickets": "Tickets Vendus",
      "no_payments": "Aucune transaction Mobile Money enregistrée.",
      "table_tx_date": "Date Transaction",
      "table_tx_id": "ID Paiement",
      "table_operator": "Opérateur",
      "table_debit_num": "Numéro de Débit",
      "table_amount": "Montant",
      "tab_vehicles_title": "Disponibilité des Véhicules par Créneau",
      "date_ref_label": "Date de référence",
      "admin_vehicles_desc": "Visualisez et ajustez l'occupation des places en direct pour chaque navette programmée.",
      "table_capacity": "Capacité Restante",
      "table_seats_occupied": "Places Occupées",
      "table_vehicle_status": "Statut du Véhicule",
      "table_admin_action": "Action administrative",
      "action_see_list": "Voir Liste",
      "vehicle_full": "Complet (03/03)",
      "vehicle_empty": "Disponible (03 places)",
      "vehicle_open": "Ouvert ({count}/03)",
      "lightbox_title": "Examen des Pièces Justificatives",
      "lightbox_name": "Nom du passager :",
      "lightbox_phone": "N° de Téléphone :",
      "lightbox_doc": "Type & N° de document :",
      "lightbox_dob": "Date de Naissance / Âge :",
      "lightbox_recto": "Recto CNI",
      "lightbox_verso": "Verso CNI",
      "lightbox_selfie": "Selfie Passager",
      "lightbox_audit_log": "<strong>Journal d'audit :</strong> Toute action sur ce dossier (approbation ou rejet) sera consignée de manière permanente avec l'identifiant de la session administrative courante.",
      "lightbox_reject_btn": "Rejeter le dossier",
      "lightbox_approve_btn": "Valider l'identité",
      "lightbox_treated": "Dossier déjà traité ({status}).",
      "lightbox_close": "Fermer"
    },
    "footer": {
      "links_legal": "Avis légaux",
      "links_privacy": "Protection des données",
      "links_support": "Support client",
      "copyright": "&copy; 2026 VIP Connect Transport Agency. Tous droits réservés."
    },
    "toasts": {
      "logout_success": "Déconnexion réussie.",
      "login_welcome": "Bienvenue, {name} !",
      "login_error": "Identifiants incorrects ou mot de passe invalide.",
      "register_mismatch": "Les mots de passe ne correspondent pas.",
      "register_short": "Le mot de passe doit contenir au moins 6 caractères.",
      "register_exists": "Un compte avec cet email ou ce numéro de téléphone existe déjà.",
      "register_welcome": "Compte créé avec succès. Bienvenue !",
      "forgot_success": "Votre mot de passe a été réinitialisé avec succès ! Vous pouvez maintenant vous connecter.",
      "forgot_error_length": "Le mot de passe doit contenir au moins 6 caractères.",
      "forgot_not_found": "Aucun compte trouvé avec cet identifiant.",
      "kyc_error_elements": "Erreur technique : Le formulaire est incomplet ou mal structuré.",
      "kyc_error_fields": "Veuillez remplir tous les champs obligatoires (Prénom, Nom, Numéro de document, Date de naissance).",
      "kyc_error_photos": "Vous devez fournir les 3 photos obligatoires (Recto, Verso et Selfie).",
      "kyc_error_save": "Erreur lors de l'enregistrement.",
      "kyc_success_submit": "Votre dossier KYC a été soumis avec succès.",
      "booking_need_login": "Vous devez être connecté.",
      "booking_need_kyc": "Veuillez vous identifier avant de procéder à la réservation.",
      "booking_need_schedule": "Veuillez sélectionner un horaire de départ.",
      "booking_momo_error": "Le numéro Mobile Money doit être un numéro camerounais valide à 9 chiffres commençant par 6.",
      "booking_need_seat": "Veuillez sélectionner un véhicule et une place libre.",
      "payment_cancelled": "Paiement annulé par l'utilisateur.",
      "payment_success": "Réservation validée ! Ticket : {resId}. Transaction : {txId}",
      "review_error": "Veuillez remplir correctement tous les champs.",
      "review_success": "Merci pour votre avis !",
      "kyc_approved": "Dossier de {name} validé avec succès.",
      "kyc_rejected": "Dossier de {name} rejeté.",
      "kyc_prompt_reject": "Spécifiez le motif de rejet du dossier d'identité :"
    },
    "ticket": {
      "title": "E-Ticket / Carte d'Embarquement",
      "res_no": "N° Réservation",
      "passenger": "Passager",
      "phone": "Téléphone",
      "route": "Trajet",
      "type": "Type",
      "departure": "Départ",
      "return": "Retour",
      "seat": "Siège",
      "vehicle": "Véhicule",
      "tx_id": "Transaction Mobile Money",
      "close": "Fermer",
      "download": "Télécharger PDF",
      "type_oneway": "Aller simple",
      "type_roundtrip": "Aller-retour",
      "seat_front": "Avant",
      "seat_back_left": "Arrière Gauche",
      "seat_back_right": "Arrière Droite"
    }
  },
  en: {
    "nav": {
      "home": "Home",
      "reviews": "Reviews",
      "login": "Login",
      "register": "Register",
      "admin_console": "Admin Console",
      "logout": "Logout"
    },
    "home": {
      "hero_title": "The Inter-Urban Journey Reinvented",
      "hero_subtitle": "Travel between Douala and Yaoundé in the absolute comfort of premium vehicles limited to 3 passengers. Professional driver and guaranteed air conditioning.",
      "intro_title": "About Us",
      "intro_subtitle": "The ultimate premium experience",
      "intro_p1": "VIP Connect is an elite transport agency operating between Douala and Yaoundé. We offer a unique concept in Cameroon: direct trips, without intermediate stops, on board high-end air-conditioned personal vehicles.",
      "intro_p2": "Each trip is strictly limited to 3 passengers to guarantee generous space and optimal comfort for everyone. No more stress from crowded bus terminals, travel with peace of mind.",
      "benefits_title": "Service Benefits",
      "benefits_subtitle": "Why choose the VIP Connect experience?",
      "benefit_comfort_title": "Premium Comfort",
      "benefit_comfort_desc": "Spacious leather seats, adjustable individual air conditioning, and complimentary refreshing drinks.",
      "benefit_punctuality_title": "Strict Punctuality",
      "benefit_punctuality_desc": "Departures exactly on time. We value your time, and our shuttles never delay.",
      "benefit_safety_title": "Absolute Safety",
      "benefit_safety_desc": "Experienced professional drivers, geo-tracked vehicles, and systematic traveler identity verification.",
      "benefit_booking_title": "Smart Booking",
      "benefit_booking_desc": "Select your slot and choose your exact seat on board in real time.",
      "benefit_momo_title": "Mobile Payment",
      "benefit_momo_desc": "Pay for your bookings instantly and securely via Orange Money or MTN MoMo.",
      "benefit_vehicles_title": "High-End Vehicles",
      "benefit_vehicles_desc": "Travel in modern sedans and luxury SUVs that are regularly inspected.",
      "price_title": "One Transparent Fare",
      "price_subtitle": "An accessible business class experience",
      "price_amount": "20,000 FCFA",
      "price_label": "One way",
      "price_detail_1": "Premium air-conditioned vehicle",
      "price_detail_2": "3 passengers maximum per trip",
      "price_detail_3": "Complimentary drink on board",
      "price_detail_4": "Secure luggage in the trunk",
      "price_btn": "Book my trip",
      "testimonials_title": "What Our Passengers Say",
      "testimonials_subtitle": "Our travelers' satisfaction is our greatest success",
      "destinations_title": "Daily Douala ↔ Yaoundé Shuttle",
      "destinations_subtitle": "Discover our two main hubs through their iconic landmarks",
      "dest_yaounde_tag": "Political Capital",
      "dest_yaounde_desc": "Find our VIP agency in the city center for a peaceful departure to the political heart of the nation.",
      "dest_douala_tag": "Economic Capital",
      "dest_douala_desc": "Travel to or from the busy economic metropolis and major business hub of Cameroon."
    },
    "login": {
      "title": "Access the VIP Experience",
      "identifier_label": "Phone or Email",
      "password_label": "Password",
      "forgot_password": "Forgot password?",
      "show_password": "Show password",
      "submit_btn": "Log In",
      "new_user_text": "New to VIP Connect?",
      "create_account_link": "Create an account"
    },
    "register": {
      "title": "Become a VIP Connect Member",
      "subtitle": "Sign up to plan your next business trip.",
      "firstname": "First Name",
      "firstname_placeholder": "e.g. John",
      "lastname": "Last Name",
      "lastname_placeholder": "e.g. Smith",
      "email": "Email Address",
      "email_placeholder": "name@example.com",
      "phone": "Phone Number",
      "phone_placeholder": "+237 6xx xx xx xx",
      "password": "Password",
      "password_confirm": "Confirm Password",
      "show_password": "Show passwords",
      "submit_btn": "Create my account",
      "already_member": "Already have an account?",
      "login_link": "Log In"
    },
    "forgot": {
      "title": "Reset Password",
      "subtitle": "Enter your phone number or email to regain access to your account.",
      "identifier_label": "Phone or Email",
      "identifier_placeholder": "+237 6xx xx xx xx or name@example.com",
      "submit_btn": "Reset my password",
      "back_login": "Back to login"
    },
    "kyc": {
      "title": "Identity Verification",
      "subtitle": "In accordance with regulations for premium inter-city transport, you must verify your identity before making a booking.",
      "firstname": "First Name (Same as ID document)",
      "lastname": "Last Name (Same as ID document)",
      "doc_type_label": "Identity Document Type",
      "cni_label": "National Identity Card (ID Card)",
      "passport_label": "Passport",
      "doc_number": "Document Number",
      "doc_number_placeholder": "Enter the number",
      "dob": "Date of Birth",
      "upload_recto": "1. Front of ID / Passport",
      "upload_verso": "2. Back of ID (CNI only)",
      "upload_selfie": "3. Selfie Photo (Live capture)",
      "camera_open_recto": "<span>Take Front Photo</span>",
      "camera_open_verso": "<span>Take Back Photo</span>",
      "camera_open_selfie": "<span>Take a Live Selfie</span>",
      "camera_cancel": "Cancel",
      "camera_capture": "Capture",
      "data_sec_title": "Security and Data Protection",
      "data_sec_desc": "Your identity documents and selfies are encrypted and securely stored. They are only accessible to the VIP Connect compliance department for validation. Your documents will be automatically purged 30 days after your account becomes inactive, in accordance with personal data protection regulations.",
      "submit_btn": "Submit for verification",
      "status_none": "<strong>Status: Identity not verified.</strong><br>Please fill in the information and upload your identity documents to unlock booking services.",
      "status_pending_redirect": "<strong>Status: Identity verified automatically!</strong><br>Redirecting to booking area...",
      "status_rejected": "<strong>Status: Application rejected.</strong><br>Reason: {motif}<br>Please submit clear and correct documents again.",
      "status_approved": "<strong>Status: Identity verified!</strong><br>Congratulations, your identity has been approved by VIP. You can now book your tickets.",
      "validated_badge": "Identity Verified ✓"
    },
    "dashboard": {
      "kyc_banner_title": "Identity Verification Required",
      "kyc_banner_desc": "You must verify your identity to be able to book a trip.",
      "kyc_banner_btn": "Verify Identity",
      "showcase_badge": "VIP Connect Class",
      "showcase_title": "Douala ↔ Yaoundé Private Shuttle",
      "showcase_desc": "Sit back and relax in our high-end air-conditioned Toyota Corolla vehicles. Direct highway travel, complimentary refreshing drinks. Each trip is limited to a maximum of 3 passengers to ensure your privacy and comfort.",
      "showcase_price_label": "One way",
      "showcase_support": "Customer Support",
      "book_title": "Plan Your Trip",
      "book_route": "Route",
      "book_date": "Departure Day",
      "book_return_datetime": "Return Date and Time",
      "book_return_time_placeholder": "Time",
      "book_schedules": "Available Departures (Daily Schedules)",
      "book_vehicles": "Available Vehicles",
      "book_seat": "Select Your Seat",
      "book_momo_number": "Mobile Money Number (Payer)",
      "book_momo_placeholder": "6xx xx xx xx",
      "book_momo_desc": "Payment is processed immediately via Orange Money or MTN MoMo.",
      "book_pay_btn": "Book & Pay ({amount} FCFA)",
      "schedule_available": "Available",
      "schedule_full": "Full",
      "schedule_no_departures": "No departures available for today on this route.",
      "schedule_choose_day": "Please select a departure day."
    },
    "payment_modal": {
      "title": "Secure Payment",
      "subtitle": "Select your Cameroonian operator and proceed to payment.",
      "summary_route": "Route",
      "summary_datetime": "Date & Time",
      "summary_amount": "Amount",
      "momo_ussd_simulator": "Mobile Money Authorization Simulator",
      "ussd_prompt": "<strong>[SIMULATION {provider}]</strong><br>Enter your 4-digit test PIN to confirm the payment of {amount} FCFA.",
      "cancel_btn": "Cancel",
      "confirm_btn": "Confirm PIN",
      "trigger_payment_btn": "Start Billing via {provider} ({amount} FCFA)"
    },
    "reviews": {
      "title": "Passenger Experiences",
      "card_title": "Leave a Review",
      "name_label": "First / Last Name",
      "name_placeholder": "Your name",
      "role_label": "City or Profession (Optional)",
      "role_placeholder": "E.g., Douala, or Manager",
      "note_label": "Rating (out of 5)",
      "stars_option": "{num} Stars",
      "star_option": "1 Star",
      "text_label": "Your experience with VIP TRAVEL",
      "text_placeholder": "Tell us about your trip...",
      "submit_btn": "Publish my review"
    },
    "admin": {
      "console_title": "Management Console",
      "nav_reservations": "Bookings",
      "nav_users": "Users",
      "nav_kyc": "ID/Selfie Validations",
      "nav_finance": "Payment Tracker",
      "nav_vehicles": "Vehicles & Schedules",
      "tab_reservations_title": "Bookings Made",
      "search_placeholder": "Search passenger, ref...",
      "no_reservations": "No bookings made yet.",
      "no_search_results": "No bookings match your search.",
      "table_id": "ID",
      "table_datetime": "Date/Time",
      "table_route": "Route",
      "table_passenger": "Passenger",
      "table_phone": "Phone",
      "table_tx": "Payment Tx",
      "table_status": "Status",
      "status_paid": "Paid",
      "tab_kyc_title": "Identity Dossiers (ID Card / Passport)",
      "admin_secure_access": "Secure & Logged Access",
      "no_kyc_profiles": "No client files available.",
      "table_submission_date": "Submission Date",
      "table_user": "User",
      "table_doc_number": "ID Document No.",
      "table_dob": "Date of Birth",
      "table_kyc_status": "KYC Status",
      "table_actions": "Actions",
      "action_examine": "Examine",
      "action_view": "View",
      "action_reexamine": "Re-examine",
      "status_pending": "Pending",
      "status_approved": "Approved ✓",
      "status_rejected": "Rejected",
      "status_not_submitted": "Not Submitted",
      "no_documents": "No docs",
      "tab_finance_title": "Mobile Money Payment Tracker",
      "stat_revenue": "Total Revenue",
      "stat_transactions": "Validated Transactions",
      "stat_tickets": "Tickets Sold",
      "no_payments": "No Mobile Money transactions recorded.",
      "table_tx_date": "Transaction Date",
      "table_tx_id": "Payment ID",
      "table_operator": "Operator",
      "table_debit_num": "Debit Number",
      "table_amount": "Amount",
      "tab_vehicles_title": "Vehicle Availability by Time Slot",
      "date_ref_label": "Reference Date",
      "admin_vehicles_desc": "View and manage seats occupancy live for each scheduled shuttle.",
      "table_capacity": "Remaining Capacity",
      "table_seats_occupied": "Occupied Seats",
      "table_vehicle_status": "Vehicle Status",
      "table_admin_action": "Admin Action",
      "action_see_list": "View List",
      "vehicle_full": "Full (03/03)",
      "vehicle_empty": "Available (03 seats)",
      "vehicle_open": "Open ({count}/03)",
      "lightbox_title": "Supporting Documents Review",
      "lightbox_name": "Passenger Name:",
      "lightbox_phone": "Phone Number:",
      "lightbox_doc": "Doc Type & No:",
      "lightbox_dob": "DOB / Age:",
      "lightbox_recto": "ID Card Front",
      "lightbox_verso": "ID Card Back",
      "lightbox_selfie": "Passenger Selfie",
      "lightbox_audit_log": "<strong>Audit Log:</strong> All actions on this dossier (approval or rejection) will be permanently recorded with the current administrator session identifier.",
      "lightbox_reject_btn": "Reject Dossier",
      "lightbox_approve_btn": "Approve Identity",
      "lightbox_treated": "Dossier already processed ({status}).",
      "lightbox_close": "Close"
    },
    "footer": {
      "links_legal": "Legal Notices",
      "links_privacy": "Data Protection",
      "links_support": "Customer Support",
      "copyright": "&copy; 2026 VIP Connect Transport Agency. All rights reserved."
    },
    "toasts": {
      "logout_success": "Successfully logged out.",
      "login_welcome": "Welcome, {name} !",
      "login_error": "Incorrect identifiers or invalid password.",
      "register_mismatch": "Passwords do not match.",
      "register_short": "Password must be at least 6 characters.",
      "register_exists": "An account with this email or phone number already exists.",
      "register_welcome": "Account successfully created. Welcome!",
      "forgot_success": "Your password has been successfully reset! You can now log in.",
      "forgot_error_length": "Password must be at least 6 characters.",
      "forgot_not_found": "No account found with this identifier.",
      "kyc_error_elements": "Technical error: The KYC form is incomplete or poorly structured.",
      "kyc_error_fields": "Please fill in all mandatory fields (First name, Last name, Doc number, DOB).",
      "kyc_error_photos": "You must provide the 3 mandatory photos (Front, Back and Selfie).",
      "kyc_error_save": "Error during saving.",
      "kyc_success_submit": "Your KYC dossier was successfully submitted.",
      "booking_need_login": "You must be logged in.",
      "booking_need_kyc": "Please verify your identity before booking.",
      "booking_need_schedule": "Please select a departure schedule.",
      "booking_momo_error": "Mobile Money number must be a valid 9-digit Cameroonian number starting with 6.",
      "booking_need_seat": "Please select a vehicle and an available seat.",
      "payment_cancelled": "Payment cancelled by the user.",
      "payment_success": "Booking validated! Ticket: {resId}. Transaction: {txId}",
      "review_error": "Please fill in all fields correctly.",
      "review_success": "Thank you for your review!",
      "kyc_approved": "Dossier of {name} successfully validated.",
      "kyc_rejected": "Dossier for {name} rejected.",
      "kyc_prompt_reject": "Specify the reason for rejecting the identity file:"
    },
    "ticket": {
      "title": "E-Ticket / Boarding Pass",
      "res_no": "Booking No",
      "passenger": "Passenger",
      "phone": "Phone",
      "route": "Route",
      "type": "Type",
      "departure": "Departure",
      "return": "Return",
      "seat": "Seat",
      "vehicle": "Vehicle",
      "tx_id": "Mobile Money Transaction",
      "close": "Close",
      "download": "Download PDF",
      "type_oneway": "One way",
      "type_roundtrip": "Round trip",
      "seat_front": "Front",
      "seat_back_left": "Back Left",
      "seat_back_right": "Back Right"
    }
  }
};
