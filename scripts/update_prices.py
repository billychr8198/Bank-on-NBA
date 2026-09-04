#!/usr/bin/env python3
"""
Pull daily closing prices from Yahoo Finance for every ticker in
data/portfolio.json and write one JSON snapshot per ticker into data/prices/.

Standard library only — no pip install, nothing to pin, nothing to break.

Usage:
    python3 scripts/update_prices.py                 # everything in portfolio.json
    python3 scripts/update_prices.py BBCA.JK AAPL    # just these
    python3 scripts/update_prices.py --range 5y      # deeper history
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO = os.path.join(ROOT, "data", "portfolio.json")
OUTDIR = os.path.join(ROOT, "data", "prices")

HOSTS = [
    "https://query1.finance.yahoo.com/v8/finance/chart/",
    "https://query2.finance.yahoo.com/v8/finance/chart/",
]
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")


def tickers_from_portfolio():
    if not os.path.exists(PORTFOLIO):
        return []
    with open(PORTFOLIO, encoding="utf-8") as fh:
        data = json.load(fh)
    out = []
    for h in data.get("holdings", []):
        t = (h.get("ticker") or "").strip()
        if t and t not in out:
            out.append(t)
    return out


def fetch(ticker, rng, attempts=3):
    """Try both Yahoo hosts, with a short backoff. Returns parsed JSON."""
    last = None
    for attempt in range(attempts):
        for host in HOSTS:
            url = f"{host}{urllib.parse.quote(ticker)}?range={rng}&interval=1d&includePrePost=false"
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    return json.loads(res.read().decode("utf-8"))
            except Exception as exc:            # noqa: BLE001 - report and retry
                last = exc
        if attempt < attempts - 1:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not fetch {ticker}: {last}")


def to_snapshot(ticker, payload):
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        err = (payload.get("chart") or {}).get("error")
        raise ValueError(f"no result for {ticker} ({err})")
    r = result[0]

    stamps = r.get("timestamp") or []
    indicators = r.get("indicators") or {}
    adj = (indicators.get("adjclose") or [{}])[0].get("adjclose")
    quote = (indicators.get("quote") or [{}])[0]
    closes = adj if adj else quote.get("close") or []

    series = []
    for i, ts in enumerate(stamps):
        c = closes[i] if i < len(closes) else None
        if c is None:
            continue
        day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        series.append({"d": day, "c": round(float(c), 4)})

    if len(series) < 2:
        raise ValueError(f"not enough closes for {ticker}")

    # de-duplicate, keep last value per day, sort ascending
    seen = {}
    for p in series:
        seen[p["d"]] = p["c"]
    series = [{"d": d, "c": seen[d]} for d in sorted(seen)]

    meta = r.get("meta") or {}
    return {
        "symbol": ticker,
        "currency": meta.get("currency") or "USD",
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "",
        "name": meta.get("longName") or meta.get("shortName") or ticker,
        "previousClose": meta.get("chartPreviousClose"),
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "points": len(series),
        "series": series,
    }


def merge_with_existing(path, snapshot):
    """Keep history we already have if Yahoo returns a shorter window."""
    if not os.path.exists(path):
        return snapshot
    try:
        with open(path, encoding="utf-8") as fh:
            old = json.load(fh)
    except (OSError, ValueError):
        return snapshot
    merged = {p["d"]: p["c"] for p in old.get("series", [])}
    merged.update({p["d"]: p["c"] for p in snapshot["series"]})
    snapshot["series"] = [{"d": d, "c": merged[d]} for d in sorted(merged)]
    snapshot["points"] = len(snapshot["series"])
    return snapshot



# --------------------------------------------------------------------- FX ---

# Exchange rates come from an open feed on the jsDelivr CDN: one request
# returns every currency quoted against USD. Yahoo is not involved — it needed
# one request per pair and was the least reliable part of the old chain.
FX_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
]
# ECB reference rates: ~30 currencies, used only if every source above fails.
FX_FALLBACKS = [
    "https://api.frankfurter.app/latest?from=USD",
    "https://api.frankfurter.dev/v1/latest?base=USD",
]


def known_currency_codes():
    """The ISO codes the site actually formats, read from the JS table so the
    two never drift apart."""
    path = os.path.join(ROOT, "js", "data", "currencies.js")
    try:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
    except OSError:
        return set()
    # rows look like:  ["IDR", "Indonesian Rupiah", "Rp", "id-ID", 0, 1000],
    return set(re.findall(r'\[\s*"([A-Z]{3})"\s*,', src))


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def write_fx():
    """Fetch every USD rate in one request and write data/prices/fx.json."""
    known = known_currency_codes()
    rates, date, source = {}, None, None

    for url in FX_SOURCES + FX_FALLBACKS:
        try:
            payload = get_json(url)
            if "rates" in payload:                      # Frankfurter / ECB shape
                table = {k.upper(): v for k, v in payload["rates"].items()}
                source = "ecb"
            else:                                       # currency-api shape
                table = {k.upper(): v for k, v in (payload.get("usd") or {}).items()}
                source = "currency-api"
            date = payload.get("date")
            for code, value in table.items():
                # The feed also carries crypto and metals; keep real currencies.
                if known and code not in known:
                    continue
                try:
                    v = float(value)
                except (TypeError, ValueError):
                    continue
                if v > 0:
                    rates[code] = {"rate": v}
            if rates:
                break
        except Exception as exc:                        # noqa: BLE001
            print(f"  .. {url.split('/')[2]} unavailable ({exc})", file=sys.stderr)

    if not rates:
        print("FAIL  no exchange-rate source answered", file=sys.stderr)
        return False

    path = os.path.join(OUTDIR, "fx.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({
            "base": "USD",
            "date": date,
            "source": source,
            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "rates": rates,
        }, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"  ok  {len(rates)} rates from {source} (as of {date}) -> {path}")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tickers", nargs="*", help="override the portfolio.json list")
    ap.add_argument("--range", default="2y",
                    help="history window: 1y, 2y, 5y, 10y, max (default 2y)")
    ap.add_argument("--no-fx", action="store_true",
                    help="skip the exchange-rate snapshot")
    ap.add_argument("--fx-only", action="store_true",
                    help="only refresh exchange rates")
    args = ap.parse_args()

    os.makedirs(OUTDIR, exist_ok=True)

    if args.fx_only:
        return 0 if write_fx() else 1

    tickers = args.tickers or tickers_from_portfolio()
    if not tickers:
        print("No tickers found. Add one to data/portfolio.json.", file=sys.stderr)
        return 1

    os.makedirs(OUTDIR, exist_ok=True)
    failures = []

    for t in tickers:
        try:
            snap = to_snapshot(t, fetch(t, args.range))
            path = os.path.join(OUTDIR, f"{t}.json")
            snap = merge_with_existing(path, snap)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(snap, fh, separators=(",", ":"))
                fh.write("\n")
            last = snap["series"][-1]
            print(f"  ok  {t:<12} {snap['points']:>5} points  last {last['d']} "
                  f"{last['c']} {snap['currency']}")
        except Exception as exc:                # noqa: BLE001 - keep going
            failures.append(t)
            print(f"FAIL  {t:<12} {exc}", file=sys.stderr)

    fx_ok = True
    if not args.no_fx:
        print("Exchange rates:")
        fx_ok = write_fx()

    if failures and len(failures) == len(tickers) and not fx_ok:
        print("Every fetch failed — not committing anything.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
