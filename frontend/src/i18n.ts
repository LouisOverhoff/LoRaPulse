import type {
  AlertItem,
  BatteryHealthState,
  Language,
  SensorFieldKind,
  SensorIconName,
  TtnConnectionStatus,
} from '@lorapulse/shared';

export const TRANSLATIONS = {
  de: {
    appSubtitle: 'Mehrkanal-LoRaWAN-Telemetrie',
    mitLicense: 'MIT-Lizenz',
    githubLinkLabel: 'GitHub',
    navOverview: 'Übersicht',
    navMap: 'Karte',
    navSensors: 'Sensoren',
    navAdmin: 'Verwaltung',
    themeDark: 'Dunkel',
    themeLight: 'Hell',
    sseLive: 'Echtzeit aktiv',
    sseReconnecting: 'Verbinde neu…',
    networkOffline: 'Keine Netzwerkverbindung – Anzeige zeigt letzten bekannten Stand.',
    demoModeBadge: 'Demo-Modus',
    logout: 'Abmelden',
    sessionExpired:
      'Ihre Sitzung wurde beendet oder Berechtigungen wurden geändert. Bitte erneut anmelden.',
    loading: 'Daten werden geladen…',
    refresh: 'Aktualisieren',
    save: 'Speichern',
    saving: 'Speichert…',
    savedSuccess: 'Änderungen erfolgreich gespeichert.',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    close: 'Schließen',
    delete: 'Löschen',
    copy: 'Kopieren',
    copied: 'In Zwischenablage kopiert.',
    searchPlaceholder: 'Suche nach Name, DevEUI oder Standort…',
    roleSuperAdmin: 'Super-Admin',
    roleAdmin: 'Administrator',
    roleCategoryAdmin: 'Kategorie-Admin',
    roleOperator: 'Operator',
    roleViewer: 'Betrachter',
    roleUser: 'Benutzer',
    systemRoleLabel: 'Systemrolle',

    // Auth, Onboarding & Password Reset
    setupTitle: 'Erst-Einrichtung (Super-Admin)',
    setupDesc:
      'Erstellen Sie das initiale Super-Admin-Konto mithilfe des einmaligen Einrichtungsschlüssels.',
    setupTokenLabel: 'Einmaliger Einrichtungsschlüssel (SETUP_TOKEN)',
    setupTokenPlaceholder: 'Schlüssel aus Server-Protokoll einfügen',
    displayNameLabel: 'Anzeigename',
    emailLabel: 'E-Mail-Adresse',
    passwordLabel: 'Passwort (mind. 10 Zeichen)',
    preferredLangLabel: 'Bevorzugte Sprache',
    setupSubmit: 'Instanz initialisieren',
    loginTitle: 'Anmeldung',
    loginDesc: 'Melden Sie sich mit Ihrem autorisierten Benutzerkonto an.',
    loginClosedNotice:
      'Geschlossenes System: Neue Benutzerkonten werden ausschließlich durch Administratoren per Einmal-Einladungslink erstellt.',
    loginPasswordLabel: 'Passwort',
    loginSubmit: 'Anmelden',
    forgotPasswordLink: 'Passwort vergessen?',
    resetRequestTitle: 'Passwort zurücksetzen',
    resetRequestDesc:
      'Geben Sie Ihre E-Mail-Adresse ein. Sofern ein aktives Konto existiert, senden wir Ihnen einen zeitlich begrenzten Link zum Zurücksetzen.',
    resetRequestSubmit: 'Link per E-Mail anfordern',
    resetRequestSentNotice:
      'Falls ein aktives Konto zu dieser Adresse existiert, wurde eine E-Mail mit einem Zurücksetzungslink versendet.',
    resetConfirmTitle: 'Neues Passwort festlegen',
    resetConfirmDesc: 'Vergeben Sie jetzt ein neues sicheres Passwort für Ihr Benutzerkonto.',
    resetChecking: 'Zurücksetzungslink wird geprüft…',
    resetInvalid:
      'Dieser Link zum Zurücksetzen ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.',
    resetNewPasswordLabel: 'Neues Passwort (mind. 10 Zeichen)',
    resetRepeatPasswordLabel: 'Neues Passwort wiederholen',
    resetPasswordMismatch: 'Die eingegebenen Passwörter stimmen nicht überein.',
    resetConfirmSubmit: 'Passwort speichern',
    resetCompletedNotice:
      'Ihr Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt anmelden.',
    inviteTitle: 'Einladung einlösen',
    inviteDesc: 'Legen Sie Ihr persönliches Passwort fest, um Ihr LoRaPulse-Konto zu aktivieren.',
    inviteChecking: 'Einladungslink wird geprüft…',
    inviteInvalid:
      'Dieser Einladungslink ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link bei Ihrem Administrator an.',
    inviteSubmit: 'Konto aktivieren & anmelden',
    backToLogin: 'Zurück zur Anmeldung',

    // Overview & Alerts
    kpiVisibleSensors: 'Sichtbare Sensoren',
    kpiOpenAlerts: 'Offene Alarme',
    kpiWarningsBattery: 'Warnungen / Batterie',
    kpiGeoreferenced: 'Mit GPS-Standort',
    openAlertsTitle: 'Aktive Meldungen & Alarme',
    noOpenAlerts: 'Keine offenen Alarme vorhanden.',
    resolvedAlertsToggle: 'Kürzlich automatisch behobene Meldungen ({n})',
    alertResolvedBadge: 'Behoben',
    ackAlert: 'Quittieren',
    ackingAlert: 'Quittiere…',
    viewerReadOnlyBadge: 'Nur Lesezugriff',
    alertAckedSuccess: 'Alarm wurde quittiert.',
    emptySensorsTitle: 'Keine freigegebenen Sensoren sichtbar',
    emptySensorsDesc:
      'Ihrem Benutzerkonto wurden noch keine Sensoren, Kategorien oder Gruppen zugeordnet. Wenden Sie sich an einen Administrator, um Zugriffsrechte zu erhalten.',
    allSensorsSection: 'Überwachte Sensoren',
    overviewSortHint: 'Sortiert nach Alarmen, Favoriten & Status',
    layoutStandard: 'Standard',
    layoutCompact: 'Kompakt',

    // Telemetry, Favorites, Notifications & Maintenance
    statusOk: 'Normal',
    statusAlarm: 'Alarm',
    statusWarn: 'Warnung',
    statusOffline: 'Überfällig',
    statusNew: 'Neu',
    waitingFirstPacket: 'Warte auf erstes Datenpaket…',
    staleDataNotice: 'Messwert veraltet (Sensor überfällig)',
    probeErrorNotice: 'Sondenfehler erkannt (Wert außerhalb gültiger Hardware-Grenzen)',
    probeErrorShort: 'Sondenfehler',
    pendingDownlinkQueued: 'Downlink in Warteschlange – wartet auf nächsten Sensor-Uplink',
    pendingDownlinkFailed: 'Downlink-Übertragung fehlgeschlagen',
    noSignal: 'Kein Signal',
    batteryLabel: 'Batterie',
    batteryUnknown: 'Unbekannt',
    uncategorized: 'Ohne Kategorie',
    directShare: 'Direkt freigegeben',
    justNow: 'Gerade eben',
    secondsAgo: 'vor {n} Sek.',
    minutesAgo: 'vor {n} Min.',
    hoursAgo: 'vor {n} Std.',
    daysAgo: 'vor {n} Tg.',
    minutesShort: '{n} Min.',
    hoursShort: '{n} Std.',
    favoritePinTitle: 'Als Favorit markieren',
    favoriteUnpinTitle: 'Aus Favoriten entfernen',
    notifyPushActiveHint: 'Push-Benachrichtigung für diesen Sensor aktiv',
    notifyEmailActiveHint: 'E-Mail-Benachrichtigung für diesen Sensor aktiv',
    maintenanceUntilBadge: 'Wartungsmodus bis {time}',
    maintenanceActiveNotice: 'Wartungsmodus aktiv bis {time} – Fehlalarme pausiert',
    maintenanceSectionTitle: 'Wartungsmodus (Alarme vorübergehend pausieren)',
    maintenanceOff: 'Aus',
    maintenance1h: '1 Std.',
    maintenance4h: '4 Std.',
    maintenance24h: '24 Std.',
    maintenanceUpdatedSuccess: 'Wartungsmodus aktualisiert.',
    mySensorPrefsTitle: 'Meine Benachrichtigungen & Favorit für diesen Sensor',
    prefFavoriteLabel: 'Als Favorit anpinnen',
    prefPushLabel: 'Push-Benachrichtigung bei Alarm',
    prefEmailLabel: 'E-Mail-Benachrichtigung bei Alarm',
    prefEmailNoSmtpHint:
      'Hinweis: Vom Super-Admin wurde noch kein Mailserver eingerichtet – E-Mail-Versand ruht derzeit.',
    prefSavedSuccess: 'Persönliche Sensoreinstellung gespeichert.',

    // Map View
    mapLayerOsm: 'Straßenkarte (OpenStreetMap)',
    mapFilterAll: 'Alle Standorte',
    mapFilterAlarms: 'Nur Alarme / Warnungen',
    mapZeroGpsBanner: 'Noch keine Sensoren mit hinterlegten GPS-Koordinaten im aktuellen Filter.',
    mapMissingGpsCount: '{n} sichtbare Sensoren ohne hinterlegten Standort',
    mapAssignUnlocated: 'Standortlosen Sensor verorten',
    mapPickModeActive: 'Karten-Klick aktiv: Klicken Sie auf die gewünschte Position in der Karte.',
    mapPickOnMapBtn: 'Auf Karte setzen',
    mapCancelPickBtn: 'Klick-Modus beenden',
    mapUseDeviceGpsBtn: 'Geräte-GPS übernehmen',
    mapGpsUnsupported: 'Standortermittlung wird von diesem Browser nicht unterstützt.',
    mapGpsError:
      'GPS-Standort konnte nicht ermittelt werden (Berechtigung oder Empfang prüfen).',
    mapCoordsSaved: 'Sensor-Koordinaten gespeichert.',
    mapOpenDetailsBtn: 'Details & Zeitreihe',
    mapColocatedHint: 'Mehrere Sensoren am selben Standort (radial aufgefächert)',

    // Sensors View
    viewCategoryTree: 'Kategorie-Baum',
    viewFlatList: 'Flache Liste',
    filterStatusAll: 'Alle Status',
    noMatchingSensors: 'Keine Sensoren entsprechen dem aktuellen Such- oder Statusfilter.',
    sensorsCountBadge: '{n} Sensoren',

    // Sensor Detail Modal
    tabTelemetry: 'Zeitreihe & Messwerte',
    tabConfig: 'Konfiguration',
    tabDownlink: 'LoRaWAN-Downlink',
    range24h: '24 Stunden',
    range7d: '7 Tage',
    range30d: '30 Tage',
    exportCsv: 'CSV-Export',
    exportJson: 'JSON-Export',
    chartNoData: 'Keine historischen Messpunkte im gewählten Zeitraum vorhanden.',
    chartSinglePoint:
      'Erst ein einzelner Messpunkt im Zeitraum vorhanden – Verlauf baut sich mit weiteren Uplinks auf.',
    chartFilteredOutliers: '{n} Ausreißer / Sondenfehler aus Skalierung gefiltert',
    statMin: 'Minimum',
    statMax: 'Maximum',
    statAvg: 'Durchschnitt',
    statSamples: 'Messpunkte',
    fieldSelectLabel: 'Dargestelltes Messfeld',
    rfMetadataTitle: 'Funk- & Gerätemetadaten',
    rfTtnAppAndDeviceLabel: 'TTN-Applikation / Geräte-ID',
    rfSignalHeaderLabel: 'Empfang (RSSI / SF / SNR)',

    // Device Config
    cfgNameLabel: 'Sensor-Anzeigename',
    cfgCategoryLabel: 'Kategorie-Zuordnung',
    cfgProfileLabel: 'Sensor-Profil / Decoder',
    cfgLocationLabel: 'Standortbeschreibung (optional)',
    cfgLatitude: 'Breitengrad',
    cfgLongitude: 'Längengrad',
    cfgClearCoords: 'Koordinaten entfernen',
    cfgInvertContact: 'Kontakt-Logik invertieren (Öffner / Schließer tauschen)',
    cfgAlertOnOpen: 'Alarm bei geöffnetem / ausgelöstem Kontakt erzeugen',
    cfgTempMin: 'Untergrenze Warnung/Alarm (z. B. °C)',
    cfgTempMax: 'Obergrenze Warnung/Alarm (z. B. °C)',
    cfgExpectedIntervalMin: 'Erwartetes Meldeintervall (Minuten, für Überfälligkeitsprüfung)',
    cfgReadOnlyHint:
      'Konfigurationsänderungen erfordern mindestens Kategorie-Admin-Berechtigung.',

    // Downlink
    dlTitle: 'Sendeintervall per Class-A-Downlink steuern',
    dlSuperAdminOnlyTitle: 'Exklusiv für Super-Administratoren',
    dlSuperAdminOnlyDesc:
      'Das Ändern des Sensor-Sendeintervalls per LoRaWAN-Downlink beeinflusst Batterielebensdauer und TTN-Sendezeitkontingent unmittelbar und ist daher strikt Super-Administratoren vorbehalten.',
    dlUnsupportedProfile:
      'Das aktuell gewählte Sensor-Profil unterstützt keinen automatischen Downlink-Intervall-Codec.',
    dlIntervalMinutesLabel: 'Neues Sendeintervall (Minuten)',
    dlFairUseWarning:
      'Kurze Intervalle unter 10 Minuten erhöhen den Batterieverbrauch deutlich und können das TTN-Sendezeitlimit (30 Sek. pro Tag) überschreiten.',
    dlClassANotice:
      'Class-A-Hinweis: Batteriebetriebene LoRaWAN-Sensoren öffnen ihr Empfangsfenster (RX1/RX2) ausschließlich unmittelbar nach einem eigenen Uplink. Der Befehl wird in der TTN-Warteschlange hinterlegt und beim nächsten regulären Sensor-Uplink angewendet.',
    dlPayloadPreview: 'Generierter Befehl (FPort {port})',
    dlSubmitBtn: 'Sendeintervall aktualisieren',
    dlQueuedSuccess: 'Downlink in Warteschlange eingestellt (wartet auf nächsten Uplink).',
    dlStatusTitle: 'Aktueller Downlink-Status',
    dlStateQueued: 'Wartet auf nächsten Sensor-Uplink',
    dlStateSent: 'An TTN übermittelt',
    dlStateFailed:
      'Übertragung fehlgeschlagen – prüfen Sie die Downlink-Schreibberechtigung des TTN-API-Schlüssels.',

    // Admin View Tabs
    adminTabProfile: 'Profil & Benachrichtigungen',
    adminTabAccess: 'Benutzer, Gruppen & Rechte',
    adminTabMapper: 'JSON-Feld-Mapper',
    adminTabSystem: 'TTN, E-Mail & System',

    // Profile, Web-Push & PWA
    profileTitle: 'Persönliche Einstellungen',
    mustChangePwWarning: 'Bitte ändern Sie jetzt Ihr vorläufiges Passwort.',
    currentPasswordLabel: 'Aktuelles Passwort',
    newPasswordLabel: 'Neues Passwort (optional, mind. 10 Zeichen)',
    pwaStatusTitle: 'Mobile Nutzung & App-Status',
    pwaStandaloneActive:
      'Installierter App-Modus erkannt – Vollbild und geschützte Bildschirmränder sind aktiv.',
    pwaBrowserTabNotice:
      'Sie nutzen LoRaPulse aktuell im Browser-Tab. Auf iPhone/iPad öffnen Sie in Safari das Teilen-Menü und wählen „Zum Home-Bildschirm", um Vollbild-Modus und Web-Push freizuschalten.',
    pushCardTitle: 'Web-Push-Geräte (Smartphone & Computer)',
    pushCardDesc:
      'Empfangen Sie kritische Sensor-Alarme sofort als Systembenachrichtigung – auch bei geschlossenem Browserfenster.',
    pushDeviceNameLabel: 'Gerätename für dieses Endgerät',
    pushSubscribeBtn: 'Dieses Gerät für Push aktivieren',
    pushSubscribing: 'Aktiviere…',
    pushTestBtn: 'Test-Push an meine Geräte senden',
    pushTesting: 'Sende Test…',
    pushTestSentSuccess: 'Test-Benachrichtigung wurde an Ihre registrierten Geräte gesendet.',
    pushTestPartialSuccess:
      'Test-Push teilweise zugestellt ({sent} erfolgreich, {failed} fehlgeschlagen).',
    pushTestFailedDetail: 'Push-Zustellung fehlgeschlagen ({detail}).',
    pushTestNoActiveDevices:
      'Kein aktives Push-Gerät erreichbar. Bitte aktivieren Sie dieses Gerät erneut für Push.',
    pushRegisteredSuccess: 'Dieses Gerät empfängt ab sofort Push-Benachrichtigungen.',
    pushRemovedSuccess: 'Push-Gerät wurde entfernt.',
    pushPermissionDenied:
      'Benachrichtigungen wurden im Browser blockiert. Bitte erlauben Sie Mitteilungen in den Browser-Einstellungen.',
    pushUnsupportedNotice:
      'Dieser Browser unterstützt derzeit keine Web-Push-Mitteilungen. Auf iOS/iPadOS fügen Sie LoRaPulse bitte zuerst über Safari „Zum Home-Bildschirm" hinzu.',
    pushNoVapidNotice: 'Push-Schlüssel vom Server noch nicht verfügbar.',
    pushEmptyList: 'Noch keine Geräte für Ihr Konto registriert.',
    pushRegisteredAt: 'Registriert: {date}',

    // Access Control (Users, Groups, Categories, Permissions)
    inviteSectionTitle: 'Neuen Benutzer einladen',
    inviteSendEmailCheckbox: 'Einladungslink zusätzlich direkt per E-Mail senden',
    inviteSendEmailNoSmtpHint:
      'Für direkten E-Mail-Versand kann ein Super-Admin unter „TTN, E-Mail & System" einen Mailserver hinterlegen.',
    inviteCreateBtn: 'Einladungslink erzeugen',
    inviteGeneratedLabel: 'Einmaliger Einladungslink:',
    inviteEmailDispatchedNotice: 'Die Einladungs-E-Mail wurde zusätzlich direkt versendet.',
    usersListTitle: 'Benutzerkonten',
    userActive: 'Aktiv',
    userBlocked: 'Gesperrt',
    toggleBlockUser: 'Sperren',
    toggleActivateUser: 'Aktivieren',
    groupsTitle: 'Optionale Benutzergruppen',
    groupNamePlaceholder: 'Gruppenname (z. B. Forstbetrieb Nord)',
    groupDescPlaceholder: 'Kurzbeschreibung (optional)',
    createGroupBtn: 'Gruppe anlegen',
    categoriesTitle: 'Kategorien & Unterkategorien',
    categoryNamePlaceholder: 'Kategoriename (z. B. Hochbehälter)',
    categoryParentNone: 'Keine Oberkategorie (Hauptebene)',
    createCategoryBtn: 'Kategorie anlegen',
    permissionsTitle: 'Berechtigungen vergeben (Benutzer/Gruppe -> Kategorie/Einzelsensor)',
    permSubjectUser: 'Einzelner Benutzer',
    permSubjectGroup: 'Benutzergruppe',
    permTargetCategory: 'Kategorie (inkl. Unterordner)',
    permTargetDevice: 'Einzelner Sensor',
    createPermissionBtn: 'Berechtigung speichern',

    // JSON Mapper & Custom Profile Deletion
    mapperTitle: 'Visueller JSON-Feld-Mapper & Profil-Editor',
    mapperDesc:
      'Klicken Sie Schlüssel aus einem empfangenen Sensor-Paket oder Beispiel-JSON an, definieren Sie Einheiten und Gültigkeitsgrenzen gegen Sondenfehler und prüfen Sie die Kachel in Echtzeit.',
    mapperSourceDevice: 'Empfangenes Gerät wählen',
    mapperSourceSample: 'Beispiel-JSON bearbeiten',
    mapperDeviceNoPayload:
      'Dieser Sensor hat noch kein Datenpaket gesendet. Nutzen Sie ein Beispiel-JSON oder warten Sie auf den ersten Uplink.',
    mapperJsonRootObjectError: 'Das JSON-Wurzelelement muss ein Objekt sein.',
    mapperJsonInvalidError: 'Ungültiges JSON-Format.',
    mapperProfileImportInvalidError: 'Ungültiges Profil-JSON.',
    mapperClickableKeys: 'Erkannte JSON-Schlüssel (Klick zum Hinzufügen/Entfernen)',
    mapperProfileId: 'Profil-Kennung (a-z, 0-9, _)',
    mapperProfileName: 'Profil-Anzeigename',
    mapperBatteryChem: 'Batterie-Chemie',
    mapperChemLiSocl2: '3,6 V Li-SOCl2 (ER26500 / ER14505)',
    mapperChemAlkaline: '3,0 V Alkalisch (2x AA / AAA)',
    mapperChemNone: 'Netzbetrieb / Keine Batterie',
    mapperDownlinkCodec: 'Downlink-Intervall-Codec',
    mapperCodecDragino: 'Dragino TDC (FPort 2: 0x01 + 3 Byte Sek.)',
    mapperCodecNone: 'Kein Downlink-Codec',
    mapperIcon: 'Vektor-Symbol',
    mapperFieldsTitle: 'Konfigurierte Messfelder',
    mapperNoFields: 'Wählen Sie links mindestens einen JSON-Schlüssel aus.',
    mapperPrimary: 'Primärwert (Kachel & Karten-Pin)',
    mapperLabelDePlaceholder: 'Bezeichnung (DE)',
    mapperLabelEnPlaceholder: 'Bezeichnung (EN)',
    mapperUnitPlaceholder: 'Einheit (°C, %)',
    mapperDecimalsPlaceholder: 'Nachkommastellen',
    mapperValidMin: 'Gültig ab (Min)',
    mapperValidMax: 'Gültig bis (Max)',
    mapperLivePreview: 'Echtzeit-Vorschau (Kachel & Karten-Pin)',
    mapperPreviewApp: 'Vorschau-Applikation',
    mapperPreviewCategory: 'Vorschau',
    mapperPreviewLocation: 'Prüfstand',
    mapperDefaultDraftName: 'Bodensensor (Feuchte & Temperatur)',
    mapperSaveProfileBtn: 'Sensor-Profil speichern',
    mapperExportBtn: 'Profil-JSON kopieren',
    mapperImportBtn: 'Profil-JSON importieren',
    mapperSavedSuccess: 'Sensor-Profil erfolgreich gespeichert.',
    existingProfilesTitle: 'Vorhandene Sensor-Profile',
    profileBuiltInBadge: 'Standard',
    profileCustomBadge: 'Benutzerdefiniert',
    profileFieldsCount: '{n} Messfelder',
    profileDeleteAsk: 'Wirklich löschen?',
    profileDeletedWithReassign:
      'Profil gelöscht ({n} Sensoren wurden auf das Standard-Profil umgestellt).',
    profileDeletedSimple: 'Benutzerdefiniertes Sensor-Profil wurde gelöscht.',

    // Super Admin: TTN, SMTP & System
    ttnSectionTitle: 'TTN-v3-MQTT-Applikationen',
    ttnAddTitle: 'Neue TTN-Applikation verbinden',
    ttnNameLabel: 'Anzeigename (z. B. Revier Süd)',
    ttnAppIdLabel: 'TTN-Applikations-ID (Benutzername vor @ttn)',
    ttnHostLabel: 'MQTT-Server-Adresse',
    ttnPortLabel: 'Port',
    ttnTlsLabel: 'TLS-Verschlüsselung aktiv (Port 8883 empfohlen)',
    ttnApiKeyLabel: 'TTN-API-Schlüssel (wird AES-256-GCM-verschlüsselt gespeichert)',
    ttnMaskedKeyPrefix: 'Schlüssel',
    ttnConnectBtn: 'TTN-Applikation speichern & verbinden',
    ttnReconnectBtn: 'Neu verbinden',
    ttnLastMsg: 'Letzter Uplink',

    // SMTP Mail Server
    smtpSectionTitle: 'SMTP-Mailserver für Alarme, Einladungen & Passwort-Zurücksetzung',
    smtpSectionDesc:
      'Zugangsdaten werden mit AES-256-GCM verschlüsselt in der Datenbank gespeichert. Ohne Mailserver bleibt die Einmal-Link-Verwaltung vollständig nutzbar.',
    smtpStatusActive: 'Aktiviert',
    smtpStatusInactive: 'Nicht aktiv',
    smtpEnabledCheckbox: 'Ausgehenden E-Mail-Versand aktivieren',
    smtpHostLabel: 'SMTP-Server (z. B. smtp.beispiel.de)',
    smtpPortLabel: 'Port (z. B. 587 oder 465)',
    smtpSecureCheckbox: 'Direktes TLS / SSL ab Verbindungsaufbau (Port 465; sonst STARTTLS)',
    smtpUsernameLabel: 'Benutzername (optional)',
    smtpPasswordLabel: 'SMTP-Passwort',
    smtpPasswordSavedHint: 'Gespeichert ({masked}) – leer lassen, um es beizubehalten',
    smtpPasswordNewPlaceholder: 'Passwort eingeben (wird verschlüsselt gespeichert)',
    smtpFromEmailLabel: 'Absender-E-Mail-Adresse',
    smtpFromNameLabel: 'Absender-Anzeigename',
    smtpPublicUrlLabel: 'Öffentliche Basis-Adresse für Links (z. B. https://lora.beispiel.de)',
    smtpSaveBtn: 'Mailserver speichern',
    smtpSavedSuccess: 'Mailserver-Einstellungen gespeichert.',
    smtpTestTitle: 'Verbindung prüfen (Test-E-Mail)',
    smtpTestRecipientPlaceholder: 'Empfänger-E-Mail für Testversand',
    smtpTestSendBtn: 'Test-E-Mail senden',
    smtpTesting: 'Sende…',
    smtpTestSuccess: 'Test-E-Mail wurde erfolgreich über den Mailserver versendet.',

    // System Control & Audit
    systemControlTitle: '3-Stufige Systemsteuerung (Passwortgeschützt)',
    systemStage1Title: 'Stufe 1: MQTT-Verbindungen erneuern',
    systemStage1Desc:
      'Trennt und erneuert alle TTN-MQTT-Verbindungen ohne Unterbrechung der Web-Sitzungen.',
    systemStage2Title: 'Stufe 2: LoRaPulse-Dienst neu starten',
    systemStage2Desc:
      'Beendet den Anwendungsprozess kontrolliert zum sofortigen Neustart durch die Laufzeitumgebung.',
    systemStage3Title: 'Stufe 3: Server-System neu starten',
    systemStage3Desc:
      'Löst einen Betriebssystem-Neustart aus (nur verfügbar, wenn ENABLE_HOST_REBOOT aktiviert ist).',
    systemConfirmPwPlaceholder: 'Eigenes Super-Admin-Passwort zur Bestätigung',
    systemExecuteBtn: 'Ausführen',
    systemActionTriggered: 'Systemaktion wurde erfolgreich ausgelöst.',
    auditLogTitle: 'Sicherheits- & Prüfprotokoll',
    auditColTime: 'Zeitpunkt',
    auditColActor: 'Akteur',
    auditColAction: 'Vorgang',
    auditColTarget: 'Zielobjekt',
  },
  en: {
    appSubtitle: 'Multi-Sensor LoRaWAN Telemetry',
    mitLicense: 'MIT License',
    githubLinkLabel: 'GitHub',
    navOverview: 'Overview',
    navMap: 'Map',
    navSensors: 'Sensors',
    navAdmin: 'Admin',
    themeDark: 'Dark',
    themeLight: 'Light',
    sseLive: 'Live stream active',
    sseReconnecting: 'Reconnecting…',
    networkOffline: 'Network connection offline – showing last known telemetry state.',
    demoModeBadge: 'Demo Mode',
    logout: 'Sign out',
    sessionExpired: 'Your session ended or permissions changed. Please sign in again.',
    loading: 'Loading data…',
    refresh: 'Refresh',
    save: 'Save',
    saving: 'Saving…',
    savedSuccess: 'Changes saved successfully.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    delete: 'Delete',
    copy: 'Copy',
    copied: 'Copied to clipboard.',
    searchPlaceholder: 'Search by name, DevEUI, or location…',
    roleSuperAdmin: 'Super Admin',
    roleAdmin: 'Administrator',
    roleCategoryAdmin: 'Category Admin',
    roleOperator: 'Operator',
    roleViewer: 'Viewer',
    roleUser: 'User',
    systemRoleLabel: 'System Role',

    // Auth, Onboarding & Password Reset
    setupTitle: 'Initial Setup (Super Admin)',
    setupDesc: 'Create the initial Super Admin account using your one-time server setup token.',
    setupTokenLabel: 'One-Time Setup Token (SETUP_TOKEN)',
    setupTokenPlaceholder: 'Paste token from server startup log',
    displayNameLabel: 'Display Name',
    emailLabel: 'Email Address',
    passwordLabel: 'Password (min. 10 characters)',
    preferredLangLabel: 'Preferred Language',
    setupSubmit: 'Initialize Instance',
    loginTitle: 'Sign In',
    loginDesc: 'Sign in with your authorized LoRaPulse account.',
    loginClosedNotice:
      'Closed system: New user accounts can only be created by administrators via one-time invitation links.',
    loginPasswordLabel: 'Password',
    loginSubmit: 'Sign In',
    forgotPasswordLink: 'Forgot password?',
    resetRequestTitle: 'Reset Password',
    resetRequestDesc:
      'Enter your email address. If an active account exists, we will send a time-limited password reset link.',
    resetRequestSubmit: 'Send Reset Link',
    resetRequestSentNotice:
      'If an active account matches this address, an email with a password reset link has been sent.',
    resetConfirmTitle: 'Set New Password',
    resetConfirmDesc: 'Choose a new strong password for your LoRaPulse account.',
    resetChecking: 'Verifying password reset link…',
    resetInvalid:
      'This password reset link is invalid or has expired. Please request a new reset link.',
    resetNewPasswordLabel: 'New Password (min. 10 characters)',
    resetRepeatPasswordLabel: 'Confirm New Password',
    resetPasswordMismatch: 'The entered passwords do not match.',
    resetConfirmSubmit: 'Save New Password',
    resetCompletedNotice:
      'Your password has been reset successfully. You can now sign in.',
    inviteTitle: 'Redeem Invitation',
    inviteDesc: 'Set your personal password to activate your LoRaPulse account.',
    inviteChecking: 'Verifying invitation link…',
    inviteInvalid:
      'This invitation link is invalid or has expired. Please request a new link from your administrator.',
    inviteSubmit: 'Activate Account & Sign In',
    backToLogin: 'Back to Sign In',

    // Overview & Alerts
    kpiVisibleSensors: 'Visible Sensors',
    kpiOpenAlerts: 'Open Alerts',
    kpiWarningsBattery: 'Warnings / Battery',
    kpiGeoreferenced: 'GPS Located',
    openAlertsTitle: 'Active Alerts & Notifications',
    noOpenAlerts: 'No open alerts at this time.',
    resolvedAlertsToggle: 'Recently auto-resolved alerts ({n})',
    alertResolvedBadge: 'Resolved',
    ackAlert: 'Acknowledge',
    ackingAlert: 'Acknowledging…',
    viewerReadOnlyBadge: 'Read-only access',
    alertAckedSuccess: 'Alert acknowledged.',
    emptySensorsTitle: 'No Shared Sensors Visible',
    emptySensorsDesc:
      'Your account has not yet been assigned to any sensors, categories, or groups. Please contact an administrator to request access.',
    allSensorsSection: 'Monitored Sensors',
    overviewSortHint: 'Sorted by alarms, favorites & status',
    layoutStandard: 'Standard',
    layoutCompact: 'Compact',

    // Telemetry, Favorites, Notifications & Maintenance
    statusOk: 'Healthy',
    statusAlarm: 'Alarm',
    statusWarn: 'Warning',
    statusOffline: 'Offline',
    statusNew: 'New',
    waitingFirstPacket: 'Waiting for first uplink packet…',
    staleDataNotice: 'Stale reading (sensor overdue)',
    probeErrorNotice: 'Probe fault detected (reading outside valid hardware bounds)',
    probeErrorShort: 'Probe Fault',
    pendingDownlinkQueued: 'Downlink queued – waiting for next sensor uplink',
    pendingDownlinkFailed: 'Downlink delivery failed',
    noSignal: 'No signal',
    batteryLabel: 'Battery',
    batteryUnknown: 'Unknown',
    uncategorized: 'Uncategorized',
    directShare: 'Shared directly',
    justNow: 'Just now',
    secondsAgo: '{n}s ago',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} hr ago',
    daysAgo: '{n} d ago',
    minutesShort: '{n} min',
    hoursShort: '{n} hr',
    favoritePinTitle: 'Pin as favorite',
    favoriteUnpinTitle: 'Remove from favorites',
    notifyPushActiveHint: 'Push notifications enabled for this sensor',
    notifyEmailActiveHint: 'Email notifications enabled for this sensor',
    maintenanceUntilBadge: 'Maintenance until {time}',
    maintenanceActiveNotice: 'Maintenance active until {time} – false alerts paused',
    maintenanceSectionTitle: 'Maintenance Mode (pause alerts during on-site work)',
    maintenanceOff: 'Off',
    maintenance1h: '1 hr',
    maintenance4h: '4 hr',
    maintenance24h: '24 hr',
    maintenanceUpdatedSuccess: 'Maintenance mode updated.',
    mySensorPrefsTitle: 'My Notifications & Favorite for This Sensor',
    prefFavoriteLabel: 'Pin as favorite',
    prefPushLabel: 'Push notification on alert',
    prefEmailLabel: 'Email notification on alert',
    prefEmailNoSmtpHint:
      'Note: No SMTP mail server has been configured by the Super Admin yet – email delivery is currently inactive.',
    prefSavedSuccess: 'Personal sensor preference saved.',

    // Map View
    mapLayerOsm: 'Street Map (OpenStreetMap)',
    mapFilterAll: 'All Locations',
    mapFilterAlarms: 'Alarms & Warnings Only',
    mapZeroGpsBanner: 'No sensors with GPS coordinates match the current filter.',
    mapMissingGpsCount: '{n} visible sensors without coordinates',
    mapAssignUnlocated: 'Place unlocated sensor',
    mapPickModeActive: 'Map click active: Click on the target position on the map.',
    mapPickOnMapBtn: 'Pick on Map',
    mapCancelPickBtn: 'Exit Pick Mode',
    mapUseDeviceGpsBtn: 'Use Device GPS',
    mapGpsUnsupported: 'Geolocation is not supported by this browser.',
    mapGpsError: 'Could not determine GPS position (check location permissions or signal).',
    mapCoordsSaved: 'Sensor coordinates saved.',
    mapOpenDetailsBtn: 'Details & Time-Series',
    mapColocatedHint: 'Multiple sensors share this location (fanned out radially)',

    // Sensors View
    viewCategoryTree: 'Category Tree',
    viewFlatList: 'Flat List',
    filterStatusAll: 'All Statuses',
    noMatchingSensors: 'No sensors match the active search or status filter.',
    sensorsCountBadge: '{n} sensors',

    // Sensor Detail Modal
    tabTelemetry: 'Time-Series & Readings',
    tabConfig: 'Configuration',
    tabDownlink: 'LoRaWAN Downlink',
    range24h: '24 Hours',
    range7d: '7 Days',
    range30d: '30 Days',
    exportCsv: 'Export CSV',
    exportJson: 'Export JSON',
    chartNoData: 'No historical data points available in the selected range.',
    chartSinglePoint:
      'Only a single reading recorded in this range – trend line will appear after subsequent uplinks.',
    chartFilteredOutliers: '{n} probe error / outlier points excluded from scale',
    statMin: 'Minimum',
    statMax: 'Maximum',
    statAvg: 'Average',
    statSamples: 'Samples',
    fieldSelectLabel: 'Displayed Metric',
    rfMetadataTitle: 'RF & Device Metadata',
    rfTtnAppAndDeviceLabel: 'TTN App / Device ID',
    rfSignalHeaderLabel: 'Signal (RSSI / SF / SNR)',

    // Device Config
    cfgNameLabel: 'Sensor Display Name',
    cfgCategoryLabel: 'Category Assignment',
    cfgProfileLabel: 'Sensor Profile / Decoder',
    cfgLocationLabel: 'Location Label (optional)',
    cfgLatitude: 'Latitude',
    cfgLongitude: 'Longitude',
    cfgClearCoords: 'Clear Coordinates',
    cfgInvertContact: 'Invert contact polarity (swap Open / Closed)',
    cfgAlertOnOpen: 'Trigger alert when contact is open / active',
    cfgTempMin: 'Lower Alert Threshold (e.g. °C)',
    cfgTempMax: 'Upper Alert Threshold (e.g. °C)',
    cfgExpectedIntervalMin: 'Expected Uplink Interval (minutes, for offline detection)',
    cfgReadOnlyHint: 'Configuration changes require at least Category Admin permission.',

    // Downlink
    dlTitle: 'Configure Uplink Interval via Class-A Downlink',
    dlSuperAdminOnlyTitle: 'Restricted to Super Administrators',
    dlSuperAdminOnlyDesc:
      'Changing sensor transmit intervals via LoRaWAN downlink directly impacts battery life and TTN Fair Use airtime budgets, and is strictly reserved for Super Administrators.',
    dlUnsupportedProfile:
      'The assigned sensor profile does not support an automated downlink interval codec.',
    dlIntervalMinutesLabel: 'New Transmit Interval (minutes)',
    dlFairUseWarning:
      'Short intervals below 10 minutes significantly reduce battery life and may exceed TTN Fair Use limits (30s airtime/day).',
    dlClassANotice:
      'Class-A Notice: Battery-powered LoRaWAN sensors only open receive windows (RX1/RX2) immediately following an uplink. Commands are scheduled in the TTN queue and applied upon the next sensor uplink.',
    dlPayloadPreview: 'Encoded Command (FPort {port})',
    dlSubmitBtn: 'Schedule Interval Update',
    dlQueuedSuccess: 'Downlink queued (waiting for next sensor uplink).',
    dlStatusTitle: 'Current Downlink State',
    dlStateQueued: 'Waiting for next sensor uplink',
    dlStateSent: 'Delivered to TTN',
    dlStateFailed:
      'Delivery failed – verify that your TTN API key includes downlink write permissions.',

    // Admin View Tabs
    adminTabProfile: 'Profile & Notifications',
    adminTabAccess: 'Users, Groups & Access',
    adminTabMapper: 'JSON Field Mapper',
    adminTabSystem: 'TTN, Email & System',

    // Profile, Web-Push & PWA
    profileTitle: 'Personal Preferences',
    mustChangePwWarning: 'Please update your temporary password now.',
    currentPasswordLabel: 'Current Password',
    newPasswordLabel: 'New Password (optional, min. 10 characters)',
    pwaStatusTitle: 'Mobile Field Use & App Status',
    pwaStandaloneActive:
      'Installed App Mode detected – full-screen display and safe-area insets are active.',
    pwaBrowserTabNotice:
      'You are currently viewing LoRaPulse in a browser tab. On iPhone/iPad, open the Safari Share menu and select "Add to Home Screen" to unlock full-screen mode and Web Push.',
    pushCardTitle: 'Web Push Devices (Phone & Desktop)',
    pushCardDesc:
      'Receive critical sensor alerts immediately as native notifications – even when the browser tab is closed.',
    pushDeviceNameLabel: 'Label for this device',
    pushSubscribeBtn: 'Enable Push on This Device',
    pushSubscribing: 'Enabling…',
    pushTestBtn: 'Send Test Push to My Devices',
    pushTesting: 'Sending…',
    pushTestSentSuccess: 'Test push notification sent to your registered devices.',
    pushTestPartialSuccess:
      'Test push partially delivered ({sent} delivered, {failed} failed).',
    pushTestFailedDetail: 'Push delivery failed ({detail}).',
    pushTestNoActiveDevices:
      'No active push device reachable. Please re-enable push on this device.',
    pushRegisteredSuccess: 'Push notifications are now active on this device.',
    pushRemovedSuccess: 'Push device removed.',
    pushPermissionDenied:
      'Notifications were blocked by the browser. Please allow notifications in your browser site settings.',
    pushUnsupportedNotice:
      'This browser currently does not support Web Push notifications. On iOS/iPadOS, please add LoRaPulse to your Home Screen via Safari first.',
    pushNoVapidNotice: 'Server VAPID public key is not yet available.',
    pushEmptyList: 'No push devices registered for your account yet.',
    pushRegisteredAt: 'Registered: {date}',

    // Access Control
    inviteSectionTitle: 'Invite New User',
    inviteSendEmailCheckbox: 'Also send invitation link directly via email',
    inviteSendEmailNoSmtpHint:
      'To send invitations by email, a Super Admin can configure an SMTP server under "TTN, Email & System".',
    inviteCreateBtn: 'Generate Invite Link',
    inviteGeneratedLabel: 'One-time invitation link:',
    inviteEmailDispatchedNotice: 'The invitation email has also been sent directly.',
    usersListTitle: 'User Accounts',
    userActive: 'Active',
    userBlocked: 'Blocked',
    toggleBlockUser: 'Block',
    toggleActivateUser: 'Activate',
    groupsTitle: 'Optional User Groups',
    groupNamePlaceholder: 'Group name (e.g. North District Ops)',
    groupDescPlaceholder: 'Short description (optional)',
    createGroupBtn: 'Create Group',
    categoriesTitle: 'Categories & Subcategories',
    categoryNamePlaceholder: 'Category name (e.g. Water Reservoirs)',
    categoryParentNone: 'No parent category (Top level)',
    createCategoryBtn: 'Create Category',
    permissionsTitle: 'Grant Permissions (User/Group -> Category/Single Sensor)',
    permSubjectUser: 'Individual User',
    permSubjectGroup: 'User Group',
    permTargetCategory: 'Category (incl. subcategories)',
    permTargetDevice: 'Single Sensor',
    createPermissionBtn: 'Grant Permission',

    // JSON Mapper & Custom Profile Deletion
    mapperTitle: 'Visual JSON Field Mapper & Profile Builder',
    mapperDesc:
      'Click keys from a live device uplink or sample JSON, configure units and hardware plausibility bounds, and inspect the live card preview.',
    mapperSourceDevice: 'Select received sensor',
    mapperSourceSample: 'Edit sample JSON payload',
    mapperDeviceNoPayload:
      'This sensor has not sent its first uplink yet. Use sample JSON or wait for an uplink.',
    mapperJsonRootObjectError: 'JSON root element must be an object.',
    mapperJsonInvalidError: 'Invalid JSON syntax.',
    mapperProfileImportInvalidError: 'Invalid sensor profile JSON.',
    mapperClickableKeys: 'Detected JSON Keys (click to add/remove)',
    mapperProfileId: 'Profile ID (a-z, 0-9, _)',
    mapperProfileName: 'Profile Display Name',
    mapperBatteryChem: 'Battery Chemistry',
    mapperChemLiSocl2: '3.6 V Li-SOCl2 (ER26500 / ER14505)',
    mapperChemAlkaline: '3.0 V Alkaline (2x AA / AAA)',
    mapperChemNone: 'External Power / None',
    mapperDownlinkCodec: 'Downlink Interval Codec',
    mapperCodecDragino: 'Dragino TDC (FPort 2: 0x01 + 3B sec)',
    mapperCodecNone: 'None',
    mapperIcon: 'Vector Icon',
    mapperFieldsTitle: 'Mapped Telemetry Fields',
    mapperNoFields: 'Select at least one JSON key on the left.',
    mapperPrimary: 'Primary Reading (Card & Map Pin)',
    mapperLabelDePlaceholder: 'Label (DE)',
    mapperLabelEnPlaceholder: 'Label (EN)',
    mapperUnitPlaceholder: 'Unit (°C, %)',
    mapperDecimalsPlaceholder: 'Decimals',
    mapperValidMin: 'Valid Min',
    mapperValidMax: 'Valid Max',
    mapperLivePreview: 'Live Preview (Sensor Card & Map Pin)',
    mapperPreviewApp: 'Live Preview',
    mapperPreviewCategory: 'Preview',
    mapperPreviewLocation: 'Test Bench',
    mapperDefaultDraftName: 'Custom Soil & Temp Sensor',
    mapperSaveProfileBtn: 'Save Sensor Profile',
    mapperExportBtn: 'Copy Profile JSON',
    mapperImportBtn: 'Import Profile JSON',
    mapperSavedSuccess: 'Sensor profile saved successfully.',
    existingProfilesTitle: 'Available Sensor Profiles',
    profileBuiltInBadge: 'Built-in',
    profileCustomBadge: 'Custom',
    profileFieldsCount: '{n} fields',
    profileDeleteAsk: 'Confirm delete?',
    profileDeletedWithReassign:
      'Profile deleted ({n} sensors reassigned to the default profile).',
    profileDeletedSimple: 'Custom sensor profile deleted.',

    // Super Admin: TTN, SMTP & System
    ttnSectionTitle: 'TTN v3 MQTT Applications',
    ttnAddTitle: 'Connect New TTN Application',
    ttnNameLabel: 'Display Name (e.g. South Sector)',
    ttnAppIdLabel: 'TTN Application ID (username before @ttn)',
    ttnHostLabel: 'MQTT Cluster Host',
    ttnPortLabel: 'Port',
    ttnTlsLabel: 'Use TLS encryption (Port 8883 recommended)',
    ttnApiKeyLabel: 'TTN API Key (stored encrypted with AES-256-GCM)',
    ttnMaskedKeyPrefix: 'Key',
    ttnConnectBtn: 'Save & Connect TTN Application',
    ttnReconnectBtn: 'Reconnect',
    ttnLastMsg: 'Last uplink',

    // SMTP Mail Server
    smtpSectionTitle: 'SMTP Mail Server for Alerts, Invitations & Password Reset',
    smtpSectionDesc:
      'Credentials are encrypted at rest with AES-256-GCM. Without an SMTP server, one-time invitation links remain fully usable.',
    smtpStatusActive: 'Enabled',
    smtpStatusInactive: 'Inactive',
    smtpEnabledCheckbox: 'Enable outgoing email delivery',
    smtpHostLabel: 'SMTP Host (e.g. smtp.example.org)',
    smtpPortLabel: 'Port (e.g. 587 or 465)',
    smtpSecureCheckbox: 'Implicit TLS / SSL from connection start (Port 465; otherwise STARTTLS)',
    smtpUsernameLabel: 'Username (optional)',
    smtpPasswordLabel: 'SMTP Password',
    smtpPasswordSavedHint: 'Stored ({masked}) – leave blank to keep existing password',
    smtpPasswordNewPlaceholder: 'Enter password (stored encrypted)',
    smtpFromEmailLabel: 'Sender Email Address',
    smtpFromNameLabel: 'Sender Display Name',
    smtpPublicUrlLabel: 'Public Base URL for Links (e.g. https://lora.example.org)',
    smtpSaveBtn: 'Save Mail Server',
    smtpSavedSuccess: 'SMTP mail server settings saved.',
    smtpTestTitle: 'Verify Connection (Test Email)',
    smtpTestRecipientPlaceholder: 'Recipient email address for test',
    smtpTestSendBtn: 'Send Test Email',
    smtpTesting: 'Sending…',
    smtpTestSuccess: 'Test email was sent successfully via the configured SMTP server.',

    // System Control & Audit
    systemControlTitle: '3-Stage System Control (Password Confirmed)',
    systemStage1Title: 'Stage 1: Reconnect MQTT Workers',
    systemStage1Desc:
      'Drops and re-establishes all TTN MQTT streams without interrupting active web sessions.',
    systemStage2Title: 'Stage 2: Restart LoRaPulse Service',
    systemStage2Desc:
      'Gracefully terminates the backend service so the container runtime restarts it cleanly.',
    systemStage3Title: 'Stage 3: Reboot Host System',
    systemStage3Desc:
      'Triggers a host server reboot (only available when ENABLE_HOST_REBOOT is enabled).',
    systemConfirmPwPlaceholder: 'Confirm with your Super Admin password',
    systemExecuteBtn: 'Execute',
    systemActionTriggered: 'System action triggered successfully.',
    auditLogTitle: 'Security & Audit Trail',
    auditColTime: 'Timestamp',
    auditColActor: 'Actor',
    auditColAction: 'Action',
    auditColTarget: 'Target',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.de;

export function t(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.de;
  let text: string = dict[key] ?? TRANSLATIONS.de[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function formatRoleLabel(role: string, lang: Language): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return t(lang, 'roleSuperAdmin');
    case 'ADMIN':
      return t(lang, 'roleAdmin');
    case 'CATEGORY_ADMIN':
      return t(lang, 'roleCategoryAdmin');
    case 'OPERATOR':
      return t(lang, 'roleOperator');
    case 'VIEWER':
      return t(lang, 'roleViewer');
    case 'USER':
      return t(lang, 'roleUser');
    default:
      return role;
  }
}

export function formatAlertTypeLabel(
  alertType: AlertItem['alertType'] | string,
  lang: Language
): string {
  const labels: Record<string, { de: string; en: string }> = {
    CONTACT_TRIGGER: { de: 'Kontaktauslösung', en: 'Contact Trigger' },
    THRESHOLD: { de: 'Grenzwert', en: 'Threshold' },
    OFFLINE: { de: 'Sensor überfällig', en: 'Sensor Overdue' },
    LOW_BATTERY: { de: 'Batterie kritisch', en: 'Low Battery' },
  };
  return labels[alertType]?.[lang] ?? alertType;
}

export function formatTtnStatusLabel(
  status: TtnConnectionStatus | string,
  lang: Language
): string {
  const labels: Record<string, { de: string; en: string }> = {
    CONNECTED: { de: 'Verbunden', en: 'Connected' },
    CONNECTING: { de: 'Verbindet…', en: 'Connecting…' },
    DISCONNECTED: { de: 'Getrennt', en: 'Disconnected' },
    ERROR: { de: 'Fehler', en: 'Error' },
  };
  return labels[status]?.[lang] ?? status;
}

export function formatBatteryBadgeText(
  state: BatteryHealthState | 'EXT',
  lang: Language
): string {
  switch (state) {
    case 'EXT':
      return lang === 'de' ? 'Netz' : 'Ext';
    case 'OK':
      return 'OK';
    case 'LOW':
      return lang === 'de' ? 'Schwach' : 'Low';
    case 'CRITICAL':
      return lang === 'de' ? 'Kritisch' : 'Crit';
    case 'UNKNOWN':
    default:
      return '--';
  }
}

export function formatSensorIconLabel(icon: SensorIconName, lang: Language): string {
  const labels: Record<SensorIconName, { de: string; en: string }> = {
    door: { de: 'Tür / Kontakt', en: 'Door / Contact' },
    thermometer: { de: 'Thermometer', en: 'Thermometer' },
    cloud: { de: 'Wetter / Klima', en: 'Weather / Climate' },
    activity: { de: 'Messwert / Impuls', en: 'Activity / Pulse' },
    radio: { de: 'Funk / Allgemein', en: 'Radio / Generic' },
  };
  return labels[icon]?.[lang] ?? icon;
}

export function formatFieldKindLabel(kind: SensorFieldKind, lang: Language): string {
  const labels: Record<SensorFieldKind, { de: string; en: string }> = {
    number: { de: 'Messzahl', en: 'Numeric' },
    contact: { de: 'Kontakt (Auf/Zu)', en: 'Contact (Open/Closed)' },
    battery: { de: 'Batteriespannung', en: 'Battery Voltage' },
    counter: { de: 'Zähler', en: 'Counter' },
  };
  return labels[kind]?.[lang] ?? kind;
}

export function formatAuditActionLabel(action: string, lang: Language): string {
  const labels: Record<string, { de: string; en: string }> = {
    SETUP_BOOTSTRAP: { de: 'Instanz eingerichtet', en: 'Instance initialized' },
    USER_LOGIN: { de: 'Anmeldung', en: 'User signed in' },
    USER_LOGOUT: { de: 'Abmeldung', en: 'User signed out' },
    USER_INVITED: { de: 'Benutzer eingeladen', en: 'User invited' },
    INVITE_REDEEMED: { de: 'Einladung eingelöst', en: 'Invitation redeemed' },
    USER_UPDATED: { de: 'Benutzerkonto geändert', en: 'User updated' },
    PASSWORD_RESET_REQUESTED: {
      de: 'Passwort-Link angefordert',
      en: 'Password reset requested',
    },
    PASSWORD_RESET_COMPLETED: {
      de: 'Passwort zurückgesetzt',
      en: 'Password reset completed',
    },
    GROUP_CREATED: { de: 'Gruppe angelegt', en: 'Group created' },
    GROUP_DELETED: { de: 'Gruppe gelöscht', en: 'Group deleted' },
    CATEGORY_CREATED: { de: 'Kategorie angelegt', en: 'Category created' },
    CATEGORY_DELETED: { de: 'Kategorie gelöscht', en: 'Category deleted' },
    PERMISSION_GRANTED: { de: 'Berechtigung erteilt', en: 'Permission granted' },
    PERMISSION_DELETED: { de: 'Berechtigung entzogen', en: 'Permission revoked' },
    PERMISSION_REVOKED: { de: 'Berechtigung entzogen', en: 'Permission revoked' },
    DEVICE_UPDATED: { de: 'Sensor aktualisiert', en: 'Sensor updated' },
    DEVICE_MAINTENANCE_SET: {
      de: 'Wartungsmodus geändert',
      en: 'Maintenance mode changed',
    },
    DEVICE_PREFERENCE_UPDATED: {
      de: 'Sensoreinstellung geändert',
      en: 'Sensor preference updated',
    },
    DOWNLINK_QUEUED: { de: 'Downlink eingereiht', en: 'Downlink queued' },
    ALERT_ACKED: { de: 'Alarm quittiert', en: 'Alert acknowledged' },
    ALERT_RESOLVED: { de: 'Alarm automatisch behoben', en: 'Alert auto-resolved' },
    PROFILE_SAVED: { de: 'Sensor-Profil gespeichert', en: 'Sensor profile saved' },
    PROFILE_DELETED: { de: 'Profil gelöscht', en: 'Profile deleted' },
    TTN_APP_CREATED: { de: 'TTN-App verbunden', en: 'TTN app connected' },
    TTN_APP_RECONNECTED: { de: 'TTN-App neu verbunden', en: 'TTN app reconnected' },
    TTN_APP_DELETED: { de: 'TTN-App entfernt', en: 'TTN app removed' },
    SMTP_SETTINGS_UPDATED: { de: 'Mailserver gespeichert', en: 'Mail server updated' },
    SMTP_TEST_SENT: { de: 'Test-E-Mail gesendet', en: 'Test email sent' },
    PUSH_SUBSCRIPTION_ADDED: { de: 'Push-Gerät aktiviert', en: 'Push device added' },
    PUSH_SUBSCRIPTION_CREATED: { de: 'Push-Gerät aktiviert', en: 'Push device added' },
    PUSH_SUBSCRIPTION_DELETED: { de: 'Push-Gerät entfernt', en: 'Push device removed' },
    PUSH_TEST_SENT: { de: 'Test-Push gesendet', en: 'Test push sent' },
    SYSTEM_ACTION: { de: 'Systemsteuerung ausgeführt', en: 'System control executed' },
    SYSTEM_ACTION_STAGE_1: {
      de: 'MQTT-Verbindungen erneuert',
      en: 'MQTT workers reconnected',
    },
    SYSTEM_ACTION_STAGE_2: {
      de: 'Dienst-Neustart ausgelöst',
      en: 'Service restart triggered',
    },
    SYSTEM_ACTION_STAGE_3: {
      de: 'Server-Neustart ausgelöst',
      en: 'Host reboot triggered',
    },
  };
  return labels[action]?.[lang] ?? action;
}

export function formatAuditTargetLabel(targetType: string, lang: Language): string {
  const labels: Record<string, { de: string; en: string }> = {
    USER: { de: 'Benutzer', en: 'User' },
    SESSION: { de: 'Sitzung', en: 'Session' },
    GROUP: { de: 'Gruppe', en: 'Group' },
    CATEGORY: { de: 'Kategorie', en: 'Category' },
    PERMISSION: { de: 'Berechtigung', en: 'Permission' },
    DEVICE: { de: 'Sensor', en: 'Sensor' },
    ALERT: { de: 'Alarm', en: 'Alert' },
    PROFILE: { de: 'Profil', en: 'Profile' },
    TTN_APP: { de: 'TTN-Applikation', en: 'TTN App' },
    TTN_APPLICATION: { de: 'TTN-Applikation', en: 'TTN App' },
    SMTP: { de: 'Mailserver', en: 'Mail Server' },
    SMTP_SETTINGS: { de: 'Mailserver', en: 'Mail Server' },
    PUSH: { de: 'Push-Gerät', en: 'Push Device' },
    PUSH_SUBSCRIPTION: { de: 'Push-Gerät', en: 'Push Device' },
    SYSTEM: { de: 'System', en: 'System' },
  };
  return labels[targetType]?.[lang] ?? targetType;
}

export function translateApiError(err: unknown, lang: Language): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (lang === 'en') return raw;

  const exactMap: Record<string, string> = {
    'Invalid email or password': 'E-Mail-Adresse oder Passwort ist ungültig.',
    'Invalid setup token': 'Ungültiger Einrichtungsschlüssel (SETUP_TOKEN).',
    'Initial setup has already been completed':
      'Die Erst-Einrichtung wurde bereits abgeschlossen.',
    'Invite token is invalid or expired':
      'Dieser Einladungslink ist ungültig oder abgelaufen.',
    'Password reset token is invalid or expired':
      'Dieser Zurücksetzungslink ist ungültig oder abgelaufen.',
    'Invalid or expired password reset token':
      'Dieser Zurücksetzungslink ist ungültig oder abgelaufen.',
    'Authentication required': 'Anmeldung erforderlich.',
    'Unauthorized': 'Nicht angemeldet.',
    'Administrator privileges required': 'Administrator-Berechtigung erforderlich.',
    'SUPER_ADMIN privileges strictly required':
      'Diese Funktion ist ausschließlich Super-Administratoren vorbehalten.',
    'Validation failed': 'Eingabeprüfung fehlgeschlagen – bitte Eingaben prüfen.',
    'Internal server error': 'Interner Serverfehler.',
    'Request failed': 'Anfrage fehlgeschlagen.',
    'Current password is required': 'Bitte geben Sie Ihr aktuelles Passwort ein.',
    'Current password is incorrect': 'Das aktuelle Passwort ist nicht korrekt.',
    'Password confirmation failed': 'Das eingegebene Bestätigungspasswort ist falsch.',
    'Invalid password': 'Das eingegebene Passwort ist ungültig.',
    'User not found': 'Benutzer wurde nicht gefunden.',
    'Device not found': 'Sensor wurde nicht gefunden.',
    'Category not found': 'Kategorie wurde nicht gefunden.',
    'Group not found': 'Gruppe wurde nicht gefunden.',
    'Alert not found': 'Alarm wurde nicht gefunden.',
    'Profile not found': 'Sensor-Profil wurde nicht gefunden.',
    'Access denied': 'Zugriff verweigert.',
    'Access denied or device not found': 'Zugriff verweigert oder Sensor nicht gefunden.',
    'Access denied to device measurements': 'Kein Zugriff auf diese Sensormesswerte.',
    'Insufficient permission to modify device':
      'Keine ausreichende Berechtigung zum Ändern dieses Sensors.',
    'Insufficient permission to delete category':
      'Keine ausreichende Berechtigung zum Löschen dieser Kategorie.',
    'VIEWER or unauthorized role cannot acknowledge alerts':
      'Betrachter ohne Bedienrecht können keine Alarme quittieren.',
    'Operator permission required':
      'Hierfür ist mindestens Operator-Berechtigung erforderlich.',
    'Built-in sensor profiles cannot be overwritten':
      'Mitgelieferte Standard-Profile können nicht überschrieben werden.',
    'Built-in sensor profiles cannot be deleted':
      'Mitgelieferte Standard-Profile können nicht gelöscht werden.',
    'Cannot delete built-in sensor profile':
      'Mitgelieferte Standard-Profile können nicht gelöscht werden.',
    'A user with this email already exists':
      'Ein Benutzerkonto mit dieser E-Mail-Adresse existiert bereits.',
    'Cannot deactivate or demote the last active SUPER_ADMIN':
      'Der letzte aktive Super-Admin kann nicht gesperrt oder herabgestuft werden.',
    'Host reboot is disabled on this server':
      'Server-Neustart ist in der Serverkonfiguration deaktiviert (ENABLE_HOST_REBOOT).',
    'SMTP is not configured': 'Es ist noch kein SMTP-Mailserver eingerichtet.',
    'SMTP server is not configured': 'Es ist noch kein SMTP-Mailserver eingerichtet.',
  };

  if (exactMap[raw]) return exactMap[raw];
  if (raw.startsWith('Export failed')) return 'Datenexport fehlgeschlagen.';
  if (raw.startsWith('HTTP ')) return `Serverfehler (${raw})`;
  return raw;
}
