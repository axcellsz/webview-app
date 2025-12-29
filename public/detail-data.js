const { API_BASE, SYNC_KEY } = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

// state (biar modal bisa ambil data)
let STATE_USER = { nama: "", wa: "" };
let STATE_ROWS = []; // array mapped rows (dengan raw tx)

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

function pad2(n){ return String(n).padStart(2,"0"); }

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

function dateTimeLabel(ms){
  if (!isFinite(ms)) return "-";
  const d = new Date(ms);
  const tanggal = d.toLocaleDateString("id-ID", { day:"2-digit", month:"long", year:"numeric" });
  const jam = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${tanggal} Jam ${jam}`;
}

function mapTx(tx) {
  const amount = Number(pick(tx, ["amount", "nominal", "nilai"], NaN));
  const typeRaw = String(pick(tx, ["type", "jenis", "kategori"], "")).toLowerCase();

  const note = String(pick(tx, ["note", "keterangan", "nama", "by", "from"], "") || "").trim();

  const dateVal = pick(tx, ["ts", "time", "createdAt", "date", "tanggal"], "");
  const ms = toDateMs(dateVal);

  const isTerima = ["terima", "bayar", "payment", "kredit", "masuk"].includes(typeRaw);
  const isBerikan = ["berikan", "hutang", "debit", "keluar", "pinjam"].includes(typeRaw);

  // kalau type tidak jelas, treat sebagai berikan
  const finalTerima = isTerima ? amount : null;
  const finalBerikan = isBerikan ? amount : null;
  const fallbackBerikan = (!isTerima && !isBerikan && isFinite(amount)) ? amount : null;

  const kind = (finalTerima != null) ? "terima" : "berikan";

  return {
    ms,
    dateText: isFinite(ms) ? dateLabelFromMs(ms) : "-",
    note,
    terima: finalTerima,
    berikan: finalBerikan,
    fallbackBerikan,
    kind,
    amount: (finalTerima != null) ? finalTerima : (finalBerikan != null ? finalBerikan : fallbackBerikan),
    raw: tx
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

/* ===== Modal logic ===== */
function openModalByIndex(idx){
  const r = STATE_ROWS[idx];
  if (!r) return;

  // tanggal + jam (kalau ada)
  $("mTanggal").textContent = dateTimeLabel(r.ms);

  // jenis
  const isTerima = (r.kind === "terima");
  const badge = $("mJenis");
  badge.className = "badge " + (isTerima ? "green" : "red");
  badge.textContent = isTerima ? "Hutang Dibayar / Diterima" : "Hutang Diberikan";

  // nominal
  $("mNominal").textContent = formatIDR(Number(r.amount) || 0);

  // detail transaksi: ambil dari note/keterangan kalau ada
  const detail =
    String(pick(r.raw || {}, ["detail", "keterangan", "note", "desc", "description"], "") || r.note || "").trim();
  $("mDetail").textContent = detail || "-";

  // penerima hutang (ambil dari user utama)
  $("mNama").textContent = STATE_USER.nama || "-";
  $("mWa").textContent = STATE_USER.wa || "-";

  $("modalOverlay").classList.add("show");
}

function closeModal(){
  $("modalOverlay").classList.remove("show");
}

function renderRows(rows){
  const tbody = $("tbody");
  tbody.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="emptyRow">Belum ada transaksi.</td></tr>`;
    return;
  }

  STATE_ROWS = rows;

  rows.forEach((r, idx) => {
    const terimaText = (typeof r.terima === "number" && isFinite(r.terima)) ? formatIDR(r.terima) : "-";

    const berikanVal =
      (typeof r.berikan === "number" && isFinite(r.berikan)) ? r.berikan
      : (typeof r.fallbackBerikan === "number" && isFinite(r.fallbackBerikan)) ? r.fallbackBerikan
      : null;

    const berikanText = (typeof berikanVal === "number") ? formatIDR(berikanVal) : "-";

    const terimaClass = (terimaText !== "-") ? "amt green" : "amt muted";
    const berikanClass = (berikanText !== "-") ? "amt red" : "amt muted";

    const hasNote = !!(r.note && r.note.trim());
    const noteHtml = hasNote ? escapeHtml(r.note) : "";
    const noteClass = hasNote ? "note" : "note empty";

    const tr = document.createElement("tr");
    tr.dataset.idx = String(idx);
    tr.innerHTML = `
      <td>
        <div class="dateMain">${escapeHtml(r.dateText)}</div>
        <div class="${noteClass}">${noteHtml}</div>
      </td>
      <td><span class="${terimaClass}">${escapeHtml(terimaText)}</span></td>
      <td><span class="${berikanClass}">${escapeHtml(berikanText)}</span></td>
    `;

    tr.addEventListener("click", () => openModalByIndex(idx));
    tbody.appendChild(tr);
  });
}

async function fetchKVGet(wa) {
  const base = (API_BASE && API_BASE.trim()) ? API_BASE.trim().replace(/\/$/, "") : "";
  const url = `${base}/kv/get?wa=${encodeURIComponent(wa)}`;

  const res = await fetch(url, { headers: { "X-Sync-Key": SYNC_KEY } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data;
}

/* ===== events ===== */
$("btnBack").addEventListener("click", () => history.back());

$("btnCloseModal").addEventListener("click", closeModal);
$("modalOverlay").addEventListener("click", (e) => {
  if (e.target === $("modalOverlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ===== init ===== */
(async () => {
  const wa = normWA(getParam("wa"));

  if (!wa) {
    $("tbody").innerHTML = `<tr><td colspan="3" class="emptyRow">Nomor tidak valid.</td></tr>`;
    return setStatus("Nomor tidak valid (parameter ?wa=08xxxx).", true);
  }
  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") {
    $("tbody").innerHTML = `<tr><td colspan="3" class="emptyRow">SYNC_KEY belum diisi.</td></tr>`;
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

    STATE_USER = { nama, wa };

    const list = Array.isArray(obj.transactions) ? obj.transactions : [];
    const mapped = list.map(mapTx);

    // sort terbaru dulu
    mapped.sort((a,b) => {
      const am = isFinite(a.ms) ? a.ms : -Infinity;
      const bm = isFinite(b.ms) ? b.ms : -Infinity;
      return bm - am;
    });

    let totalTerima = 0;
    let totalBerikan = 0;

    for (const r of mapped) {
      if (typeof r.terima === "number" && isFinite(r.terima)) totalTerima += r.terima;
      const b = (typeof r.berikan === "number" && isFinite(r.berikan)) ? r.berikan
              : (typeof r.fallbackBerikan === "number" && isFinite(r.fallbackBerikan)) ? r.fallbackBerikan
              : 0;
      totalBerikan += b;
    }

    setTotalSimple(totalTerima, totalBerikan);
    renderRows(mapped);

    setStatus("OK");
  } catch (e) {
    $("tbody").innerHTML = `<tr><td colspan="3" class="emptyRow">Gagal memuat data.</td></tr>`;
    setStatus(`Error: ${String(e.message || e)}`, true);
  }
})();
