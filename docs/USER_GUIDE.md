# Benutzer- & Administrationshandbuch – LoRaPulse (`v0.0.1`)

---

## 1. Erst-Einrichtung & Anmeldung

1. **Erster Systemstart (`SUPER_ADMIN`):**
   - Beim ersten Start einer leeren Instanz zeigt LoRaPulse automatisch den **Erst-Einrichtungs-Assistenten**.
   - Den benötigten einmaligen `SETUP_TOKEN` findest du im Server-Log (`docker compose logs lorapulse`). Nach dem Anlegen des ersten `SUPER_ADMIN`-Kontos wird dieser Setup-Zugang dauerhaft geschlossen.
2. **Einladung neuer Benutzer:**
   - Öffentliche Registrierungen sind aus Sicherheitsgründen deaktiviert.
   - Administratoren erzeugen unter **Verwaltung -> Benutzer & Rechte** einen **Einmal-Einladungslink** (`/invite/...`), über den neue Nutzer ihr eigenes Passwort festlegen.
3. **Sprache & Darstellung:**
   - Oben rechts im Header lässt sich jederzeit zwischen **Deutsch (`DE`) & Englisch (`EN`)** sowie zwischen **Dark Mode** (Nachteinsatz) und **Light Mode** (Sonnenlicht im Außenbereich) wechseln.
4. **Installation als App auf dem iPhone / Smartphone (PWA):**
   - Öffne deine LoRaPulse-HTTPS-Adresse in **Safari** (iOS) -> tippe auf **Teilen** -> **Zum Home-Bildschirm**. Dadurch startet LoRaPulse im Vollbildmodus wie eine native App.

---

## 2. Übersicht, Sensoren & Alarme

- **Übersicht:** Zeigt auf einen Blick die wichtigsten Kennzahlen, offene Alarme und alle für dich freigegebenen Sensoren in Echtzeit (ohne Neuladen der Seite).
- **Alarme quittieren:** Benutzer ab Berechtigungsstufe `OPERATOR` können offene Meldungen (z. B. ausgelöster Kontakt an `DS03A-LB` oder Temperatur-Schwellwert an `D20-LB`) direkt quittieren – alle anderen berechtigten Personen sehen sofort, wer die Meldung übernommen hat.
- **Sensor-Details & Export:** Ein Klick auf eine Sensorkachel öffnet das Zeitreihen-Diagramm (`24h`, `7d`, `30d`), Empfangswerte (`RSSI`, `SNR`, `SF`), die Li-SOCl₂-Batteriebewertung sowie den **CSV- und JSON-Export**.

---

## 3. OpenStreetMap-Kartenansicht

- Im Tab **Karte** erscheinen automatisch alle für dich freigegebenen Sensoren, für die GPS-Koordinaten hinterlegt sind (umschaltbar zwischen **OpenStreetMap** und **OpenTopoMap** mit Höhenlinien).
- Sensoren ohne Koordinaten werden oberhalb der Karte als Hinweis aufgeführt.
- Berechtigte Administratoren können Koordinaten direkt draußen bei der Montage über **Smartphone-GPS übernehmen** oder per Klick-Modus auf der Karte setzen.

---

## 4. Kategorien, Gruppen & Einzel-Sensor-Freigaben (`ADMIN` & `SUPER_ADMIN`)

- **Optionale Strukturen:** Sensoren dürfen dauerhaft **Ohne Kategorie** bleiben, und Benutzer müssen **keiner Gruppe** angehören.
- **Kategorie-Vererbung:** Ein Recht auf eine Oberkategorie (z. B. `Fallenmelder -> Langen`) gilt automatisch für alle darunterliegenden Unterkategorien (`Jagdgruppe Langen 1`).
- **Einzel-Sensor-Freigabe:** Du kannst einem Nutzer gezielt Zugriff auf einen einzelnen Sensor geben (z. B. eine einzelne Wetterstation), ohne dass dieser Nutzer andere Sensoren aus derselben Kategorie sieht.
- **Visueller JSON-Feld-Mapper:** Unter **Verwaltung -> JSON-Mapper** lassen sich beliebige weitere LoRaWAN-Sensoren anhand ihres empfangenen TTN-Payloads per Klick konfigurieren (inkl. Live-Kachelvorschau und Filterung ungültiger Sondenwerte wie `-999`).

---

## 5. TTN-Anbindung, Downlinks & Systemsteuerung (`SUPER_ADMIN`)

- **TTN-Application verbinden:**
  1. Erstelle in deiner TTN-Application unter *API keys* einen Schlüssel mit den Rechten **Read application traffic** und (für Intervall-Änderungen) **Write downlink application traffic**.
  2. Trage unter **Verwaltung -> TTN & Server** die `Application ID` (z. B. `mein-projekt`), den Host (`eu1.cloud.thethings.network`), Port `8883` (`TLS` aktiv) und den API-Key ein.
  3. Sobald ein Sensor funkt, legt LoRaPulse ihn automatisch an und wählt für `DS03A-LB` und `D20-LB` direkt das passende Profil.
- **Sendeintervall per LoRaWAN-Downlink ändern:**
  - Im Sensor-Detailfenster kann ausschließlich ein `SUPER_ADMIN` ein neues Sendeintervall einreihen.
  - *Wichtig bei Batterie-Sensoren (Class A):* Der Befehl wird in TTN per `down/replace` hinterlegt (`Status: QUEUED`) und automatisch übertragen, sobald der Sensor das nächste Mal regulär Daten sendet (`Status: SENT`).
