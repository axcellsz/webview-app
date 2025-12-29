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
  // Tanpa desimal seperti screenshot
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

function parseDateToLabel(any) {
  // mendukung timestamp (ms / s) atau string tanggal
  if (!any) return { main: "-", sub: "" };

  let d = null;

  if (typeof any === "number") {
    // kalau detik (10 digit) ubah ke ms
    d = new Date(any < 1e12 ? any * 1000 : any);
  } else {
    const s = String(any);
    // coba parse
    const tryD = new Date(s);
    if (!isNaN(tryD.getTime())) d = tryD;
  }

  if (!d || isNaN(d.getTime())) return { main: "-", sub: "" };

  const main = d.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
  return { main, sub: "" };
}

function mapTx(tx) {
  // Normalisasi dari berbagai kemungkinan nama field
  const amount = Number(pick(tx, ["amount", "nominal", "nilai"], NaN));
  const typeRaw = String(pick(tx, ["type", "jenis", "kategori"], "")).toLowerCase();

  // tentukan kolom terima/berikan
  // terima = uang masuk (pembayaran), berikan = uang keluar (ngasih)
  // kamu bisa sesuaikan mapping type di sini
  const isTerima = ["terima", "bayar", "payment", "kredit", "masuk"].includes(typeRaw);
  const isBerikan = ["berikan", "hutang", "debit", "keluar", "pinjam"].includes(typeRaw);

  const dateVal = pick(tx, ["date", "tanggal", "createdAt", "time", "ts"], "");
  const who = pick(tx, ["nama", "note", "keterangan", "by", "from"], "");

  return {
    dateLabel: parseDateToLabel(dateVal),
    who,
    terima: isTerima ? amount : null,
    berikan: isBerikan ? amount : null,
    // fallback: kalau type tidak dikenali, anggap "berikan" (lebih aman untuk hutang)
    unknownAmount: (!isTerima && !isBerikan) ? amount : null
  };
}

function renderRows(txs) {
  const tbody = $("tbody");
  tbody.innerHTML = "";

  if (!Array.isArray(txs) || txs.length === 0) {
    tbody.innerHTML = `<div class="empty">Belum ada transaksi.</div>`;
    return;
  }

  for (const row of txs) {
    const terimaVal = row.terima ?? null;
    const berikanVal = row.berikan ?? null;

    // fallback kalau type tidak dikenali: masukin ke berikan
    const fallbackBerikan = (terimaVal === null && berikanVal === null && typeof row.unknownAmount === "number")
      ? row.unknownAmount
      : null;

    const terimaText = (typeof terimaVal === "number" && isFinite(terimaVal)) ? formatIDR(terimaVal) : "-";
    const berikanText = (typeof berikanVal === "number" && isFinite(berikanVal)) ? formatIDR(berikanVal) :
                        (typeof fallbackBerikan === "number" && isFinite(fallbackBerikan)) ? formatIDR(fallbackBerikan) : "-";

    const terimaClass = (terimaText !== "-") ? "amt green" : "amt muted";
    const berikanClass = (berikanText !== "-") ? "amt red" : "amt muted";

    const dateSub = row.who ? `<div class="dateSub">${escapeHtml(row.who)}</div>` : "";

    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `
      <div class="td">
        <div class="dateMain">${escapeHtml(row.dateLabel.main)}</div>
        ${dateSub}
      </div>
      <div class="td ${terimaClass}">${escapeHtml(terimaText)}</div>
      <div class="td ${berikanClass}">${escapeHtml(berikanText)}</div>
    `;
    tbody.appendChild(el);
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
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
  if (!wa) return setStatus("Nomor tidak valid (parameter ?wa=08xxxx).", true);
  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") return setStatus("SYNC_KEY belum diisi di config.js", true);

  $("subHeader").textContent = wa;
  $("avatar").textContent = wa.slice(0,1) || "?";

  setStatus("Memuat data...");

  try {
    const resp = await fetchKVGet(wa);
    if (!resp?.success) throw new Error("Gagal mengambil data.");
    if (!resp.found) throw new Error("Data tidak ditemukan di KV.");

    const obj = resp.value || {};
    const nama = pick(obj, ["nama", "name", "username"], "") || wa;
    $("namaHeader").textContent = nama;
    $("avatar").textContent = String(nama).trim().slice(0,1).toUpperCase() || "?"

    // transaksi
    const list = Array.isArray(obj.transactions) ? obj.transactions : [];

    // mapping + urutkan terbaru dulu (kalau ada timestamp/date)
    const mapped = list.map(mapTx);

    // sort: coba pakai date jika bisa
    mapped.sort((a,b) => {
      // karena label sudah jadi string, kita butuh sort dari data asli -> ambil lagi dari tx? (tidak ada)
      // Jadi aman: tidak sort agresif. Kamu bisa tambah field "ts" di KV biar akurat.
      return 0;
    });

    // hitung total
    let totalTerima = 0;
    let totalBerikan = 0;

    for (const r of mapped) {
      if (typeof r.terima === "number" && isFinite(r.terima)) totalTerima += r.terima;
      if (typeof r.berikan === "number" && isFinite(r.berikan)) totalBerikan += r.berikan;
      if (r.terima == null && r.berikan == null && typeof r.unknownAmount === "number" && isFinite(r.unknownAmount)) {
        totalBerikan += r.unknownAmount; // fallback
      }
    }

    $("sumTerima").textContent = formatIDR(totalTerima);
    $("sumBerikan").textContent = formatIDR(totalBerikan);
    $("sumSaldo").textContent = formatIDR(totalTerima - totalBerikan);

    renderRows(mapped);
    setStatus("OK");
  } catch (e) {
    $("tbody").innerHTML = `<div class="empty">Gagal memuat data.</div>`;
    setStatus(`Error: ${String(e.message || e)}`, true);
  }
})();
