# Management & Executive Summary – LoRaPulse (`v0.0.2`)

**Projekt:** **LoRaPulse** – Self-Hosted Multi-Sensor LoRaWAN PWA (`MIT`, `DE`/`EN`)  
**GitHub:** https://github.com/LouisOverhoff/LoRaPulse  
**Produktive URL:** https://lorapulse.overhoff.it  
**Stand:** 2026-11-26 | **Status:** **Version `0.0.2` fertiggestellt & E2E-verifiziert**

---

## 1. Neue Fähigkeiten in Version `0.0.2`
- **Plattformübergreifende Hintergrund-Alarme (Smartphone & Laptop):** Echter Web-Push-Standard (VAPID) mit automatischer Schlüsselverwaltung und Unterstützung mehrerer Endgeräte pro Benutzerkonto.
- **SMTP-Integration & Self-Service Passwort-Reset:** Sichere Anbindung eines eigenen Mailservers (z. B. Stalwart) für eigenständiges Zurücksetzen vergessener Passwörter, Einladungs-Mails und optionale Sensor-Alarm-Mails.
- **Persönliche Entscheidungsfreiheit pro Sensor:** Jeder Benutzer steuert je Sensor individuell seine Benachrichtigungskanäle (Standard: **Push aktiviert**, **E-Mail deaktiviert**) sowie Favoriten-Markierungen.
- **Proaktive Betriebssicherheit (Ideen A–D):** Hintergrund-Offline-Watchdog, automatische Alarm-Entwarnung (`RESOLVED`), temporärer Wartungsmodus gegen Fehlalarme bei Arbeiten vor Ort und priorisierte Alarm-/Favoriten-Sortierung.
- **Polierte UX & 100 % Sprachreinheit:** Kompakt zentrierte Login-Maske mit dynamischer Versions- & GitHub-Verlinkung, bündige Messwert-Anordnung, ohne Reload mitlaufende Zeitstempel, Löschfunktion für eigene Sensor-Profile und vollständige Bereinigung sämtlicher englischer Restbegriffe in der deutschen Ansicht (`0 Emojis`).

## 2. Qualitäts- & Teststatus
- Alle 4 Workspace-Pakete bestehen `npm run typecheck` und `npm run build` mit **0 Fehlern**.
- Alle **3 automatisierten E2E- & Sicherheitssuiten** (`normalizeTtnTarget`, `v0.0.1` RBAC/MQTT/Downlink sowie `v0.0.2` Web-Push, 410-Pruning, SMTP, Passwort-Reset-Session-Entzug, Pro-Sensor-Präferenzen, Wartungsmodus, Offline-Watchdog, Auto-Entwarnung & Profil-Löschung) sind fehlerfrei grün.

## 3. Nächster Schritt
Veröffentlichung von `v0.0.2` auf GitHub und Einspielen des Updates auf `lorapulse.overhoff.it`.
