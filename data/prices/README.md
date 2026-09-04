Price snapshots live here.

One JSON file per ticker, written by `.github/workflows/update-prices.yml`
and committed automatically. Don't edit them by hand — the next workflow run
overwrites whatever is here.

Shape:

```json
{
  "symbol": "BBCA.JK",
  "currency": "IDR",
  "exchange": "Jakarta",
  "name": "Bank Central Asia Tbk",
  "updated": "2026-08-23T12:00:11Z",
  "series": [{ "d": "2025-08-25", "c": 8725 }]
}
```
