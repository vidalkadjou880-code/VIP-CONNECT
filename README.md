# VIP - Application Web de Réservation Premium

VIP est une application web moderne et responsive conçue pour une agence de transport inter-urbain haut de gamme assurant la liaison **Douala ↔ Yaoundé** avec des véhicules personnels climatisés (limités à 3 passagers).

---

## 🌟 Fonctionnalités

### 🚗 Côté Client :
1. **Design & Identité Visuelle Premium** : Thème sombre (anthracite/noir) rehaussé de finitions dorées, structure moderne avec effet de flou de verre (*glassmorphism*) et micro-animations fluides.
2. **Inscription & Connexion Sécurisées** : Authentification par email/téléphone et mot de passe.
3. **Vérification d'Identité (KYC) Obligatoire** : Module d'envoi chiffré localement des documents (Recto de CNI/Passeport, Verso, Selfie) avec zone de glisser-déposer (*Drag & Drop*) et prévisualisation instantanée. L'accès aux réservations reste bloqué tant que l'identité n'a pas été validée.
4. **Calculateur Dynamique d'Horaires** : Les trajets disponibles sont filtrés dynamiquement selon l'heure courante de votre appareil.
   - **Douala → Yaoundé** : 04h00, 10h00, 16h00
   - **Yaoundé → Douala** : 05h00, 09h00, 15h00
5. **Gestion de Capacité stricte** : Réservation bloquée à un maximum de 3 places par véhicule par créneau horaire.
6. **Simulateur de Paiement Mobile Money** : Choix entre Orange Money et MTN MoMo. Simulation visuelle réaliste d'une invite USSD sur mobile pour valider la transaction par code PIN.

### 🛡️ Côté Administrateur (Console de Gestion) :
1. **Suivi des Réservations** : Tableau détaillé des billets vendus par trajet/date/heure.
2. **Examen KYC (CNI / Selfie)** : Consultation et validation/rejet des pièces d'identité soumises par les clients avec journal d'audit.
3. **Suivi Financier** : Rapports de revenus globaux, nombre de transactions valides et de places vendues.
4. **Grille des Véhicules** : Vue d'ensemble de l'occupation des voitures et listes nominatives des passagers par navette.

---

## 🚀 Démarrage Rapide

L'application a été développée comme une **Single Page Application (SPA) autonome**. Aucun serveur, base de données PostgreSQL complexe ou package Node.js externe n'est requis pour exécuter cette version de démonstration.

1. **Ouvrir l'application** : Double-cliquez simplement sur le fichier [index.html](file:///c:/Users/user/Documents/VIP%20KEVAS/index.html) dans votre navigateur (Chrome, Firefox, Safari ou Edge).
2. **Utiliser les comptes de démonstration** pré-configurés pour tester directement les différents parcours utilisateur :

### Comptes de test pré-configurés :
* **Administrateur** (pour valider les KYC et suivre l'activité globale) :
  - **Identifiant / Téléphone** : `699999999` (ou `admin@vip.cm`)
  - **Mot de passe** : `adminpass`
* **Client Approuvé** (prêt à réserver un trajet de Douala à Yaoundé) :
  - **Identifiant / Téléphone** : `677777777` (ou `ebenezer@example.com`)
  - **Mot de passe** : `testpass`
* **Client en attente de vérification** (idéal pour tester l'examen et la validation KYC en admin) :
  - **Identifiant / Téléphone** : `688888888` (ou `clarisse@example.com`)
  - **Mot de passe** : `pendingpass`

---

## 🛠️ Stack Technique

* **Structure** : HTML5 sémantique.
* **Stylisation** : CSS3 Vanilla (Design système responsive, Flexbox/Grid, Animations, Variables natives, Glassmorphism).
* **Logique et Simulation** : Javascript ES6 (Routage SPA natif, Gestion d'état réactive, chiffrement et stockage base64 dans `localStorage` pour persistance des données après rafraîchissement).
* **Base de Données Cloud & Backend** : **Supabase** (PostgreSQL managé, API REST temps réel, Row Level Security active).
  - Projet ID : `ngecktssfnpzcpsjvhhc`
  - URL Supabase : `https://ngecktssfnpzcpsjvhhc.supabase.co`
  - Tables synchronisées : `vip_users`, `vip_reservations`, `vip_payments`, `vip_reviews`
* **Typographie & Iconographie** : Montserrat, Playfair Display (Google Fonts) & FontAwesome.

