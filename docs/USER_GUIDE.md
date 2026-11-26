# Benutzer- & Administrationshandbuch – LoRaPulse (`v0.0.2`)

---

## 1. Anmeldung, Passwort-Reset & App-Installation

- **Anmeldung & Passwort vergessen:** Ist durch den Super-Admin ein Mailserver eingerichtet, erscheint auf der Anmeldemaske automatisch *„Passwort vergessen?"*. Darüber erhältst du einen 30 Minuten gültigen Einmal-Link zum Festlegen eines neuen Passworts.
- **Installation am Smartphone & Laptop (wichtig für Push-Benachrichtigungen):**
  - **iPhone / iPad (ab iOS 16.4):** In Safari öffnen -> *Teilen* -> *Zum Home-Bildschirm* -> installierte App vom Home-Bildschirm starten.
  - **Android & Laptop (Windows / macOS / Linux):** Direkt im Browser (Chrome, Edge, Firefox, Safari) oder über das *App installieren*-Symbol in der Adressleiste nutzbar.

---

## 2. Push- & E-Mail-Benachrichtigungen einrichten

1. **Geräte für Web-Push aktivieren (Handy & Laptop parallel):**
   - Öffne **Verwaltung -> Profil & Benachrichtigungen** auf deinem Handy **und** auf deinem Laptop und klicke jeweils auf **Push auf diesem Gerät aktivieren**.
   - Über **Test-Push senden** prüfst du sofort, ob beide Geräte benachrichtigt werden.
2. **Individuelle Einstellung pro Sensor:**
   - Öffne einen beliebigen Sensor: Dort legst du **persönlich für dein Konto** fest, wie du bei diesem Sensor benachrichtigt wirst:
     - **Push-Benachrichtigung:** Standardmäßig **Aktiviert**.
     - **E-Mail-Benachrichtigung:** Standardmäßig **Deaktiviert** (jederzeit pro Sensor zuschaltbar).
     - **Favorit (Stern):** Pinnt wichtige Sensoren auf der Startseite direkt unter eventuellen Alarmen ganz oben an.

---

## 3. Wartungsmodus, Offline-Überwachung & Automatische Entwarnung

- **Wartungsmodus (ab `OPERATOR`):** Arbeitest du vor Ort an einem Sensor, Tor oder Melder, wähle im Sensor-Dialog z. B. *Wartungsmodus: 1 Std.* – währenddessen werden Messwerte weiter aufgezeichnet, aber keine Fehlalarme per Push oder E-Mail versendet.
- **Offline-Watchdog:** Meldet sich ein Sensor länger als das Dreifache seines erwarteten Meldeintervalls nicht mehr, markiert LoRaPulse ihn automatisch als *Offline* und löst eine Meldung aus.
- **Automatische Entwarnung:** Sobald ein Kontakt wieder schließt, ein Grenzwert wieder eingehalten wird oder ein überfälliger Sensor wieder funkt, wird der offene Alarm automatisch als *Behoben* geschlossen.

---

## 4. Profile löschen & Mailserver einrichten (`ADMIN` / `SUPER_ADMIN`)

- **Eigene Sensor-Profile löschen:** Unter **Verwaltung -> JSON-Feld-Mapper** lassen sich selbst angelegte Profile löschen. Sensoren, die dieses Profil noch genutzt haben, werden dabei automatisch verlustfrei auf das Standard-JSON-Profil umgestellt.
- **SMTP-Mailserver (`SUPER_ADMIN`):** Unter **Verwaltung -> TTN, E-Mail & System** hinterlegst du Host, Port, TLS/STARTTLS und Zugangsdaten deines Mailservers (verschlüsselt gespeichert) und prüfst den Versand per **Test-E-Mail**.
