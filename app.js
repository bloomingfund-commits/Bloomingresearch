// Portfolio dashboard — reads data/live.json and data/history.json
// (both written by scripts/update_data.py, refreshed on schedule by
// .github/workflows/update.yml) and renders the page. No build step,
// no framework — plain fetch + DOM + Chart.js.

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

function renderSummary(summary) {
  document.getElementById("sum-value").textContent = fmtUSD(summary.total_value);
  document.getElementById("sum-cost").textContent = fmtUSD(summary.total_cost);

  const plEl = document.getElementById("sum-pl");
  plEl.textContent = fmtUSD(summary.total_pl);
  plEl.className = "num " + plClass(summary.total_pl);

  const plPctEl = document.getElementById("sum-pl-pct");
  plPctEl.textContent = fmtPct(summary.total_pl_pct);
  plPctEl.className = "num " + plClass(summary.total_pl_pct);

  const updated = summary.updated ? new Date(summary.updated) : null;
  document.getElementById("last-updated").textContent = updated
    ? `Last updated ${updated.toLocaleString()}`
    : "Last updated —";
}

function renderTape(holdings) {
  const track = document.getElementById("tape-track");
  if (!holdings.length) return;

  const item = (h) => {
    const dir = h.pl_pct > 0 ? "tk-up" : h.pl_pct < 0 ? "tk-down" : "tk-flat";
    const arrow = h.pl_pct > 0 ? "▲" : h.pl_pct < 0 ? "▼" : "•";
    const pct = h.pl_pct === null ? "—" : `${arrow} ${Math.abs(h.pl_pct).toFixed(2)}%`;
    return `<span><span class="tk-sym">${h.ticker}</span><span class="${dir}">${pct}</span></span>`;
  };

  // Duplicate the list so the CSS scroll animation (translateX -50%) loops seamlessly.
  const row = holdings.map(item).join("");
  track.innerHTML = row + row;
}

function renderTable(holdings) {
  const body = document.getElementById("holdings-body");
  document.getElementById("position-count").textContent = `${holdings.length} position${holdings.length === 1 ? "" : "s"}`;

  if (!holdings.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">No positions in data/holdings.csv yet.</td></tr>`;
    return;
  }

  const rows = holdings
    .slice()
    .sort((a, b) => (b.market_value ?? -Infinity) - (a.market_value ?? -Infinity))
    .map((h) => `
      <tr>
        <td class="ticker-cell">${h.ticker}</td>
        <td>${h.sector ?? "—"}</td>
        <td>${h.factor ?? "—"}</td>
        <td class="num-col">${h.shares}</td>
        <td class="num-col">${fmtUSD(h.entry_price)}</td>
        <td class="num-col">${fmtUSD(h.current_price)}</td>
        <td class="num-col">${fmtUSD(h.market_value)}</td>
        <td class="num-col ${plClass(h.pl)}">${fmtUSD(h.pl)}</td>
        <td class="num-col ${plClass(h.pl_pct)}">${fmtPct(h.pl_pct)}</td>
        <td class="num-col">${h.weight_pct === null ? "—" : h.weight_pct.toFixed(1) + "%"}</td>
      </tr>
    `)
    .join("");

  body.innerHTML = rows;
}

function renderPerformanceChart(history) {
  const ctx = document.getElementById("performance-chart");
  if (!history.length) return;

  document.getElementById("perf-range").textContent =
    `${history[0].Date} → ${history[history.length - 1].Date}`;

  new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((r) => r.Date),
      datasets: [{
        label: "Portfolio Value",
        data: history.map((r) => r.TotalValue),
        borderColor: "#D4A24C",
        backgroundColor: "rgba(212, 162, 76, 0.08)",
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#232838" }, ticks: { color: "#8B93A7", maxTicksLimit: 8 } },
        y: {
          grid: { color: "#232838" },
          ticks: { color: "#8B93A7", callback: (v) => fmtUSD(v) },
        },
      },
    },
  });
}

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

async function init() {
  try {
    const [live, history] = await Promise.all([
      loadJSON("data/live.json"),
      loadJSON("data/history.json").catch(() => []),  // fine if it doesn't exist yet
    ]);

    renderSummary(live.summary);
    renderTape(live.holdings);
    renderTable(live.holdings);
    renderPerformanceChart(history);
    renderDonut("sector-chart", live.sector_breakdown || []);
    renderDonut("factor-chart", live.factor_breakdown || []);
  } catch (err) {
    console.error(err);
    document.getElementById("holdings-body").innerHTML =
      `<tr><td colspan="10" class="empty-state">Couldn't load data/live.json yet — run scripts/update_data.py once, or wait for the first GitHub Action run.</td></tr>`;
  }
}

init();
