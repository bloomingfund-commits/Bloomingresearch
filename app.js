// Closed-positions dashboard — reads data/live.json (written by
// scripts/update_data.py, rebuilt automatically by
// .github/workflows/update.yml whenever you push a trade or note change).

const CHART_COLORS = ["#D4A24C", "#3FBF7F", "#5B8DEF", "#E2574C", "#9B7FE0", "#4FB8C4", "#C97BB0", "#8B93A7"];

function fmtUSD(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function plClass(n) {
  if (n === null || n === undefined) return "";
  return n >= 0 ? "pl-pos" : "pl-neg";
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// ---------- Equity curve ----------
function renderEquityChart(curve, summary) {
  const ctx = document.getElementById("equity-chart");
  if (!curve.length) return;

  const finalPct = curve[curve.length - 1].equity_pct;
  const tradeCount = summary.total_trades ?? curve.length - 1;
  const winRate = summary.win_rate;
  document.getElementById("equity-eyebrow").textContent =
    `${tradeCount} trades` + (winRate !== null && winRate !== undefined ? ` · ${winRate}% win rate` : "") +
    ` · ${fmtPct(finalPct)} cumulative`;

  new Chart(ctx, {
    type: "line",
    data: {
      labels: curve.map((p) => p.trade_num),
      datasets: [{
        label: "Cumulative Return",
        data: curve.map((p) => p.equity_pct),
        borderColor: "#D4A24C",
        backgroundColor: "rgba(212, 162, 76, 0.08)",
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: "Trade #", color: "#8B93A7" },
          grid: { color: "#232838" },
          ticks: { color: "#8B93A7" },
        },
        y: {
          title: { display: true, text: "Cumulative Return (%)", color: "#8B93A7" },
          grid: { color: "#232838" },
          ticks: { color: "#8B93A7", callback: (v) => `${v}%` },
        },
      },
    },
  });
}

// ---------- Closed positions table ----------
function renderPositionsTable(trades) {
  const body = document.getElementById("positions-body");

  if (!trades.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">No closed positions in data/closed_positions.csv yet.</td></tr>`;
    return;
  }

  const rowsHtml = trades
    .slice()
    .sort((a, b) => new Date(b.close_date) - new Date(a.close_date))
    .map((t) => `
      <tr data-ticker="${t.ticker}">
        <td class="ticker-cell">${t.ticker}</td>
        <td>${t.sector ?? "—"}</td>
        <td>${t.theme ?? "—"}</td>
        <td><span class="status-badge">${t.status}</span></td>
        <td class="num-col">${t.shares}</td>
        <td>${t.entry_date}</td>
        <td class="num-col">${fmtUSD(t.entry_price)}</td>
        <td>${t.close_date}</td>
        <td class="num-col">${fmtUSD(t.close_price)}</td>
        <td class="num-col ${plClass(t.pl_pct)}">${fmtPct(t.pl_pct)}</td>
      </tr>
    `)
    .join("");

  body.innerHTML = rowsHtml;

  document.getElementById("position-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toUpperCase();
    document.querySelectorAll("#positions-body tr[data-ticker]").forEach((row) => {
      row.classList.toggle("is-hidden", q && !row.dataset.ticker.includes(q));
    });
  });
}

// ---------- Distribution pies ----------
function renderDonut(canvasId, breakdown) {
  const ctx = document.getElementById(canvasId);
  if (!breakdown.length) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: breakdown.map((b) => `${b.label} (${b.pct.toFixed(1)}%)`),
      datasets: [{
        data: breakdown.map((b) => b.value),
        backgroundColor: breakdown.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderColor: "#12161F",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#8B93A7", boxWidth: 10, font: { size: 11 } },
        },
      },
    },
  });
}

// ---------- Research notes ----------
function renderNotes(notes) {
  const container = document.getElementById("notes-scroll");

  if (!notes.length) {
    container.innerHTML = `<p class="empty-state">No research notes in notes/ yet.</p>`;
    return;
  }

  container.innerHTML = notes
    .map((n) => `
      <article class="note-card" data-ticker="${n.ticker}">
        <div class="note-meta">
          <span class="note-ticker">${n.ticker || "—"}</span>
          <span class="note-date">${n.date || ""}</span>
        </div>
        <h3 class="note-title">${n.title}</h3>
        <div class="note-body">${n.html}</div>
      </article>
    `)
    .join("");

  document.getElementById("notes-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toUpperCase();
    document.querySelectorAll("#notes-scroll .note-card").forEach((card) => {
      card.classList.toggle("is-hidden", q && !card.dataset.ticker.includes(q));
    });
  });
}

async function init() {
  try {
    const live = await loadJSON("data/live.json");

    const updated = live.updated ? new Date(live.updated) : null;
    document.getElementById("last-updated").textContent = updated
      ? `Last updated ${updated.toLocaleString()}`
      : "";

    renderEquityChart(live.equity_curve || [], live.summary || {});
    renderPositionsTable(live.trades || []);
    renderDonut("sector-chart", live.sector_breakdown || []);
    renderDonut("theme-chart", live.theme_breakdown || []);
    renderNotes(live.notes || []);
  } catch (err) {
    console.error(err);
    document.getElementById("positions-body").innerHTML =
      `<tr><td colspan="10" class="empty-state">Couldn't load data/live.json yet — run scripts/update_data.py once, or push a change to trigger the GitHub Action.</td></tr>`;
  }
}

init();
