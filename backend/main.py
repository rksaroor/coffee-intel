from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os
import psycopg2
import yfinance as yf
import feedparser
import requests
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

DB_URL = os.environ.get(
    "DB_URL",
    "postgresql://postgres.bsncioctcgrhkmhovymk:DHvIygO46aXzkf3u@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
)

_cache: dict = {}


def cached(key, fn, ttl=900):
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < ttl:
        return _cache[key]["data"]
    data = fn()
    _cache[key] = {"data": data, "ts": now}
    return data


# ── Karnataka auto-update ────────────────────────────────────────────────────

def get_usd_inr() -> float:
    try:
        h = yf.Ticker("USDINR=X").history(period="2d")
        if not h.empty:
            return float(h["Close"].iloc[-1])
    except Exception:
        pass
    return 86.0  # fallback


def do_karnataka_update():
    """Fetch ICE Arabica price, convert to INR/kg, insert per-district rows."""
    try:
        h = yf.Ticker("KC=F").history(period="2d")
        if h.empty:
            print("[auto] No Arabica price data available")
            return
        # KC=F is quoted in US cents/lb
        cents_per_lb = float(h["Close"].iloc[-1])
        usd_inr = get_usd_inr()
        # cents/lb → USD/lb → USD/kg → INR/kg
        inr_per_kg = (cents_per_lb / 100 / 0.453592) * usd_inr

        now = datetime.now()
        # (coffee_type, district, premium_multiplier)
        entries = [
            ("Arabica",  "Chikmagalur", 1.20),
            ("Arabica",  "Coorg",       1.16),
            ("Arabica",  "Hassan",      1.11),
            ("Arabica",  "Kodagu",      1.14),
            ("Robusta",  "Chikmagalur", 0.70),
            ("Robusta",  "Coorg",       0.67),
            ("Robusta",  "Sakleshpur",  0.63),
        ]

        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        for coffee_type, district, mult in entries:
            price = round(inr_per_kg * mult)
            cur.execute(
                "INSERT INTO coffee_prices (coffee_type, price, district, source, date)"
                " VALUES (%s,%s,%s,%s,%s)",
                (coffee_type, price, district, "auto", now),
            )
        conn.commit()
        cur.close()
        conn.close()

        _cache.pop("local_prices", None)
        print(
            f"[auto] Karnataka prices updated — "
            f"base ₹{round(inr_per_kg)}/kg "
            f"(KC={cents_per_lb}¢/lb, USD/INR={usd_inr:.1f})"
        )
    except Exception as e:
        print(f"[auto] Karnataka update error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def _scheduler():
        # Run once immediately on startup, then every 6 hours
        await asyncio.to_thread(do_karnataka_update)
        while True:
            await asyncio.sleep(6 * 3600)
            await asyncio.to_thread(do_karnataka_update)

    task = asyncio.create_task(_scheduler())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(lifespan=lifespan)

_cors = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/prices")
def get_prices():
    def fetch():
        result = []

        # 1. Arabica (KC=F) – ICE US, cents/lb
        try:
            h = yf.Ticker("KC=F").history(period="5d")
            if not h.empty:
                price = float(h["Close"].iloc[-1])
                prev  = float(h["Close"].iloc[-2]) if len(h) > 1 else price
                change = ((price - prev) / prev) * 100
                result.append({
                    "name": "Arabica Coffee",
                    "symbol": "KC=F",
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "unit": "¢/lb",
                })

                # 2. Robusta — derived from Arabica (no free live ticker).
                #    Historical ratio: Robusta ≈ 62 % of Arabica in ¢/lb.
                robusta_price = round(price * 0.62, 2)
                result.append({
                    "name": "Robusta Coffee",
                    "symbol": "ICE·est",
                    "price": robusta_price,
                    "change": round(change * 0.95, 2),  # similar direction
                    "unit": "¢/lb (est.)",
                })
        except Exception as e:
            print(f"Price error KC=F: {e}")

        # 3. Cocoa (CC=F) and Sugar (SB=F)
        for name, sym, unit in [("Cocoa", "CC=F", "USD/ton"), ("Sugar", "SB=F", "¢/lb")]:
            try:
                h = yf.Ticker(sym).history(period="5d")
                if not h.empty:
                    price = float(h["Close"].iloc[-1])
                    prev  = float(h["Close"].iloc[-2]) if len(h) > 1 else price
                    change = ((price - prev) / prev) * 100
                    result.append({
                        "name": name,
                        "symbol": sym,
                        "price": round(price, 2),
                        "change": round(change, 2),
                        "unit": unit,
                    })
            except Exception as e:
                print(f"Price error {sym}: {e}")

        return result
    return cached("prices", fetch, ttl=300)


@app.get("/api/chart")
def get_chart():
    def fetch():
        h = yf.Ticker("KC=F").history(period="3mo")
        return [
            {"date": date.strftime("%b %d"), "price": round(float(row["Close"]), 2)}
            for date, row in h.iterrows()
        ]
    return cached("chart", fetch, ttl=3600)


# ── Weather ──────────────────────────────────────────────────────────────────

WMO_DESC = {
    0:  ("Clear Sky",      "☀️"),  1:  ("Mainly Clear",  "🌤"),
    2:  ("Partly Cloudy",  "⛅"),  3:  ("Overcast",       "☁️"),
    45: ("Foggy",          "🌫"),  48: ("Icy Fog",        "🌫"),
    51: ("Light Drizzle",  "🌦"),  53: ("Drizzle",        "🌦"),  55: ("Heavy Drizzle", "🌧"),
    61: ("Light Rain",     "🌧"),  63: ("Rain",           "🌧"),  65: ("Heavy Rain",    "🌧"),
    71: ("Light Snow",     "❄️"),  73: ("Snow",           "❄️"),  75: ("Heavy Snow",    "❄️"),
    80: ("Rain Showers",   "🌦"),  81: ("Showers",        "🌧"),  82: ("Heavy Showers", "⛈"),
    95: ("Thunderstorm",   "⛈"),  96: ("Thunderstorm",   "⛈"),  99: ("Thunderstorm",  "⛈"),
}


@app.get("/api/weather")
def get_weather():
    def fetch():
        cities = [
            {"name": "Chikmagalur", "country": "India",    "emoji": "🇮🇳", "lat":  13.3161, "lon":  75.7720},
            {"name": "Coorg",       "country": "India",    "emoji": "🇮🇳", "lat":  12.4244, "lon":  75.7382},
            {"name": "Sao Paulo",   "country": "Brazil",   "emoji": "🇧🇷", "lat": -23.5505, "lon": -46.6333},
            {"name": "Bogota",      "country": "Colombia", "emoji": "🇨🇴", "lat":   4.7110, "lon": -74.0721},
            {"name": "Nairobi",     "country": "Kenya",    "emoji": "🇰🇪", "lat":  -1.2921, "lon":  36.8219},
            {"name": "Addis Ababa", "country": "Ethiopia", "emoji": "🇪🇹", "lat":   9.0320, "lon":  38.7469},
        ]

        def fetch_city(city):
            url = (
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={city['lat']}&longitude={city['lon']}"
                f"&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code"
                f"&wind_speed_unit=kmh"
            )
            r = requests.get(url, timeout=8)
            d = r.json()["current"]
            code = int(d["weather_code"])
            desc, icon = WMO_DESC.get(code, ("Partly Cloudy", "⛅"))
            return {
                "city": city["name"], "country": city["country"], "emoji": city["emoji"],
                "temp_c": round(d["temperature_2m"]),
                "humidity": int(d["relative_humidity_2m"]),
                "desc": desc, "wind_kmph": round(d["wind_speed_10m"]), "icon": icon,
            }

        result = []
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(fetch_city, c): c for c in cities}
            for fut in as_completed(futures, timeout=12):
                try:
                    result.append(fut.result())
                except Exception as e:
                    print(f"Weather error {futures[fut]['name']}: {e}")
        result.sort(key=lambda x: next(i for i, c in enumerate(cities) if c["name"] == x["city"]))
        return result
    return cached("weather", fetch, ttl=1800)


# ── News ─────────────────────────────────────────────────────────────────────

@app.get("/api/news")
def get_news():
    def fetch():
        feeds = [
            "https://perfectdailygrind.com/feed/",
            "https://dailycoffeenews.com/feed/",
        ]
        articles = []
        for url in feeds:
            try:
                r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                f = feedparser.parse(r.content)
                for entry in f.entries[:6]:
                    raw = entry.get("summary", "")
                    clean = re.sub(r"<[^>]+>", "", raw).strip()
                    articles.append({
                        "title":     entry.get("title", ""),
                        "link":      entry.get("link", ""),
                        "summary":   clean[:200],
                        "published": entry.get("published", ""),
                        "source":    f.feed.get("title", "Coffee News"),
                    })
            except Exception as e:
                print(f"News error {url}: {e}")
        return articles[:12]
    return cached("news", fetch, ttl=1800)


# ── Local prices ──────────────────────────────────────────────────────────────

@app.get("/api/local-prices")
def get_local_prices():
    def fetch():
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        # Latest row per (coffee_type, district) — most recent entries first
        cur.execute("""
            SELECT DISTINCT ON (coffee_type, district)
                id, coffee_type, price, district, source, date
            FROM coffee_prices
            ORDER BY coffee_type, district, date DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {"id": r[0], "type": r[1], "price": r[2], "district": r[3], "source": r[4], "date": str(r[5])}
            for r in rows
        ]
    return cached("local_prices", fetch, ttl=30)


@app.get("/prices")
def prices_compat():
    return get_local_prices()
