# Parenting MCP

MCP-palvelin ja ajastettu WhatsApp-viestintä vanhemmille. Hakee lasten koulutiedot [Wilmasta](https://www.visma.fi/inschool/) ja lähettää automaattiset yhteenvedot WhatsAppiin.

## Ominaisuudet

### Ajastetut WhatsApp-viestit (Scheduler)

Scheduler lähettää automaattisesti kolme viestiä WhatsApp-ryhmään tai -kontaktille:

| Viesti | Oletusaika | Sisältö |
|--------|------------|---------|
| Läksykooste | 16:02 | Päivän kotitehtävät Wilmasta |
| Huomisen aikataulu | 20:03 | Huomisen koulupäivän ajat + kokeet/erikoisohjelma |
| Viikkokatsaus | su 17:57 | Ensi viikon kokeet päivittäin ryhmiteltynä |

Ajastukset ovat muokattavissa cron-syntaksilla `config.json`-tiedostossa.

### MCP-työkalut (Claude-integraatio)

Parenting MCP tarjoaa MCP-protokollan kautta 10 työkalua, joita Claude tai muu LLM voi kutsua:

**Wilma-työkalut:**
- `get_wilma_summary` — Päivittäinen yhteenveto kaikille oppilaille (aikataulu, läksyt, kokeet, viestit)
- `get_wilma_schedule` — Lukujärjestys päivälle tai viikolle
- `get_wilma_exams` — Tulevat kokeet
- `get_wilma_homework` — Kotitehtävät
- `get_wilma_news` — Koulun tiedotteet

**WhatsApp-työkalut:**
- `send_whatsapp_message` — Lähetä viesti henkilölle tai ryhmään
- `list_whatsapp_contacts` — Listaa yhteystiedot
- `list_whatsapp_groups` — Listaa ryhmät

**Yhteenvetotyökalut:**
- `send_daily_summary` — Koosta ja lähetä päivän yhteenveto WhatsAppiin
- `send_weekly_summary` — Koosta ja lähetä viikkoyhteenveto WhatsAppiin

## Asennus

```bash
npm install
npm run build
```

## Setup

Interaktiivinen setup-komento ohjaa alkuasetuksiin:

```bash
npm run setup
```

Setup tekee seuraavat asiat:

1. **WhatsApp-yhdistäminen** — Näyttää QR-koodin, jonka skannaat puhelimella (WhatsApp > Asetukset > Yhdistetyt laitteet)
2. **Kohderyhmän valinta** — Valitset WhatsApp-ryhmän tai kontaktin, johon viestit lähetetään
3. **Verkkokurssisuodattimet** — Jos oppilailla on verkkokursseja, jotka näkyvät lukujärjestyksessä mutta eivät ole lähiopetusta, ne voi suodattaa pois
4. **Ajastukset** — Viestien lähetysajat (oletus: läksyt 16:02, ilta-aikataulu 20:03, viikkokatsaus su 17:57)

Asetukset tallentuvat `config.json`-tiedostoon.

Jos WhatsApp-sessio vanhenee, ohjelma pyytää automaattisesti uuden QR-koodin — erillistä uudelleenasennusta ei tarvita.

## Konfiguraatio

`config.json` (luodaan `npm run setup` -komennolla):

```json
{
  "whatsapp": {
    "targetJid": "123456789@g.us",
    "isGroup": true,
    "targetName": "Ryhmän nimi"
  },
  "schedule": {
    "homeworkCron": "2 16 * * *",
    "eveningCron": "3 20 * * *",
    "weeklyCron": "57 17 * * 0",
    "timezone": "Europe/Helsinki"
  },
  "filters": {
    "onlineCourses": [
      {
        "studentFirstName": "Matti",
        "startTime": "07:00",
        "subjectCodePatterns": ["Ver", "verkko"]
      }
    ]
  }
}
```

| Kenttä | Kuvaus |
|--------|--------|
| `whatsapp.targetJid` | WhatsApp-ryhmän tai kontaktin JID |
| `whatsapp.isGroup` | `true` ryhmälle, `false` yksittäiselle kontaktille |
| `schedule.*Cron` | Cron-lauseke ([syntaksi](https://crontab.guru/)) |
| `filters.onlineCourses` | Suodattaa verkkokurssit pois lukujärjestyksestä nimen, alkuajan ja kurssikoodin perusteella |

## Käyttö

### Scheduler (automaattiset viestit)

```bash
npm run scheduler
```

Systemd-palveluna (käynnistyy automaattisesti kirjautuessa):

```bash
# Kopioi palvelutiedosto
cp parenting-scheduler.service ~/.config/systemd/user/
systemctl --user enable --now parenting-scheduler

# Lokit
journalctl --user -u parenting-scheduler -f
```

### Viestien manuaalinen lähetys (trigger)

Jos kone on ollut pois päältä cron-ajankohdan aikana, voit lähettää viestit jälkikäteen:

```bash
# Pysäytä scheduler (muuten kaksi WhatsApp-sessiota taistelee samasta auth_storesta)
systemctl --user stop parenting-scheduler

# Lähetä haluamasi viesti(t)
npm run trigger -- homework
npm run trigger -- evening             # huomisen aikataulu (= kuin Sun-Thu ilta-cron)
npm run trigger -- evening:today       # tämän päivän aikataulu (esim. viikonloppu-paussin jälkeen)
npm run trigger -- weekly
npm run trigger -- homework,evening    # pilkulla eroteltuna useita

# Käynnistä scheduler takaisin päälle
systemctl --user start parenting-scheduler
```

Trigger ajaa täsmälleen saman logiikan kuin cron: `homework` käyttää kuluvaa päivää, `evening` ja `weekly` huomista/ensi viikkoa.

### MCP-palvelin (Claude-integraatio)

```bash
npm run start
```

Lisää Claude Desktopin tai Claude Coden MCP-asetuksiin:

```json
{
  "mcpServers": {
    "parenting": {
      "command": "node",
      "args": ["/polku/parenting_mcp/build/index.js"]
    }
  }
}
```

## Wilma

Vaatii [wilma-cli](https://www.npmjs.com/package/@wilm-ai/wilma-cli):n, joka on asennettava ja konfiguroitava erikseen:

```bash
npm install -g @wilm-ai/wilma-cli
wilma  # Ensimmäinen kirjautuminen
```

Tukee useita Wilma-profiileja (eri koulut/vanhemmat) — scheduler hakee kaikkien profiilien oppilaat automaattisesti.

## Teknologia

- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API
- [wilma-cli](https://www.npmjs.com/package/@wilm-ai/wilma-cli) — Wilma-rajapinta
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Model Context Protocol
- [node-cron](https://www.npmjs.com/package/node-cron) — Ajastukset
- TypeScript, Node.js

## Tiedostorakenne

```
parenting_mcp/
├── src/
│   ├── index.ts              # MCP-palvelin
│   ├── scheduler.ts          # Ajastetut WhatsApp-viestit
│   ├── jobs.ts               # Jaetut työt (käyttävät scheduler + trigger)
│   ├── trigger.ts            # Manuaalinen viestien lähetys (CLI)
│   ├── setup.ts              # Interaktiivinen setup
│   ├── whatsapp-auth.ts      # WhatsApp QR-skannaus (standalone)
│   ├── services/
│   │   ├── whatsapp.ts       # WhatsApp-yhteys (Baileys)
│   │   ├── wilma.ts          # Wilma CLI -wrapper
│   │   └── config.ts         # Config-palvelu
│   └── tools/                # MCP-työkalut
├── config.json               # Asetukset (gitignored)
├── auth_store/               # WhatsApp-sessio (gitignored)
└── package.json
```

## Huomautus WhatsAppin käytöstä

Tämä ohjelma käyttää epävirallista WhatsApp Web -rajapintaa ([Baileys](https://github.com/WhiskeySockets/Baileys)), joka ei ole Metan/WhatsAppin hyväksymä tai tukema. WhatsAppin käyttöehdot saattavat kieltää epävirallisten API-rajapintojen käytön, ja tilin käyttö tällä tavalla voi johtaa tilin rajoittamiseen tai sulkemiseen. Käyttäjä on itse vastuussa ohjelman käytöstä ja mahdollisista seurauksista.
