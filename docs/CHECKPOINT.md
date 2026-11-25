# Projekt-Checkpoint (Ausfallsicherer Status-Anker)

> **Projekt:** **LoRaPulse** (`v0.0.1` · MIT-Lizenz · `DE`/`EN`)
> **Letzte Aktualisierung:** 2026-11-25
> **Aktuelle Phase:** **Version `0.0.1` vollständig implementiert, gebaut und Ende-zu-Ende getestet**

---

## 1. Erledigte Arbeitspakete in `v0.0.1`
- [x] **Monorepo & Shared Contracts (`@lorapulse/shared`):** Typen, Zod-Verträge, Dragino `DS03A-LB` / `D20-LB` / Wetterstation-Profile, binärer Fallback-Decoder, Li-SOCl₂-Kennlinie und TDC-Downlink-Encoder.
- [x] **Gehärtetes Backend (`@lorapulse/backend`):** Dual-Driver PostgreSQL (`pg` + `@electric-sql/pglite`), `SETUP_TOKEN`-Onboarding, Argon2id, AES-256-GCM für TTN-Keys, Einmal-Einladungslinks, RBAC inkl. *Zero-Sibling-Leak*, Multi-TTN-MQTT-Manager, Class-A-Downlinks (`SUPER_ADMIN`), Echtzeit-SSE, CSV/JSON-Export und eingebetteter Demo-Modus (`npm run dev:demo`).
- [x] **Zweisprachige Zero-Emoji PWA (`@lorapulse/frontend`):** React 19 + Vite PWA + Tailwind v4 + `lucide-react` (`0 Emojis`), Dark & Light Mode, `DE`/`EN`, Übersicht, echte Leaflet OpenStreetMap/OpenTopoMap-Karte, Kategorie-/Sensor-Explorer, Zeitreihen-Diagramm, visueller JSON-Feld-Mapper & Admin-Verwaltung.
- [x] **TTN-v3-Simulator & Docker-Stack (`@lorapulse/simulator`, `docker-compose*.yml`):** Eigenständiger MQTT-Simulator inkl. RX1-Downlink-Bestätigung; gehärtetes Multi-Stage-`Dockerfile`, `docker-compose.yml`, `docker-compose.traefik.yml`, `docker-compose.caddy.yml` und GitHub-CI-Workflow.
- [x] **Automatisierte Ende-zu-Ende-Prüfung:** `npm run typecheck`, `npm run build` und `npm test` (`backend/test/e2e.test.ts`) fehlerfrei bestanden (`0 Fehler`, `0 Emojis`).

## 2. Geplante nächste Ausbaustufen (Ausblick `v0.0.2+`)
- [ ] Aktiver **Offline-/Heartbeat-Watchdog-Worker** (periodische Prüfung auf überfällige Sensoren mit automatischer Alarmierung).
- [ ] Echter **Web-Push-Dispatcher (VAPID)** für iOS/Android-Hintergrundbenachrichtigungen + ausgehende Alarm-Webhooks (*ntfy, Gotify, Telegram*).
- [ ] **TTN Storage API Gap-Recovery** zum automatischen Nachladen verpasster Pakete nach längeren Server-Wartungen.
- [ ] Optionale **2FA (TOTP / WebAuthn Passkeys)** für Administratoren.
