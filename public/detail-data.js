const { API_BASE, SYNC_KEY } = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name) || "";
}

function normWA(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits.startsWith("08")) return "";
  if (digits.length < 9) return "";
  return digits;
}

function setStatus(msg, isErr=false) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (isErr ? " err" : "");
}

function formatIDR(n) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toDateMs(any) {
  if (any === null || any === undefined || any === "") return NaN;
  if (typeof any === "number") return any < 1e12 ? any * 1000 : any;

  const s = String(any).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const monStr = m[2].toLowerCase();
    const year = Number(m[3]);
    const map = {
      jan:0, januari:0, feb:1, februari:1, mar:2, maret:2, apr:3, april:3,
      mei:4, jun:5, juni:5, jul:6, juli:6, agu:7, agustus:7, sep:8, september:8,
      okt:9, oktober:9, nov:10, november:10, des:11, desember:11
    };
    const mon = map[monStr];
    if (mon !== undefined) return new Date(year, mon, day).getTime();
  }
  return NaN;
}

function dateLabelFromMs(ms){
  if (!isFinite(ms)) return "-";
  return new Date(ms).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
}

function mapTx(tx) {
  const amount = Number(pick(tx, ["amount", "nominal", "nilai"], NaN));
  const typeRaw = String(pick(tx, ["type", "jenis", "kategori"], "")).toLowerCase();
  const note = String(pick(tx, ["note", "keterangan", "nama", "by", "from"], "") || "").trim();

  const dateVal = pick(tx, ["ts", "time", "createdAt", "date", "tanggal"], "");
  const ms = toDateMs(dateVal);

  const isTerima = ["terima", "bayar", "payment", "kredit", "masuk"].includes(typeRaw);
  const isBerikan = ["berikan", "hutang", "debit", "keluar", "pinjam"].includes(typeRaw);

  return {
    ms,
    dateText: isFinite(ms) ? dateLabelFromMs(ms) : "-",
    note,
    terima: isTerima ? amount : null,
    berikan: isBerikan ? amount : null,
    unknownAmount: (!isTerima && !isBerikan) ? amount : null
  };
}

function setTotalSimple(totalTerima, totalBerikan){
  const saldo = totalTerima - totalBerikan; // + kelebihan bayar, - masih hutang
  const totalEl = $("totalHutang");
  const overpayBox = $("overpayBox");
  const overpayAmount = $("overpayAmount");

  overpayBox.style.display = "none";
  totalEl.className = "amount";

  if (saldo < 0) {
    totalEl.textContent = formatIDR(Math.abs(saldo));
    totalEl.classList.add("red");
  } else if (saldo === 0) {
    totalEl.textContent = formatIDR(0);
    totalEl.classList.add("white");
  } else {
    totalEl.textContent = formatIDR(0);
    totalEl.classList.add("white");
    overpayBox.style.display = "block";
    overpayAmount.textContent = formatIDR(saldo);
  }
}

function renderRows(rows){
  const tbody = $("tbody");
  tbody.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">Belum ada transaksi.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const terimaVal = r.terima ?? null;
    const berikanVal = r.berikan ?? null;

    const fallbackBerikan =
      (terimaVal === null && berikanVal === null && typeof r.unknownAmount === "number" && isFinite(r.unknownAmount))
        ? r.unknownAmount
        : null;

    const terimaText = (typeof terimaVal === "number" && isFinite(terimaVal)) ? formatIDR(terimaVal) : "-";
    const berikanText = (typeof berikanVal === "number" && isFinite(berikanVal)) ? formatIDR(berikanVal)
                      : (typeof fallbackBerikan === "number" && isFinite(fallbackBerikan)) ? formatIDR(fallbackBerikan)
                      : "-";

    const terimaClass = (terimaText !== "-") ? "amt green" : "amt muted";
    const berikanClass = (berikanText !== "-") ? "amt red" : "amt muted";

    const hasNote = !!(r.note && r.note.trim());

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="dateMain">${escapeHtml(r.dateText)}</div>
        <div class="dateSub ${hasNote ? "" : "empty"}">${hasNote ? escapeHtml(r.note) : ""}</div>
      </td>
      <td><span class="${terimaClass}">${escapeHtml(terimaText)}</span></td>
      <td><span class="${berikanClass}">${escapeHtml(berikanText)}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

async function fetchKVGet(wa) {
  const url = `${API_BASE}/kv/get?wa=${encodeURIComponent(wa)}`;
  const res = await fetch(url, { headers: { "X-Sync-Key": SYNC_KEY } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data;
}

$("btnBack").addEventListener("click", () => history.back());

(async () => {
  const wa = normWA(getParam("wa"));

  if (!wa) {
    $("tbody").innerHTML = `<tr><td colspan="3" class="empty">Nomor tidak valid.</td></tr>`;
    return setStatus("Nomor tidak valid (parameter ?wa=08xxxx).", true);
  }
  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") {
    $("tbody").innerHTML = `<tr><td colspan="3" class="empty">SYNC_KEY belum diisi.</td></tr>`;
    return setStatus("SYNC_KEY belum diisi di config.js", true);
  }

  $("subHeader").textContent = wa;
  $("avatar").textContent = wa.slice(0, 1);

  setStatus("Memuat data...");

  try {
    const resp = await fetchKVGet(wa);
    if (!resp?.success) throw new Error("Gagal mengambil data.");
    if (!resp.found) throw new Error("Data tidak ditemukan di KV.");

    const obj = resp.value || {};
    const nama = pick(obj, ["nama", "name", "username"], "") || wa;

    $("namaHeader").textContent = nama;
    $("avatar").textContent = String(nama).trim().slice(0, 1).toUpperCase() || "?";

    const list = Array.isArray(obj.transactions) ? obj.transactions : [];
    const mapped = list.map(mapTx);

    mapped.sort((a,b) => {
      const am = isFinite(a.ms) ? a.ms : -Infinity;
      const bm = isFinite(b.ms) ? b.ms : -Infinity;
      return bm - am;
    });

    let totalTerima = 0;
    let totalBerikan = 0;

    for (const r of mapped) {
      if (typeof r.terima === "number" && isFinite(r.terima)) totalTerima += r.terima;
      if (typeof r.berikan === "number" && isFinite(r.berikan)) totalBerikan += r.berikan;
      if (r.terima == null && r.berikan == null && typeof r.unknownAmount === "number" && isFinite(r.unknownAmount)) {
        totalBerikan += r.unknownAmount;
      }
    }

    setTotalSimple(totalTerima, totalBerikan);
    renderRows(mapped);
    setStatus("OK");
  } catch (e) {
    $("tbody").innerHTML = `<tr><td colspan="3" class="empty">Gagal memuat data.</td></tr>`;
    setStatus(`Error: ${String(e.message || e)}`, true);
  }
})();
