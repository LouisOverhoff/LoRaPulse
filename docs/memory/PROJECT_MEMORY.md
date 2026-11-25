# Dauerhaftes Projektgedächtnis (Project Memory)

> **Projektname:** **LoRaPulse** | **Lizenz:** MIT | **Sprachen:** Deutsch (`de`) & Englisch (`en`)

---

## 1. Projektvision & Kernumfang
- **Zielsystem:** Quelloffenes (**MIT-Lizenz**), portables **GitHub-Projekt (`LoRaPulse`)** für eine selbstgehostete, hochperformante und stark gehärtete **Progressive Web App (PWA)** zum Auslesen, Überwachen, Verorten und Verwalten verschiedenster LoRaWAN-Sensoren.
- **Lokalisierung (i18n):** Von Beginn an konsequent zweisprachig auf **Deutsch und Englisch** ausgelegt.
- **Deployment-Grundsatz:** Reine Docker-Compose-Installation. Reverse-Proxy-neutraler Single-Entrypoint-Container, mit fertigem Overlay für **Traefik** (Setup des Nutzers), **Caddy** (Standalone) und lokalem Port-Binding (`127.0.0.1:8080`).
- **Sensor-System:**
  1. Kuratierte Zero-Config-Profile für bekannte Hardware (`Dragino DS03A-LB`, `Dragino D20-LB`, Wetterstationen) mit automatischer TTN-Modellerkennung.
  2. Hochwertiger **visueller JSON-Feld-Mapper** (anklickbarer Live-Payload-Baum + Plausibilitätsfilter + Echtzeit-Kachel-/Karten-Pin-Vorschau + JSON-Import/Export).
- **Datenquelle & Rückkanal:** The Things Network (TTN v3) über **MQTT je TTN-Application** (Port 8883 TLS) inkl. Gap-Recovery über TTN Storage API sowie **LoRaWAN-Downlink-Steuerung (Sendeintervall ändern) exklusiv für `SUPER_ADMIN`**.

## 2. Vorhandene / Bestellte Referenz-Hardware
1. **Dragino DS03A-LB (EU868)** – Outdoor LoRaWAN Door / Contact Sensor
   - LoRaWAN 1.0.3 Class A, OTAA, 3,6 V Li-SOCl₂ Batterie (`ER26500` + `SPC1520`).
   - Downlink Sendeintervall (TDC): `FPort 2`, Prefix `0x01` + 3 Bytes Sekunden (Big-Endian).
2. **Dragino D20-LB (EU868)** – LoRaWAN Outdoor Temperature Sensor
   - LoRaWAN 1.0.3 Class A, OTAA, 3,6 V Li-SOCl₂ Batterie, wasserdichte externe Sonde.
   - Downlink Sendeintervall (TDC): `FPort 2`, Prefix `0x01` + 3 Bytes Sekunden (Big-Endian).
3. **Class-A & Batterie-Domänenwissen:**
   - Class-A-Sensoren empfangen Downlinks erst im `RX1`/`RX2`-Fenster unmittelbar nach ihrem nächsten Uplink → UI muss den Warteschlangen-Status transparent anzeigen und `down/replace` verwenden!
   - Li-SOCl₂-Entladekurve ist extrem flach (~3,55–3,65 V) und fällt erst am Ende steil ab (< 3,25 V).

## 3. Verbindliche Fach- & Sicherheitsregeln
- **Self-Hosting & GitHub-Qualität:** Keine hartcodierten Domains, Geheimnisse oder Umgebungsnamen. Erst-Einrichtung über einmaligen `SETUP_TOKEN` (First-Run-Wizard) oder `.env`-Bootstrap.
- **Geschlossene Benutzerverwaltung:** **Nur Administratoren** (`SUPER_ADMIN`, `ADMIN`) dürfen Benutzerkonten anlegen (Einmal-Einladungslink oder Initialpasswort mit Wechselzwang – kein SMTP-Server erforderlich).
- **Optionale Zuordnungen:** Sensoren dürfen dauerhaft **unkategorisiert** (`category_id = NULL`) sein; Benutzer müssen **keiner Gruppe** angehören.
- **Berechtigungsmodell:** Rechte (`VIEWER`, `OPERATOR`, `CATEGORY_ADMIN`) für **Benutzer** oder **Gruppen** auf **Kategorien/Unterkategorien** (`ltree`) oder **einzelne Sensoren**.
- **Strikte `SUPER_ADMIN`-Exklusivrechte:** Nur `SUPER_ADMIN` darf TTN-Applications/Keys verwalten, **Sensor-Sendeintervalle per Downlink ändern** und Dienste/Server neustarten.
- **Kartenansicht:** Integrierte **OpenStreetMap**-Karte (Leaflet + optional OpenTopoMap) aller für den Nutzer sichtbaren Sensoren mit Koordinaten.
- **UI-Gestaltungsprinzip (Zero-Emoji-Policy):** Modernes, sachliches Interface mit umschaltbarem Dark & Light Mode, Smaragd-/Teal-Akzentfarbe und **komplettem Verzicht auf Emojis** – Visualisierung ausschließlich über saubere SVG-Linien-Icons (`lucide-react`), 4-stufige RSSI-Signalbalken, grafische Batterie-Indikatoren, Status-LEDs und typografische Badges.
