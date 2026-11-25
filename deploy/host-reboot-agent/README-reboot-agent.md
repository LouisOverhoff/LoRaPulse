# Optionaler Host-Reboot-Agent (Stufe 3 – Linux `systemd` Socket)

Standardmäßig läuft der **LoRaPulse**-Container vollständig isoliert (`USER 1000:1000`, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`) und besitzt **keinerlei Rechte**, den Docker-Daemon (`/var/run/docker.sock`) zu steuern oder das Host-Betriebssystem neu zu starten.

Für den Wartungsbereich in LoRaPulse existieren drei klar getrennte Neustart-Stufen (exklusiv für `SUPER_ADMIN`):

1. **Stufe 1 – TTN-MQTT-Worker neu verbinden:** Reiner In-Process-Reconnect aller aktiven MQTT-Clients (immer verfügbar).
2. **Stufe 2 – Applikations-Container neu starten:** Geordneter Prozess-Shutdown (`SIGTERM` / `process.exit(0)`), woraufhin Docker den Container über `restart: unless-stopped` automatisch innerhalb weniger Sekunden neu startet (immer verfügbar, kein Docker-Socket nötig!).
3. **Stufe 3 – Physischen Linux-Host neu starten (Optional):** Bewusst deaktiviert (`ENABLE_HOST_REBOOT=false`), solange der Betreiber nicht explizit diesen minimalen, einseitig auf `systemctl reboot` beschränkten `systemd`-Unix-Socket einrichtet.

---

## Sicherheitsarchitektur (Warum kein Docker-Socket?)

Ein Mounten von `/var/run/docker.sock` in einen Web-Container käme einem uneingeschränkten `root`-Zugriff auf das Host-System gleich. Stattdessen nutzt LoRaPulse bei Bedarf **systemd Socket Activation**:

```
[LoRaPulse Container (UID 1000)]
       |
       |  Schreibt "POST /reboot" bzw. "REBOOT" auf Unix-Domain-Socket
       v
[/run/lorapulse-reboot/reboot.sock] (0660 root:1000)
       |
       v
[lorapulse-reboot@.service (Host systemd)]
       |  Akzeptiert ausschliesslich das Reboot-Kommando (keine Parameter/Shell-Injektion)
       v
[/usr/bin/systemctl reboot] (nach 2s Verzoegerung fuer Audit-Log-Flush)
```

- **Kein dauerhafter Hintergrund-Prozess:** `systemd` lauscht ressourcensparend auf dem Socket und startet `lorapulse-reboot@.service` nur im Moment eines Aufrufs.
- **Keine Kommando-Übergabe:** Der Dienst führt keine übergebenen Shell-Argumente aus, sondern prüft lediglich das feste Schlüsselwort und triggert ausschließlich `/usr/bin/systemctl reboot`.
- **Audit-Pflicht:** Das LoRaPulse-Backend protokolliert jeden Auslöseversuch mit Benutzerkennung, IP-Adresse und Zeitstempel vorab im Datenbank-Audit-Log.

---

## Schritt-für-Schritt-Aktivierung auf Debian / Ubuntu

### 1. `systemd`-Units installieren

```bash
sudo cp deploy/host-reboot-agent/lorapulse-reboot.socket /etc/systemd/system/
sudo cp deploy/host-reboot-agent/lorapulse-reboot@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lorapulse-reboot.socket
```

Prüfen, ob der Socket mit Berechtigung `0660` (`root:1000`) bereitsteht:

```bash
sudo systemctl status lorapulse-reboot.socket
ls -la /run/lorapulse-reboot/reboot.sock
```

### 2. Socket in Docker Compose einbinden

Erstelle auf dem Server eine lokale Override-Datei `docker-compose.override.yml` (wird nicht eingecheckt):

```yaml
services:
  lorapulse:
    environment:
      ENABLE_HOST_REBOOT: "true"
      HOST_REBOOT_SOCKET_PATH: "/run/lorapulse-reboot/reboot.sock"
    volumes:
      - /run/lorapulse-reboot:/run/lorapulse-reboot:rw
```

Setze in `.env`:

```dotenv
ENABLE_HOST_REBOOT=true
```

Anschließend den Stack aktualisieren:

```bash
docker compose up -d
```

---

## Deaktivierung / Rückbau

```bash
sudo systemctl disable --now lorapulse-reboot.socket
sudo rm -f /etc/systemd/system/lorapulse-reboot.socket /etc/systemd/system/lorapulse-reboot@.service
sudo systemctl daemon-reload
```
