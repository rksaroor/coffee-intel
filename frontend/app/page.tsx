"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Price   = { name: string; symbol: string; price: number; change: number; unit: string };
type ChartPt = { date: string; price: number };
type Weather = { city: string; country: string; emoji: string; temp_c: number; humidity: number; desc: string; wind_kmph: number; icon: string };
type News    = { title: string; link: string; summary: string; published: string; source: string };
type Local   = { id: number; type: string; price: number; district: string; source: string; date: string };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1c1409", border: "1px solid #3d2a15", padding: "8px 14px", borderRadius: 8 }}>
      <div style={{ color: "#7a6555", fontSize: 12, marginBottom: 3 }}>{label}</div>
      <div style={{ color: "#c8860a", fontWeight: 700, fontSize: 16 }}>{payload[0].value}¢</div>
      <div style={{ color: "#5a4030", fontSize: 11 }}>per lb</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#140e08", border: "1px solid #2d1a0a", borderRadius: 16, padding: 20,
};
const innerCard: React.CSSProperties = {
  background: "#1a1208", border: "1px solid #2d1a0a", borderRadius: 12, padding: "13px 15px",
};
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 3 };
const sectionSub: React.CSSProperties   = { fontSize: 12, color: "#7a6555", marginBottom: 14 };

export default function Dashboard() {
  const [prices,  setPrices]  = useState<Price[]>([]);
  const [chart,   setChart]   = useState<ChartPt[]>([]);
  const [weather, setWeather] = useState<Weather[]>([]);
  const [news,    setNews]    = useState<News[]>([]);
  const [local,   setLocal]   = useState<Local[]>([]);
  const [updated, setUpdated] = useState("");
  const [status,  setStatus]  = useState<"loading" | "ok" | "error">("loading");

  const fetchAll = useCallback(async () => {
    try {
      const [p, c, w, n, l] = await Promise.allSettled([
        fetch(`${API}/api/prices`).then(r => r.json()),
        fetch(`${API}/api/chart`).then(r => r.json()),
        fetch(`${API}/api/weather`).then(r => r.json()),
        fetch(`${API}/api/news`).then(r => r.json()),
        fetch(`${API}/api/local-prices`).then(r => r.json()),
      ]);
      if (p.status === "fulfilled") setPrices(p.value);
      if (c.status === "fulfilled") setChart(c.value);
      if (w.status === "fulfilled") setWeather(w.value);
      if (n.status === "fulfilled") setNews(n.value);
      if (l.status === "fulfilled") setLocal(l.value);
      setUpdated(new Date().toLocaleTimeString());
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchAll]);

  return (
    <div style={{ background: "#0d0905", minHeight: "100vh", color: "#f0e6d3" }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: "1px solid #2d1a0a", background: "#0a0704", position: "sticky", top: 0, zIndex: 10 }}>
        <div className="header-inner">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 21 }}>☕</span>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "#c8860a", letterSpacing: -0.5 }}>
                Coffee Intelligence
              </h1>
            </div>
            <p style={{ fontSize: 11, color: "#5a4030", marginTop: 2, marginLeft: 30 }}>
              Karnataka & Global Coffee Market
            </p>
          </div>
          <div className="header-controls">
            {updated && (
              <span style={{ fontSize: 12, color: "#5a4030", whiteSpace: "nowrap" }}>
                Updated {updated}
              </span>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#1c1409", border: "1px solid #2d1a0a",
              borderRadius: 20, padding: "5px 12px", whiteSpace: "nowrap",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                background: status === "ok" ? "#4ade80" : status === "loading" ? "#c8860a" : "#f87171",
              }} />
              <span style={{ fontSize: 12, color: "#7a6555" }}>
                {status === "ok" ? "Live" : status === "loading" ? "Loading…" : "Error"}
              </span>
            </div>
            <button
              onClick={fetchAll}
              style={{
                background: "#c8860a", color: "#0d0905", border: "none",
                borderRadius: 8, padding: "7px 14px", fontSize: 13,
                fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ── Price Ticker ── */}
      {prices.length > 0 && (
        <div style={{ background: "#0a0704", borderBottom: "1px solid #2d1a0a" }}>
          <div className="ticker-bar">
            {prices.map(p => (
              <div key={p.symbol} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                <span style={{ color: "#5a4030", fontSize: 12, fontWeight: 600 }}>{p.name}</span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{p.price}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.change >= 0 ? "#4ade80" : "#f87171" }}>
                  {p.change >= 0 ? "▲" : "▼"} {Math.abs(p.change).toFixed(2)}%
                </span>
                <span style={{ color: "#3d2a15", fontSize: 11 }}>{p.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="dash-container">

        {/* Row 1: Chart + Commodity cards */}
        <div className="row-chart">

          {/* Chart */}
          <div style={card}>
            <p style={sectionTitle}>Arabica Coffee — 3 Month Price</p>
            <p style={sectionSub}>KC=F · ICE Futures · ¢/lb</p>
            <div className="chart-wrap">
              {chart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1409" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#5a4030", fontSize: 10 }}
                      tickLine={false} axisLine={false}
                      interval={Math.floor(chart.length / 6)}
                    />
                    <YAxis
                      tick={{ fill: "#5a4030", fontSize: 10 }}
                      tickLine={false} axisLine={false}
                      domain={["auto", "auto"]} width={36}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone" dataKey="price"
                      stroke="#c8860a" strokeWidth={2.5} dot={false}
                      activeDot={{ r: 5, fill: "#c8860a", stroke: "#0d0905", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#5a4030" }}>
                  Fetching market data…
                </div>
              )}
            </div>
          </div>

          {/* Commodity cards */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#5a4030", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Global Commodities
            </p>
            <div className="commodity-list">
              {prices.length === 0 ? (
                <p style={{ color: "#5a4030" }}>Loading…</p>
              ) : prices.map(p => (
                <div key={p.symbol} style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#5a4030", marginTop: 2 }}>{p.symbol} · {p.unit}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 19, fontWeight: 800 }}>{p.price}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: p.change >= 0 ? "#4ade80" : "#f87171" }}>
                        {p.change >= 0 ? "▲" : "▼"} {Math.abs(p.change).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: "#2d1a0a", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: p.change >= 0 ? "#4ade80" : "#f87171",
                      borderRadius: 2, minWidth: 4,
                      width: `${Math.min(Math.abs(p.change) * 20, 100)}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Weather + News */}
        <div className="row-weather-news">

          {/* Weather */}
          <div style={card}>
            <p style={sectionTitle}>Weather — Coffee Regions</p>
            <p style={sectionSub}>Real-time conditions at major growing areas</p>
            <div className="weather-grid">
              {weather.length === 0 ? (
                <p style={{ color: "#5a4030", gridColumn: "1/-1" }}>Fetching weather…</p>
              ) : weather.map(w => (
                <div key={w.city} style={innerCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{w.emoji} {w.city}</div>
                      <div style={{ fontSize: 10, color: "#5a4030" }}>{w.country}</div>
                    </div>
                    <span style={{ fontSize: 20 }}>{w.icon}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#c8860a" }}>{w.temp_c}°C</div>
                  <div style={{ fontSize: 11, color: "#7a6555", marginTop: 3 }}>{w.desc}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#5a4030" }}>💧 {w.humidity}%</span>
                    <span style={{ fontSize: 10, color: "#5a4030" }}>🌬 {w.wind_kmph} km/h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div style={{ ...card, display: "flex", flexDirection: "column" }}>
            <p style={sectionTitle}>Coffee News</p>
            <p style={sectionSub}>Latest from the global industry</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 420 }}>
              {news.length === 0 ? (
                <p style={{ color: "#5a4030" }}>Fetching news…</p>
              ) : news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer">
                  <div
                    style={{ ...innerCard, transition: "border-color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#5a3f22")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d1a0a")}
                  >
                    <div style={{ fontSize: 11, color: "#c8860a", fontWeight: 600, marginBottom: 4 }}>{n.source}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f0e6d3", lineHeight: 1.4, marginBottom: 5 }}>{n.title}</div>
                    {n.summary && (
                      <div style={{ fontSize: 12, color: "#7a6555", lineHeight: 1.5 }}>
                        {n.summary.slice(0, 130)}{n.summary.length > 130 ? "…" : ""}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Karnataka Local Prices */}
        <div style={card}>
          <p style={sectionTitle}>Karnataka Local Prices</p>
          <p style={sectionSub}>Auto-calculated from ICE Arabica · updates every 6 hours</p>
          {local.length === 0 ? (
            <p style={{ color: "#5a4030" }}>Loading…</p>
          ) : (
            <div className="table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2d1a0a" }}>
                    {["Type", "₹/kg", "District", "Source", "Updated"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "8px 12px",
                        fontSize: 11, color: "#5a4030",
                        textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {local.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #1a1208" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.type}</td>
                      <td style={{ padding: "10px 12px", color: "#c8860a", fontWeight: 800, fontSize: 15 }}>₹{r.price}</td>
                      <td style={{ padding: "10px 12px" }}>{r.district}</td>
                      <td style={{ padding: "10px 12px", color: "#7a6555", fontSize: 12 }}>{r.source}</td>
                      <td style={{ padding: "10px 12px", color: "#5a4030", fontSize: 11 }}>
                        {new Date(r.date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: "#3d2010", fontSize: 12 }}>
          Auto-refreshes every 5 min · ICE Futures · Open-Meteo · Perfect Daily Grind · Daily Coffee News
        </div>
      </div>
    </div>
  );
}
