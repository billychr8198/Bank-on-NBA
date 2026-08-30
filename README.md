# Banking on NBA

A daily, weekly and monthly budget tracker with a 365-day NBA season attached.
Log your money every day and the league grows because you did. Keep a streak and
you unlock all 30 franchises, then all 55 Hall of Fame legends.

Plain HTML, CSS and JavaScript — no build step, no bundler, no framework.
Drop it on GitHub Pages and it runs.

---

## Contents

- [What it does](#what-it-does)
- [Run it locally](#run-it-locally)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Setting up Firebase](#setting-up-firebase)
- [Updating your investment portfolio](#updating-your-investment-portfolio)
- [How the numbers work](#how-the-numbers-work)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [Credits and licence](#credits-and-licence)

---

## What it does

**Monthly** — income allocation for salary, freelance and passive streams; a
recurring bill manager with due dates, paid/unpaid status and subscription
tagging; sinking funds that divide annual costs across twelve months; savings
and debt targets subtracted *before* anything is called discretionary; and a
planned-versus-actual variance table per category.

**Weekly** — safe-to-spend, calculated by dividing the remaining variable pool
into weekly allowances. A running total counts down against a fixed 7-day
ceiling. Weeks follow the calendar or your own payday anchor.

**Daily** — today's budget, quick expense and income entry (amount, category,
date, payment method, note), a live balance, and the full day's ledger.

**Portfolio** — daily closing prices from Yahoo Finance, charted, with cost
basis, average price, and realised and unrealised P/L per position. Record
buys and sells, remove holdings, and switch **Live** on to poll the intraday
price while the tab is open. The sell planner shows exactly what a sale would
net before you commit to it. Ships tracking BCA (`BBCA.JK`).

**Currency** — a converter over every ISO 4217 currency, with daily mid-market
rates and a searchable rate table. No API key, no proxy.

**The season** — a 365-day calendar, a progress report, and a guide tab
available in English and Bahasa Indonesia.

**Themes** — dark, light, or auto to follow your device.

---

## Run it locally

The app fetches `data/portfolio.json`, so opening `index.html` straight off
disk trips CORS. Serve the folder instead:

```bash
cd banking-on-nba
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works — `npx serve`,
`php -S localhost:8000`, VS Code's Live Server, whatever you already have.

---

## Deploy to GitHub Pages

1. **Create the repository** and push this folder to it.

   ```bash
   git init
   git add .
   git commit -m "Banking on NBA"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/banking-on-nba.git
   git push -u origin main
   ```

2. **Turn on Pages.** Repository → **Settings** → **Pages** → Source:
   **Deploy from a branch**, Branch: `main`, Folder: `/ (root)` → **Save**.

3. Wait a minute, then visit
   `https://YOUR-USERNAME.github.io/banking-on-nba/`.

4. **Kick off the first price fetch.** Repository → **Actions** →
   *Update price & FX snapshots* → **Run workflow**. After that it runs itself
   daily, refreshing both stock prices and exchange rates.

   > If Actions shows "Workflows aren't being run on this forked repository",
   > click **I understand my workflows, go ahead and enable them**.

That's it — the app works immediately in local mode. Firebase is optional and
only needed for syncing across devices.

### A note on paths

Every path in the project is relative (`css/style.css`, not `/css/style.css`),
so the app works from a subdirectory like `/banking-on-nba/` as well as from a
custom domain at the root. Don't change them to absolute paths.

---

## Setting up Firebase

Without this, your data is saved in the browser you're using and stays there.
With it, the same season follows you across phone, laptop and tablet. The free
Spark plan is far more than enough.

### 1. Create the project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it (e.g. `banking-on-nba`). Google Analytics is not needed — turn it off.
3. Wait for provisioning, then **Continue**.

### 2. Register a web app

1. On the project overview, click the **`</>`** (Web) icon.
2. Give it a nickname. **Do not** tick "Also set up Firebase Hosting" — GitHub
   Pages is doing that job.
3. Firebase shows you a `firebaseConfig` object. Copy it.

### 3. Paste the config

Open `js/config.js` and fill in the values you just copied:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "banking-on-nba.firebaseapp.com",
  projectId: "banking-on-nba",
  storageBucket: "banking-on-nba.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

> These values are **not** secrets. They identify your project publicly and are
> meant to ship in client code. What actually protects your data is the
> security rules in step 5.

### 4. Enable sign-in methods

**Build → Authentication → Get started**, then under **Sign-in method** enable
whichever you want:

| Method | Enable it if |
|---|---|
| **Anonymous** | You want one-tap use with no account. Tied to one browser. |
| **Google** | You want real cross-device sync. Recommended. |
| **Email/Password** | You'd rather not use a Google account. |

Then go to **Authentication → Settings → Authorised domains** and add your
Pages host:

```
YOUR-USERNAME.github.io
```

`localhost` is already there for local testing.

### 5. Create the database and lock it down

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** and pick a region near you
   (`asia-southeast2` is Jakarta).
3. Open the **Rules** tab, replace everything with the following, and
   **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Each signed-in user can read and write only their own document.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

That rule is the whole security model: your season lives at
`users/{your-uid}/state/main` and nobody else — including whoever deployed the
site — can read it.

### 6. Commit and sign in

```bash
git add js/config.js
git commit -m "Add Firebase config"
git push
```

Reload the site. The header button now reads **Sign in** — click it, pick a
method, and you're synced. Do the same on your other devices with the same
account and everything appears.

### Anonymous now, permanent later

If you start anonymously and later want real sync, open the sync dialog and
click **Link a Google account**. Your uid is preserved, so nothing already
logged is lost.

---

## Updating your investment portfolio

There are two places a holding can live, and they do different jobs:

| Where | What it controls |
|---|---|
| `data/portfolio.json` | Which tickers the daily GitHub Action fetches, and the starting portfolio for a fresh install |
| In the app (Portfolio → **+ Add investment**) | Your personal holdings and lots, saved to your browser and Firebase |

For a ticker you want refreshed automatically every day, add it to **both**.

### Add a new stock

**Step 1 — find the exact ticker.** Open the stock on Yahoo Finance and read it
out of the URL. Indonesian listings on IDX end in `.JK`:

```
https://finance.yahoo.com/quote/BBCA.JK/   →  BBCA.JK
https://finance.yahoo.com/quote/BBRI.JK/   →  BBRI.JK
https://finance.yahoo.com/quote/AAPL/      →  AAPL
https://finance.yahoo.com/quote/VOO/       →  VOO      (ETFs work too)
https://finance.yahoo.com/quote/BTC-USD/   →  BTC-USD  (crypto works too)
```

**Step 2 — add it to `data/portfolio.json`:**

```json
{
  "baseCurrency": "IDR",
  "holdings": [
    {
      "ticker": "BBCA.JK",
      "name": "Bank Central Asia Tbk",
      "shortName": "BCA",
      "currency": "IDR",
      "source": "https://finance.yahoo.com/quote/BBCA.JK/",
      "lots": []
    },
    {
      "ticker": "BBRI.JK",
      "name": "Bank Rakyat Indonesia Tbk",
      "shortName": "BRI",
      "currency": "IDR",
      "source": "https://finance.yahoo.com/quote/BBRI.JK/",
      "lots": []
    }
  ]
}
```

**Step 3 — push.** The workflow is triggered by any change to
`data/portfolio.json`, so the new ticker is fetched within a minute or two:

```bash
git add data/portfolio.json
git commit -m "Track BBRI"
git push
```

**Step 4 — record what you actually own.** In the app, open **Portfolio →
+ Add lot** and enter the date, share count, price and fees for each purchase.
Lots are personal data — they live in your browser and Firebase, never in the
repository. Add lots for several dates and the average cost updates itself.

### Fetch prices by hand

```bash
python3 scripts/update_prices.py              # prices + exchange rates
python3 scripts/update_prices.py BBRI.JK      # just one ticker
python3 scripts/update_prices.py --range max  # the deepest history Yahoo has
python3 scripts/update_prices.py --fx-only    # only refresh exchange rates
python3 scripts/update_prices.py --no-fx      # skip the exchange rates
```

Standard library only — no `pip install` needed.

### Change the schedule

Edit the cron line in `.github/workflows/update-prices.yml`. It's UTC:

```yaml
- cron: "0 12 * * *"     # 12:00 UTC daily = 19:00 WIB
```

12:00 UTC lands after the Jakarta close (16:00 WIB) and before the US open, so
both IDX and US tickers get a completed session. For US-only tickers, `0 22 * * 1-5`
is a better fit.

### Remove a holding

Delete its object from `data/portfolio.json`, delete `data/prices/TICKER.json`,
and push. In the app, remove its lots from the Portfolio tab.

---

## Buying, selling and removing

Everything lives on the **Portfolio** tab.

| Button | What it does |
|---|---|
| **+ Buy** | Records a purchase — date, shares, price, fees |
| **Sell** | Records a sale and banks the realised gain |
| **What if I sold?** | Same calculator, writes nothing — a dry run |
| **Remove investment** | Deletes the holding, its history and its cached prices |
| **×** on any row | Removes that single buy or sell |

### How the gain is calculated

Average-cost accounting, replayed in date order every time anything changes:

```
buy   →  shares += n ;  cost += n × price + fee
sell  →  gain = (n × sellPrice) − fee − (n × averageCost)
         cost -= n × averageCost ;  shares -= n
```

So two buys of 100 shares at 8,000 and 9,000 with 5,000 in fees each give an
average cost of 8,550. Selling 50 at 10,000 with a 5,000 fee realises
`500,000 − 5,000 − 427,500 = 67,500`.

Average cost is what most retail brokers and Indonesian tax treatment use, and
unlike FIFO it needs no lot-by-lot matching — so correcting an old purchase
can't silently rewrite which shares a past sale disposed of. Editing or
deleting any row re-derives every figure.

**Live mode** polls Yahoo for the intraday price every 60 seconds while the
Portfolio tab is open. It pauses itself when you switch tabs or hide the
window, so it won't drain a phone battery in your pocket. Adjust the cadence
with `livePollSeconds` in `js/config.js`.

## Currency

The **Currency** tab converts between every ISO 4217 currency.

Rates come from [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api),
an open feed served over the jsDelivr CDN. It needs no API key, covers 200+
currencies, and — importantly — sends CORS headers, so your browser fetches it
directly with **no proxy in the path**. A single request returns every currency
quoted against the US dollar, so a full refresh is one round trip rather than
one per pair. Rates are pivoted through USD, so any pair is derived by dividing
one rate by the other.

If that feed is ever unreachable, the app falls back to the European Central
Bank's daily reference rates via [Frankfurter](https://frankfurter.dev). The
ECB publishes about 30 currencies, so during a fallback some entries show a
dash until the main source returns. The converter tells you when it's running
on the backup.

Rates settle once per business day, so a Saturday lookup returns Friday's
close. That's normal for currency data and fine for budgeting — it is not a
trading feed.

These are mid-market rates: the midpoint between buy and sell. Your bank, your
card and the money changer will all give you slightly less. Treat it as the
honest reference number, not a quote.

Rates cache for 12 hours (`fxStaleHours` in `js/config.js`), and the daily
workflow also commits `data/prices/fx.json` so a first-time visitor sees rates
before the network call even returns. Change the sources with `fxSources` and
`fxFallbacks` in the same file. Zero-decimal
currencies — IDR, JPY, KRW, VND and the rest — are formatted without cents,
and every currency renders in Latin digits regardless of its locale.

Set your display currency in **Settings**. If you hold stocks priced in another
currency, the portfolio totals convert into it automatically.

## Themes and language

The theme button in the header cycles **dark → light → auto**. Auto follows
your operating system and keeps following it, so the app moves with your
system theme at sunset without a reload. The resolved theme is applied by a
tiny inline script in `index.html` before the stylesheet paints, so the page
never flashes the wrong one.

The **Guide** tab has a language switch: **English** or **Bahasa Indonesia**,
across twelve sections — setup, the daily ritual, the money maths, weeks and
pay cycles, unlock rules, indicator formulas, investments, the converter, the
collection, sync, troubleshooting and an FAQ. Your choice is remembered. The
Indonesian text is written in everyday Indonesian rather than translated word
for word.

## How the numbers work

### Money

```
variable pool   = income − fixed bills − sinking funds − savings − debt
weekly ceiling  = (variable pool − spent earlier in cycle) ÷ weeks left in cycle
today's budget  = (weekly ceiling − spent this week) ÷ days left in week
```

The weekly ceiling is fixed when the week opens, so the countdown only moves
when you spend. Unspent money rolls forward on its own.

### Unlocks

| Phase | Rule | Count | Days |
|---|---|---|---|
| 1 — Franchise Era | every **3** consecutive logged days | 30 teams | 90 |
| 2 — Hall of Fame Era | every **5** consecutive logged days | 55 legends | 275 |
| | | | **365** |

Legends are inducted Tier 5 → Tier 1, so Michael Jordan is the 55th and lands
on day 365 of a perfect season.

A day counts as logged when at least one transaction carries that date.
Unlocks are recomputed from the ledger on every change, so backfilling a
missed day genuinely repairs the streak — and deleting entries correctly takes
progress back.

### League indicators

```
value = baseline × ( 1 + maxLift × ( 1 − e^( −loggedDays ÷ 120 ) ) )
```

Each logged day is one point of momentum — the headline +1%. The exponential
term applies diminishing returns so a flawless 365-day season reaches 95.2% of
each ceiling rather than compounding to nonsense (a straight 1% a day would
multiply league revenue 37× in a year).

| Indicator | Baseline (2024-25) | Max lift | Why that ceiling |
|---|---|---|---|
| National viewership | 1.60 M viewers/game | +35% | Audiences genuinely swing this much between a flat season and a great one |
| Ticket sales | 22.50 M tickets/season | +8% | Arenas already run near capacity — you can't sell seats that don't exist |
| Global popularity | 72.0 / 100 | +22% | Composite of social reach, international households and League Pass, capped at 100 |
| Broadcast partners | 70 rights holders | +30% | Distribution already reaches 214 countries; growth is incremental |
| League revenue | $13.0 B/season | +18% | About the largest realistic jump outside a media-rights reset |

Baselines are edited in `js/config.js` under `APP.indicators`.

---

## Project layout

```
.
├── index.html                       # the whole shell
├── css/style.css
├── js/
│   ├── config.js                    # ← Firebase config and all tunable constants
│   ├── theme.js                     # dark / light / auto
│   ├── motion.js                    # count-up figures, ripples, bar growth
│   ├── util.js                      # dates, money formatting, DOM helpers
│   ├── store.js                     # state, localStorage, Firestore sync
│   ├── finance.js                   # monthly / weekly / daily maths
│   ├── game.js                      # streaks, unlocks, indicator model
│   ├── prices.js                    # snapshots, live quotes, average-cost ledger
│   ├── fx.js                        # exchange rates
│   ├── chart.js                     # dependency-free SVG charts
│   ├── ui.js                        # modals, forms, shared components
│   ├── lightbox.js                  # full-size zoomable artwork viewer
│   ├── data/
│   │   ├── teams.js                 # 30 franchises (generated)
│   │   ├── legends.js               # 55 legends with skill ratings (generated)
│   │   └── currencies.js            # every ISO 4217 currency
│   └── views/                       # one file per tab
├── data/
│   ├── portfolio.json               # ← tickers to track
│   └── prices/
│       ├── BBCA.JK.json             # written by the daily workflow
│       └── fx.json                  # exchange rates, same workflow
├── scripts/update_prices.py
├── .github/workflows/update-prices.yml
└── assets/
    ├── logo.jpg
    ├── teams/*.svg                  # 30 logos
    └── legends/*.webp|jpg           # 55 portraits
```

### Changing the game rules

All in `js/config.js`:

```js
phase1: { target: 30, streak: 3, label: "Franchise Era" },
phase2: { target: 55, streak: 5, label: "Hall of Fame Era" },
seasonLength: 365,
saturationTau: 120,       // lower = indicators climb faster
livePollSeconds: 60,      // live price cadence
fxStaleHours: 12,         // how long exchange rates cache
priceStaleHours: 30,      // when to bypass the committed snapshot
```

### Adding a spending category

Append to `APP.categories` in `js/config.js`. `variable: true` means the weekly
safe-to-spend engine controls it; `false` keeps it out of the weekly allowance.

---

## Troubleshooting

**The chart is empty.**
Run the *Update price & FX snapshots* workflow once (Actions → Run workflow). Until
it has run, the app falls back to fetching live through a CORS relay, which
public relays sometimes rate-limit. Hitting **Refresh** on the Portfolio tab
retries.

**The workflow ran but nothing was committed.**
Check the log. If Yahoo returned an error the step is marked with a warning
rather than failing the run, on purpose — a bad fetch shouldn't turn the repo
red. Re-run it; Yahoo throttles occasionally.

**"Missing or insufficient permissions" when signing in.**
The Firestore rules from step 5 haven't been published. Firestore → Rules →
paste → Publish.

**"auth/unauthorized-domain".**
Add `YOUR-USERNAME.github.io` under Authentication → Settings → Authorised
domains.

**"auth/operation-not-allowed".**
That sign-in provider is still switched off in Authentication → Sign-in method.

**The Google popup is blocked.**
Allow popups for the site. Some in-app browsers (Instagram, LinkedIn) block
them entirely — open the site in a real browser.

**Live stock prices won't update.**
Browsers can't call Yahoo directly, so the intraday **Live** toggle routes
through public CORS relays (corsproxy.io, allorigins.win, codetabs.com). Those
are third-party services and they do occasionally rate-limit. The daily GitHub
Action is unaffected — it calls Yahoo server-side — so your chart history stays
reliable either way. Wait a minute and press Refresh, or edit `priceProxies` in
`js/config.js`. Exchange rates do **not** use these relays.

**A currency shows "—" in the rate table.**
Usually means the app is running on the ECB fallback, which only publishes
about 30 currencies. Press **Update rates** to retry the main source. The card
subtitle tells you which source is in use.

**The logo looks wrong on a light background.**
`assets/logo.png` has a transparent background. If you replace it, keep the
transparency or it will render as a white block in light mode.

**My streak looks wrong.**
Streaks are derived from transaction dates, not stored separately. Open the
Calendar tab: any red square is a day with no entries. Adding a backdated entry
to that day repairs everything downstream.

**Everything vanished.**
Local-only data lives in your browser's storage — clearing site data, or
private-browsing windows, will lose it. Use Settings → Export for backups, or
connect Firebase.

---

## Credits and licence

Team logos, player likenesses, team names and the NBA marks belong to their
respective owners and are used here for personal, non-commercial purposes.
This project is not affiliated with, endorsed by, or connected to the NBA or
any of its teams.

Price data comes from Yahoo Finance and is delayed and provided as-is. Nothing
in this app is financial advice — it is a record-keeping tool.

The code is yours to use and modify.
