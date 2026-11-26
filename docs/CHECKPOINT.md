# Projekt-Checkpoint (Ausfallsicherer Status-Anker)

> **Projekt:** **LoRaPulse** (`v0.0.2` · MIT-Lizenz · `DE`/`EN`)
> **GitHub-Repository:** https://github.com/LouisOverhoff/LoRaPulse
> **Live-Instanz (VPS):** https://lorapulse.overhoff.it (`/home/louis/lorapulse` auf `overhoff-vps` hinter Traefik)
> **Letzte Aktualisierung:** 2026-11-26
> **Aktuelle Phase:** **Version `0.0.2` vollständig implementiert, gebaut und E2E-verifiziert – bereit zum GitHub-Push & VPS-Update**

---

## 1. Erledigte Arbeitspakete in `v0.0.2`
- [x] **Multi-Geräte Web-Push (`VAPID`):** Automatische serverseitige Schlüsselgenerierung, Custom Service Worker (`frontend/src/sw.ts` via `injectManifest`), paralleles Empfangen auf Smartphone & Laptop, Geräteverwaltung & Test-Push.
- [x] **SMTP-Mailserver & Eigenständiger Passwort-Reset:** UI-Konfiguration für `SUPER_ADMIN` (`AES-256-GCM`-verschlüsselt), Test-E-Mail, 30-Minuten-Einmal-Reset-Links auf der Login-Maske sowie optionaler Direkt-Versand von Einladungs-Mails.
- [x] **Individuelle Benachrichtigungen je Nutzer & Sensor:** Jeder Nutzer entscheidet pro Sensor selbst über Favoriten-Stern, Push (**Standard: Ein**) und E-Mail (**Standard: Aus**).
- [x] **Zusatz-Ideen A–D komplett umgesetzt:**
  - *Idee A:* Aktiver `OfflineWatchdog` (> 3× Meldeintervall).
  - *Idee B:* Automatische Alarm-Entwarnung (`RESOLVED`) bei Schließen/Normalisierung/Wiedermeldung.
  - *Idee C:* Sensor-Wartungsmodus (`1 Std. / 4 Std. / 24 Std.`) zur Unterdrückung von Fehlalarmen vor Ort.
  - *Idee D:* Favoriten-Sterne & automatische Alarm-zuerst-Sortierung auf der Startseite.
- [x] **UI-, Layout- & Sprach-Feinschliff:**
  - Kompakte, vertikal zentrierte Login-/Setup-/Reset-Maske mit dynamischer Versionsanzeige (`v0.0.2`) & klickbarem GitHub-Repository-Link.
  - Kompakte Startseite & bündig nebeneinander liegende Messfelder auf den Sensorkacheln.
  - Sekundengenau mitlaufende Live-Zeitstempel ohne Seiten-Reload (`useNowTick`).
  - 100 % Sprachreinheit (`DE` vs. `EN` ohne englische Enum-Reste) & `0 Emojis` im gesamten Quellcode.
  - Löschen benutzerdefinierter Sensor-Profile inkl. verlustfreiem Geräte-Fallback auf `generic_json`.

## 2. Nächste Schritte
- [ ] Optional auf Wunsch: `v0.0.2` nach `https://github.com/LouisOverhoff/LoRaPulse` pushen und `lorapulse.overhoff.it` per `git pull && docker compose up -d --build` aktualisieren.
- [ ] Nach dem Update auf `lorapulse.overhoff.it`: Stalwart-SMTP-Zugangsdaten unter *Verwaltung -> TTN, E-Mail & System* eintragen und Web-Push am Handy & Laptop aktivieren.
