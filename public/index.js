const { API_BASE, SYNC_KEY } = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

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

async function checkFound(wa) {
  const url = `${API_BASE}/kv/get?wa=${encodeURIComponent(wa)}`;
  const res = await fetch(url, { headers: { "X-Sync-Key": SYNC_KEY } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return !!data?.found;
}

$("btnMasuk").addEventListener("click", async () => {
  const wa = normWA($("nomor").value);

  if (!wa) return setStatus("Nomor tidak valid. Harus mulai 08 dan minimal 9 digit.", true);
  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") return setStatus("SYNC_KEY belum diisi di config.js", true);

  $("btnMasuk").disabled = true;
  setStatus("Mengecek data...");

  try {
    const found = await checkFound(wa);
    if (!found) return setStatus("Data tidak ditemukan di KV untuk nomor ini.", true);

    // redirect ke halaman detail
    location.href = `detail-data.html?wa=${encodeURIComponent(wa)}`;
  } catch (e) {
    setStatus(`Error: ${String(e.message || e)}`, true);
  } finally {
    $("btnMasuk").disabled = false;
  }
});

$("nomor").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnMasuk").click();
});
