/**
 * SISTEMA DE FILTRO RUC - CARTAS INDUCTIVAS | SUNAFIL
 * Procesamiento 100% en navegador con base maestra estática del repositorio.
 */

const MASTER_META_URL = "./data/base_meta.json";

const dropzone = document.getElementById("dropzone");
const archivoInput = document.getElementById("archivo");
const dropzonePrompt = document.getElementById("dropzonePrompt");
const selectedFileCard = document.getElementById("selectedFileCard");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const btnRemoveFile = document.getElementById("btnRemoveFile");

const botonProcesar = document.getElementById("procesar");
const processingState = document.getElementById("processingState");
const processingSubtitle = document.getElementById("processingSubtitle");
const alertBox = document.getElementById("alertBox");
const alertMessage = document.getElementById("alertMessage");

const resultsPanel = document.getElementById("resultsPanel");
const kpiTotal = document.getElementById("kpiTotal");
const kpiMantenidos = document.getElementById("kpiMantenidos");
const kpiRetirados = document.getElementById("kpiRetirados");
const btnReDownload = document.getElementById("btnReDownload");
const btnReset = document.getElementById("btnReset");

const serverBadge = document.getElementById("serverBadge");
const serverStatusText = document.getElementById("serverStatusText");
const criteriaBox = document.getElementById("criteriaBox");
const criteriaToggle = document.getElementById("criteriaToggle");

let archivoSeleccionado = null;
let ultimoBlobDescarga = null;
let intervaloMensajes = null;
let maestroListo = false;
let totalesMaestro = new Map();

function normalizarRuc(valor) {
  let s = String(valor ?? "").trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

function actualizarBoton() {
  botonProcesar.disabled = !archivoSeleccionado || !maestroListo;
}

function base64ABytes(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function descomprimirGzip(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no admite la base comprimida. Usa Chrome o Edge actualizado.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function leerVarint(bytes, estado) {
  let valor = 0;
  let multiplicador = 1;

  while (estado.pos < bytes.length) {
    const b = bytes[estado.pos++];
    valor += (b & 0x7f) * multiplicador;
    if ((b & 0x80) === 0) return valor;
    multiplicador *= 128;
  }

  throw new Error("La base maestra está incompleta.");
}

async function cargarMaestro() {
  serverBadge.className = "server-badge";
  serverStatusText.textContent = "Cargando base...";

  try {
    const metaRes = await fetch(MASTER_META_URL, { cache: "no-store" });
    if (!metaRes.ok) throw new Error(\`No se pudieron leer los metadatos (HTTP \${metaRes.status}).\`);
    const meta = await metaRes.json();

    const urls = Array.from(
      { length: Number(meta.parts) || 0 },
      (_, i) => \`./data/base_\${String(i + 1).padStart(2, "0")}.txt?v=\${encodeURIComponent(meta.version || "")}\`
    );
    if (!urls.length) throw new Error("La configuración de la base maestra no es válida.");

    const piezas = await Promise.all(urls.map(async (url) => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(\`No se pudo cargar una parte de la base (HTTP \${res.status}).\`);
      return (await res.text()).trim();
    }));

    const comprimido = base64ABytes(piezas.join(""));
    const bytes = await descomprimirGzip(comprimido);
    const mapa = new Map();
    const estado = { pos: 0 };

    while (estado.pos < bytes.length) {
      const total = bytes[estado.pos++];
      const cantidad = leerVarint(bytes, estado);
      let ruc = 0;

      for (let i = 0; i < cantidad; i++) {
        ruc += leerVarint(bytes, estado);
        mapa.set(String(ruc), total);
      }
    }

    if (Number(meta.retirados) && mapa.size !== Number(meta.retirados)) {
      throw new Error("La base maestra no pasó la validación de integridad.");
    }

    totalesMaestro = mapa;
    maestroListo = true;
    serverBadge.className = "server-badge is-online";
    serverStatusText.textContent = "Base maestra cargada";
    serverBadge.title = \`\${Number(meta.total_rucs || mapa.size).toLocaleString()} RUC en la base maestra\`;
    actualizarBoton();
  } catch (error) {
    maestroListo = false;
    serverBadge.className = "server-badge is-offline";
    serverStatusText.textContent = "Base no disponible";
    mostrarAlerta(\`No se pudo cargar la base maestra: \${error.message}\`);
    actualizarBoton();
  }
}

if (criteriaToggle && criteriaBox) {
  criteriaToggle.addEventListener("click", () => criteriaBox.classList.toggle("open"));
}

function formatearBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function ocultarAlerta() {
  alertBox.className = "alert-box";
  alertBox.style.display = "none";
  alertMessage.textContent = "";
}

function mostrarAlerta(mensaje, tipo = "error") {
  alertBox.className = `alert-box ${tipo === "error" ? "is-error" : "is-info"}`;
  alertBox.style.display = "flex";
  alertMessage.textContent = mensaje;
}

function establecerArchivo(file) {
  ocultarAlerta();
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    mostrarAlerta("Formato no válido. Debe seleccionar un archivo con extensión .xlsx");
    quitarArchivo();
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    mostrarAlerta("El archivo supera el límite permitido de 20 MB.");
    quitarArchivo();
    return;
  }

  archivoSeleccionado = file;
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatearBytes(file.size);
  dropzonePrompt.style.display = "none";
  selectedFileCard.style.display = "flex";
  actualizarBoton();
}

function quitarArchivo() {
  archivoSeleccionado = null;
  archivoInput.value = "";
  selectedFileCard.style.display = "none";
  dropzonePrompt.style.display = "block";
  actualizarBoton();
}

if (btnRemoveFile) {
  btnRemoveFile.addEventListener("click", (e) => {
    e.stopPropagation();
    quitarArchivo();
  });
}

archivoInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) establecerArchivo(e.target.files[0]);
});

["dragenter", "dragover"].forEach((evento) => {
  dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((evento) => {
  dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) establecerArchivo(e.dataTransfer.files[0]);
});

const mensajesProgreso = [
  "Leyendo archivo Excel...",
  "Validando columnas RUC / V_CODEMP...",
  "Cruzando información con base maestra...",
  "Aplicando criterios de depuración (TOTAL ≤ 4)...",
  "Generando libro final con hojas Mantenidos y Retirados..."
];

function iniciarAnimacionProgreso() {
  let indice = 0;
  processingSubtitle.textContent = mensajesProgreso[0];
  intervaloMensajes = setInterval(() => {
    indice = (indice + 1) % mensajesProgreso.length;
    processingSubtitle.textContent = mensajesProgreso[indice];
  }, 1500);
}

function detenerAnimacionProgreso() {
  if (intervaloMensajes) clearInterval(intervaloMensajes);
  intervaloMensajes = null;
}

function ejecutarDescarga(blob, nombreArchivo = "Resultado.xlsx") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crearResultado(matriz, indiceRuc) {
  const cabecera = matriz[0].map(v => String(v ?? ""));
  const indiceTotal = cabecera.findIndex(c => c.trim().toUpperCase() === "TOTAL");
  const mantenidos = [cabecera.slice()];
  const retirados = [indiceTotal >= 0 ? cabecera.slice() : [...cabecera, "TOTAL"]];
  let evaluados = 0;

  for (let i = 1; i < matriz.length; i++) {
    const fila = matriz[i] || [];
    if (fila.every(v => String(v ?? "").trim() === "")) continue;

    evaluados++;
    const ruc = normalizarRuc(fila[indiceRuc]);
    const total = totalesMaestro.get(ruc) ?? 0;

    if (total > 4) {
      const copia = fila.slice();
      if (indiceTotal >= 0) copia[indiceTotal] = total;
      else copia.push(total);
      retirados.push(copia);
    } else {
      mantenidos.push(fila.slice());
    }
  }

  return { mantenidos, retirados, evaluados };
}

botonProcesar.addEventListener("click", async () => {
  if (!maestroListo) {
    mostrarAlerta("La base maestra todavía no está disponible.");
    return;
  }
  if (!archivoSeleccionado) {
    mostrarAlerta("Selecciona un archivo .xlsx para iniciar.");
    return;
  }
  if (typeof XLSX === "undefined") {
    mostrarAlerta("No se pudo cargar el componente de Excel. Recarga la página.");
    return;
  }

  ocultarAlerta();
  botonProcesar.style.display = "none";
  dropzone.style.display = "none";
  selectedFileCard.style.display = "none";
  processingState.style.display = "block";
  iniciarAnimacionProgreso();

  try {
    const buffer = await archivoSeleccionado.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    if (!libro.SheetNames.length) throw new Error("El archivo no contiene hojas.");

    const hoja = libro.Sheets[libro.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false });
    if (!matriz.length) throw new Error("El archivo está vacío.");

    const cabecera = matriz[0].map(v => String(v ?? "").trim());
    const indiceRuc = cabecera.findIndex(c => ["RUC", "V_CODEMP"].includes(c.toUpperCase()));
    if (indiceRuc < 0) throw new Error("El archivo debe contener una columna RUC o V_CODEMP.");

    const resultado = crearResultado(matriz, indiceRuc);

    const salida = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(salida, XLSX.utils.aoa_to_sheet(resultado.mantenidos), "Mantenidos");
    XLSX.utils.book_append_sheet(salida, XLSX.utils.aoa_to_sheet(resultado.retirados), "Retirados");

    const bytes = XLSX.write(salida, { bookType: "xlsx", type: "array" });
    ultimoBlobDescarga = new Blob(
      [bytes],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );

    kpiTotal.textContent = resultado.evaluados.toLocaleString();
    kpiMantenidos.textContent = (resultado.mantenidos.length - 1).toLocaleString();
    kpiRetirados.textContent = (resultado.retirados.length - 1).toLocaleString();

    detenerAnimacionProgreso();
    ejecutarDescarga(ultimoBlobDescarga, "Resultado.xlsx");
    processingState.style.display = "none";
    resultsPanel.style.display = "block";
  } catch (error) {
    detenerAnimacionProgreso();
    processingState.style.display = "none";
    dropzone.style.display = "block";
    selectedFileCard.style.display = "flex";
    botonProcesar.style.display = "flex";
    actualizarBoton();
    mostrarAlerta(`No se pudo procesar: ${error.message}`);
  }
});

if (btnReDownload) {
  btnReDownload.addEventListener("click", () => {
    if (ultimoBlobDescarga) ejecutarDescarga(ultimoBlobDescarga, "Resultado.xlsx");
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    ultimoBlobDescarga = null;
    quitarArchivo();
    resultsPanel.style.display = "none";
    dropzone.style.display = "block";
    botonProcesar.style.display = "flex";
    ocultarAlerta();
  });
}

document.addEventListener("DOMContentLoaded", cargarMaestro);
