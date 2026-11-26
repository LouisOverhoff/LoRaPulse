# LoRaPulse (`v0.0.2`)

**Self-Hosted Multi-Sensor LoRaWAN Progressive Web App (PWA)**  
Lizenz: **MIT** · Sprachen: **100 % Deutsch (`de`) & Englisch (`en`)** · Deployment: **Docker Compose (Traefik / Caddy / Universal)**

---

## Funktionsumfang (`v0.0.2`)

- **Multi-TTN-Application MQTT Engine:** Parallele Anbindung beliebig vieler TTN-v3-Applikationen (`AES-256-GCM`-verschlüsselte API-Keys), Auto-Discovery (`/up` & `/join`), 24h-Backfill über TTN Storage API und binärer Fallback-Decoder für **Dragino `DS03A-LB`** & **`D20-LB`**.
- **Web-Push (Handy & Laptop) + SMTP-Mailserver:**
  - Automatische VAPID-Schlüsselgenerierung für echte Hintergrund-Push-Benachrichtigungen auf Smartphone (iOS PWA / Android) und Desktop/Laptop gleichzeitig.
  - Integrierbare SMTP-Anbindung für **eigenständigen Passwort-Reset** (*„Passwort vergessen?"*), direkten Versand von Einladungs-Mails und optionale Sensor-Alarm-Mails.
  - **Individuelle Wahl je Nutzer & Sensor:** Jeder Nutzer entscheidet pro Sensor selbst über Favoriten-Stern, Push (**Standard: Ein**) und E-Mail (**Standard: Aus**).
- **Intelligente Überwachung (Watchdog, Auto-Entwarnung & Wartungsmodus):**
  - **Aktiver Offline-Watchdog:** Erkennt überfällige Sensoren (> 3× Meldeintervall) automatisch im Hintergrund.
  - **Automatische Entwarnung (`RESOLVED`):** Schließt Alarme selbstständig, sobald Kontakte schließen, Messwerte in den Normalbereich zurückkehren oder überfällige Sensoren wieder funken.
  - **Wartungsmodus / Schlummern:** Pausiert Fehlalarme für 1 h / 4 h / 24 h bei Arbeiten vor Ort am Sensor.
- **Granulares RBAC (`Zero-Sibling-Leak`) & OpenStreetMap:** Optionale Kategorien, optionale Gruppen und Einzel-Sensor-Freigaben sowie interaktive **OpenStreetMap**-Karte, umschaltbare **Kompakt-Ansicht** für viele Sensoren auf einen Blick und visueller **JSON-Feld-Mapper** (inkl. Löschen eigener Profile).
- **Class-A LoRaWAN Downlinks (exklusiv `SUPER_ADMIN`):** Sendeintervall über `.../down/replace` anpassen – inklusive RX1/RX2-Statusverfolgung (`QUEUED` -> `SENT`).

---

## 1. Lokaler Schnellstart (ohne Docker)

```bash
npm install
npm run build

# Mit integriertem TTN-v3-MQTT-Simulator & Beispiel-Sensoren starten:
npm run dev:demo
```

Automatisierte Ende-zu-Ende-Integrations- & Sicherheitstests (`v0.0.1` + `v0.0.2`) ausführen:

```bash
npm test
```

---

## 2. Produktives Server-Deployment & Update per Docker Compose

### Neuinstallation
```bash
git clone https://github.com/LouisOverhoff/LoRaPulse.git
cd LoRaPulse
cp .env.example .env
# .env anpassen (POSTGRES_PASSWORD, ENCRYPTION_MASTER_KEY, SESSION_SECRET, COMPOSE_FILE)
docker compose up -d --build
docker compose logs lorapulse
```

### Bestehende Server-Instanz aktualisieren (ohne Datenverlust)
```bash
cd ~/lorapulse
git pull
docker compose up -d --build
docker image prune -f
```

---

## Dokumentation & Lizenz

- Technische Architektur & API-Referenz: [docs/TECHNICAL_DOCS.md](docs/TECHNICAL_DOCS.md)
- Benutzer- & Admin-Handbuch: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Architekturentscheidungen (ADRs): [docs/adr/DECISIONS.md](docs/adr/DECISIONS.md)
- UI-Sonderfälle & Sicherheitsregeln: [docs/UI_EDGE_CASES.md](docs/UI_EDGE_CASES.md)
- Lizenz: [MIT License](LICENSE)
