/**
 * SISTEMA DE FILTRO RUC - CARTAS INDUCTIVAS | SUNAFIL
 * Lógica del Frontend: Drag & Drop, Health Check, Procesamiento y Métricas
 */

// Reemplazar por la URL HTTPS que entregue Cloudflare Tunnel o servidor local.
const API_URL = "https://REEMPLAZAR-POR-TUNNEL.trycloudflare.com";

// Elementos del DOM
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

// ==========================================================================
// 1. Monitor de Conectividad con la Sede (Health Check)
// ==========================================================================

async function verificarEstadoServidor() {
  if (!serverBadge) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_URL}/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      serverBadge.className = "server-badge is-online";
      serverStatusText.textContent = "Servicio Conectado";
    } else {
      serverBadge.className = "server-badge is-offline";
      serverStatusText.textContent = "Error en Servidor";
    }
  } catch (_) {
    serverBadge.className = "server-badge is-offline";
    serverStatusText.textContent = "Servidor Desconectado";
  }
}

// ==========================================================================
// 2. Acordeón de Criterios Institucionales
// ==========================================================================

if (criteriaToggle && criteriaBox) {
  criteriaToggle.addEventListener("click", () => {
    criteriaBox.classList.toggle("open");
  });
}

// ==========================================================================
// 3. Manejo de Selección de Archivos (Drag & Drop y Clic)
// ==========================================================================

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

  // Validación: Solo .xlsx
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    mostrarAlerta("Formato no válido. Debe seleccionar un archivo con extensión .xlsx");
    quitarArchivo();
    return;
  }

  // Validación: Máximo 20 MB
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    mostrarAlerta("El archivo supera el límite permitido de 20 MB.");
    quitarArchivo();
    return;
  }

  archivoSeleccionado = file;
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatearBytes(file.size);

  dropzonePrompt.style.display = "none";
  selectedFileCard.style.display = "flex";
  botonProcesar.disabled = false;
}

function quitarArchivo() {
  archivoSeleccionado = null;
  archivoInput.value = "";
  selectedFileCard.style.display = "none";
  dropzonePrompt.style.display = "block";
  botonProcesar.disabled = true;
}

if (btnRemoveFile) {
  btnRemoveFile.addEventListener("click", (e) => {
    e.stopPropagation();
    quitarArchivo();
  });
}

archivoInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    establecerArchivo(e.target.files[0]);
  }
});

// Eventos de arrastre (Drag & Drop)
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
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    establecerArchivo(e.dataTransfer.files[0]);
  }
});

// ==========================================================================
// 4. Lógica de Procesamiento y Descarga
// ==========================================================================

const mensajesProgreso = [
  "Leyendo archivo Excel...",
  "Validando columnas RUC / V_CODEMP...",
  "Cruzando información con base de datos SUNAFIL...",
  "Aplicando criterios de depuración (TOTAL ≤ 4)...",
  "Generando libro final con hojas Mantenidos y Retirados..."
];

function iniciarAnimacionProgreso() {
  let indice = 0;
  processingSubtitle.textContent = mensajesProgreso[0];
  intervaloMensajes = setInterval(() => {
    indice = (indice + 1) % mensajesProgreso.length;
    processingSubtitle.textContent = mensajesProgreso[indice];
  }, 2200);
}

function detenerAnimacionProgreso() {
  if (intervaloMensajes) {
    clearInterval(intervaloMensajes);
    intervaloMensajes = null;
  }
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

botonProcesar.addEventListener("click", async () => {
  if (!archivoSeleccionado) {
    mostrarAlerta("Selecciona un archivo .xlsx para iniciar.");
    return;
  }

  ocultarAlerta();
  botonProcesar.style.display = "none";
  dropzone.style.display = "none";
  selectedFileCard.style.display = "none";
  processingState.style.display = "block";
  iniciarAnimacionProgreso();

  const formData = new FormData();
  formData.append("archivo", archivoSeleccionado);

  try {
    const respuesta = await fetch(`${API_URL}/procesar`, {
      method: "POST",
      body: formData
    });

    detenerAnimacionProgreso();

    if (!respuesta.ok) {
      let mensajeError = `Error ${respuesta.status}`;
      try {
        const errorJson = await respuesta.json();
        mensajeError = errorJson.detail || mensajeError;
      } catch (_) {}
      throw new Error(mensajeError);
    }

    // Extraer métricas desde las cabeceras HTTP si están presentes
    const totalEval = respuesta.headers.get("X-Total-Evaluados") || "—";
    const totalMant = respuesta.headers.get("X-Total-Mantenidos") || "—";
    const totalRet = respuesta.headers.get("X-Total-Retirados") || "—";

    kpiTotal.textContent = totalEval !== "—" ? Number(totalEval).toLocaleString() : "Completado";
    kpiMantenidos.textContent = totalMant !== "—" ? Number(totalMant).toLocaleString() : "Generado";
    kpiRetirados.textContent = totalRet !== "—" ? Number(totalRet).toLocaleString() : "Generado";

    const blob = await respuesta.blob();
    ultimoBlobDescarga = blob;

    // Descarga automática inmediata
    ejecutarDescarga(blob, "Resultado.xlsx");

    // Mostrar panel de resultados
    processingState.style.display = "none";
    resultsPanel.style.display = "block";

  } catch (error) {
    detenerAnimacionProgreso();
    processingState.style.display = "none";
    dropzone.style.display = "block";
    selectedFileCard.style.display = "flex";
    botonProcesar.style.display = "flex";
    mostrarAlerta(`No se pudo procesar: ${error.message}`);
  }
});

// Botón para re-descargar el archivo si el navegador bloqueó la descarga
if (btnReDownload) {
  btnReDownload.addEventListener("click", () => {
    if (ultimoBlobDescarga) {
      ejecutarDescarga(ultimoBlobDescarga, "Resultado.xlsx");
    }
  });
}

// Botón para reiniciar y procesar un nuevo archivo
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

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  verificarEstadoServidor();
  // Verificar cada 30 segundos
  setInterval(verificarEstadoServidor, 30000);
});
