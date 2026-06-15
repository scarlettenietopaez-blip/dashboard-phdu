
(function () {
  "use strict";

  var CONFIG = {
    DATA_URL: "datos.csv",
    FORMATO_FECHA: "es-EC"
  };
  var WMS_DIVISION_TERRITORIAL_URL = "https://egobgeovisor.gadmriobamba.gob.ec:8080/geoserver/division_territorial/wms";


  var FERIADOS = [
    // Agrega feriados con formato dd/mm/aaaa
  ];

  var filasOriginales = [];
  var tramites = [];
  var movimientos = [];

  var mapa = null;
  var capaMarcadores = null;
  var controlLeyenda = null;
  var mapaListo = false;

  var mapaDashboard = null;
  var capaMarcadoresDashboard = null;
  var mapaDashboardListo = false;
  var controlCapasWmsDashboard = null;
  var capasWmsDashboard = {};
  var nombresCapasWmsDashboard = {};
  var controlCapasWmsDashboard = null;
  var capasWmsDashboard = {};

  function elemento(id) {
    return document.getElementById(id);
  }

  function on(id, evento, handler) {
    var el = elemento(id);
    if (el) {
      el.addEventListener(evento, handler);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    actualizarFechaActual();

    elemento("btnActualizar").addEventListener("click", cargarDatos);
    elemento("dashboardBusqueda").addEventListener("input", actualizarDashboardBusqueda);
    elemento("btnDashboardBuscar").addEventListener("click", actualizarDashboardBusqueda);
    elemento("buscar").addEventListener("input", renderizarTabla);
    elemento("filtroEstado").addEventListener("change", renderizarTabla);
    elemento("filtroTramite").addEventListener("change", renderizarTabla);
    elemento("btnBuscarIndividual").addEventListener("click", buscarTramiteIndividual);
    elemento("buscarIndividual").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        buscarTramiteIndividual();
      }
    });
    elemento("btnGenerarReporte").addEventListener("click", generarReporteTecnico);
    elemento("btnActualizarMapa").addEventListener("click", renderizarMapa);
    elemento("mapaBusqueda").addEventListener("input", renderizarMapa);
    elemento("mapaFiltroTramite").addEventListener("change", renderizarMapa);
    elemento("mapaFiltroEstado").addEventListener("change", renderizarMapa);
    elemento("mapaFiltroTecnico").addEventListener("change", renderizarMapa);
    elemento("filtroPromedioAreaTramite").addEventListener("change", renderizarPromedioArea);

    var pestanas = document.querySelectorAll(".pestana");
    for (var i = 0; i < pestanas.length; i++) {
      pestanas[i].addEventListener("click", function () {
        cambiarPestana(this.getAttribute("data-tab"));
      });
    }

    cargarDatos();

    on("btnDashboardConsultar", "click", buscarTramiteDashboard);
    on("dashboardConsultaBusqueda", "keydown", function (e) {
      if (e.key === "Enter") buscarTramiteDashboard();
    });
    on("dashboardMapaFiltroTramite", "change", function () { renderizarMapaDashboard(); buscarTramiteDashboard(true); });
    on("dashboardMapaFiltroEstado", "change", function () { renderizarMapaDashboard(); buscarTramiteDashboard(true); });
    on("dashboardMapaFiltroTecnico", "change", function () { renderizarMapaDashboard(); buscarTramiteDashboard(true); });
    on("btnCargarWmsDashboard", "click", cargarCapasWmsDashboard);
    on("btnAgregarWmsDashboard", "click", agregarCapaWmsDashboard);
    on("btnLimpiarWmsDashboard", "click", limpiarCapasWmsDashboard);

    setTimeout(function () {
      iniciarMapaDashboard();
      renderizarMapaDashboard();
      if (mapaDashboard) mapaDashboard.invalidateSize();
    }, 600);
  });

  function cargarDatos() {
    ocultarAviso();
    elemento("estadoDatos").textContent = "Cargando datos...";

    fetch(CONFIG.DATA_URL + "?version=" + Date.now(), { cache: "no-store" })
      .then(function (respuesta) {
        if (!respuesta.ok) {
          throw new Error("No se pudo leer datos.csv");
        }
        return respuesta.arrayBuffer();
      })
      .then(function (buffer) {
        var textoCsv = new TextDecoder("utf-8").decode(buffer);

        if (textoCsv.indexOf("�") !== -1) {
          textoCsv = new TextDecoder("windows-1252").decode(buffer);
        }

        if (textoCsv.charCodeAt(0) === 65279) {
          textoCsv = textoCsv.slice(1);
        }

        filasOriginales = parseTablaTexto(textoCsv);
        filasOriginales = filasOriginales.map(limpiarEncabezados);

        tramites = filasOriginales.map(normalizarFila).filter(function (t) {
          return t.egob !== "";
        });

        movimientos = [];
        for (var i = 0; i < tramites.length; i++) {
          movimientos = movimientos.concat(parseHistorial(tramites[i]));
        }

        if (tramites.length === 0) {
          mostrarAviso("El archivo datos.csv fue encontrado, pero no se detectaron trámites. Revisa que exista la columna egob.", true);
        }

        if (tramites.length > 0) {
          console.log("Dashboard V14: columnas detectadas", Object.keys(filasOriginales[0] || {}));
          console.log("Dashboard V14: primera coordenada detectada", tramites[0].coordenadaX, tramites[0].coordenadaY);
        }

        llenarFiltroTramite();
        llenarFiltroPromedioAreaTramite();
        llenarSelectorTecnico();
        llenarFiltrosMapa();
        llenarFiltrosMapaDashboard();
        renderizarIndicadores();
        renderizarDashboard();
        renderizarGraficos();
        renderizarTabla();
        renderizarEficiencia();
        if (mapaListo) {
          renderizarMapa();
        }
        if (mapaDashboardListo) {
          renderizarMapaDashboard();
        }

        elemento("estadoDatos").textContent = "Actualizado " + horaActual();
      })
      .catch(function (error) {
        console.error(error);
        elemento("estadoDatos").textContent = "Error al cargar datos";
        mostrarAviso("No se pudo leer datos.csv. Verifica que esté en la misma carpeta que index.html.", true);
      });
  }

  function parseTablaTexto(texto) {
    var primera = primeraLineaNoVacia(texto);
    var delimitador = detectarDelimitador(primera);
    var filas = [];
    var fila = [];
    var campo = "";
    var enComillas = false;

    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      var siguiente = texto[i + 1];

      if (c === '"') {
        if (enComillas && siguiente === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = !enComillas;
        }
      } else if (c === delimitador && !enComillas) {
        fila.push(campo);
        campo = "";
      } else if ((c === "\n" || c === "\r") && !enComillas) {
        if (c === "\r" && siguiente === "\n") {
          i++;
        }
        fila.push(campo);
        campo = "";
        if (fila.some(function (x) { return String(x).trim() !== ""; })) {
          filas.push(fila);
        }
        fila = [];
      } else {
        campo += c;
      }
    }

    if (campo !== "" || fila.length > 0) {
      fila.push(campo);
      if (fila.some(function (x) { return String(x).trim() !== ""; })) {
        filas.push(fila);
      }
    }

    if (filas.length === 0) {
      return [];
    }

    var encabezados = filas[0].map(function (h) {
      return String(h || "").replace(/^\uFEFF/, "").trim();
    });

    var resultado = [];
    for (var r = 1; r < filas.length; r++) {
      var obj = {};
      for (var col = 0; col < encabezados.length; col++) {
        obj[encabezados[col]] = filas[r][col] !== undefined ? filas[r][col] : "";
      }
      resultado.push(obj);
    }

    return resultado;
  }

  function primeraLineaNoVacia(texto) {
    var lineas = texto.split(/\r?\n/);
    for (var i = 0; i < lineas.length; i++) {
      if (lineas[i].trim() !== "") {
        return lineas[i];
      }
    }
    return "";
  }

  function detectarDelimitador(linea) {
    var opciones = ["\t", ";", ",", "|"];
    var mejor = "\t";
    var max = -1;
    for (var i = 0; i < opciones.length; i++) {
      var d = opciones[i];
      var count = linea.split(d).length - 1;
      if (count > max) {
        max = count;
        mejor = d;
      }
    }
    return mejor;
  }

  function limpiarEncabezados(fila) {
    var limpia = {};
    var keys = Object.keys(fila);
    for (var i = 0; i < keys.length; i++) {
      var claveOriginal = keys[i];
      var clave = String(claveOriginal || "");
      if (clave.charCodeAt(0) === 65279) {
        clave = clave.slice(1);
      }
      clave = clave.replace(/\r?\n/g, "").trim();
      limpia[clave] = fila[claveOriginal];
    }
    return limpia;
  }

  function normalizarFila(fila) {
    var fechaFinTexto = obtener(fila, ["fech_fin_tramite", "fecha_fin_tramite", "Fecha_fin_tramite", "Fecha fin trámite", "Fecha fin tramite"]);
    var estaDespachado = fechaFinTexto.trim() !== "";
    var ubicacion = detectarResponsablesActuales(fila, estaDespachado);

    var fechaTramiteTexto = obtener(fila, ["fech_tramite", "fecha_tramite"]);
    var fechaHabitatTexto = obtener(fila, ["fech_habitat", "fecha_habitat"]);
    var fechaTramiteObj = parseFecha(fechaTramiteTexto);
    var fechaHabitatObj = parseFecha(fechaHabitatTexto);
    var fechaFinObj = parseFecha(fechaFinTexto);
    var fechaCorte = fechaFinObj || new Date();

    return {
      raw: fila,
      egob: obtener(fila, ["egob", "EGOB", "eGob"]),
      soy: obtener(fila, ["soy_riobamba", "soy riobamba"]),
      solicitante: obtener(fila, ["nam_solicitante", "solicitante"]),
      tramite: obtener(fila, ["nam_tramite", "tramite", "trámite"]),
      fechaTramite: fechaTramiteTexto,
      fechaHabitat: fechaHabitatTexto,
      fechaFin: fechaFinTexto,
      fechaTramiteObj: fechaTramiteObj,
      fechaHabitatObj: fechaHabitatObj,
      fechaFinObj: fechaFinObj,
      diasProceso: fechaTramiteObj ? diasCalendario(fechaTramiteObj, fechaCorte) : null,
      diasHabitat: fechaHabitatObj ? diasCalendario(fechaHabitatObj, fechaCorte) : null,
      estadoDashboard: estaDespachado ? "Despachado" : "Activo",
      responsablesActuales: ubicacion.responsables,
      etapasActuales: ubicacion.etapas,
      responsableActual: ubicacion.responsables.join("; "),
      etapaActual: ubicacion.etapas.join("; "),
      historial: obtenerRaw(fila, ["historial", "Historial"]),
      comentarios: obtener(fila, ["Comentarios", "comentarios"]),
      coordenadaX: obtenerCoordenada(fila, "x"),
      coordenadaY: obtenerCoordenada(fila, "y")
    };
  }

  function obtener(fila, columnas) {
    for (var i = 0; i < columnas.length; i++) {
      var c = columnas[i];
      if (fila[c] !== undefined && fila[c] !== null && String(fila[c]).trim() !== "") {
        return limpiarValor(fila[c]);
      }
    }
    return "";
  }

  function obtenerRaw(fila, columnas) {
    for (var i = 0; i < columnas.length; i++) {
      var c = columnas[i];
      if (fila[c] !== undefined && fila[c] !== null && String(fila[c]).trim() !== "") {
        return String(fila[c]).trim();
      }
    }
    return "";
  }

  function limpiarValor(valor) {
    var texto = String(valor || "");
    texto = texto.replace(/\r?\n/g, " ");
    while (texto.indexOf("  ") !== -1) {
      texto = texto.replace(/  /g, " ");
    }
    return texto.trim();
  }


  function obtenerCoordenada(fila, eje) {
    // Primero busca exactamente las columnas que indicaste:
    // Coordenadas_X y Coordenadas_Y
    if (eje === "x") {
      if (fila["Coordenadas_X"] !== undefined && String(fila["Coordenadas_X"]).trim() !== "") {
        return limpiarValor(fila["Coordenadas_X"]);
      }
    }

    if (eje === "y") {
      if (fila["Coordenadas_Y"] !== undefined && String(fila["Coordenadas_Y"]).trim() !== "") {
        return limpiarValor(fila["Coordenadas_Y"]);
      }
    }

    // Luego busca por nombre normalizado, por si Excel añadió espacios invisibles.
    var objetivo = eje === "x" ? "coordenadas_x" : "coordenadas_y";
    var objetivoSinGuion = eje === "x" ? "coordenadasx" : "coordenadasy";

    var keys = Object.keys(fila);
    for (var i = 0; i < keys.length; i++) {
      var claveOriginal = keys[i];
      var clave = normalizarClave(claveOriginal);

      if (clave === objetivo || clave === objetivoSinGuion) {
        var valor = limpiarValor(fila[claveOriginal]);
        if (valor !== "") {
          return valor;
        }
      }
    }

    return "";
  }

  function normalizarClave(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();
  }

  function detectarResponsablesActuales(fila, estaDespachado) {
    if (estaDespachado) {
      return { etapas: ["Despachado"], responsables: ["Despachado"] };
    }

    var estadoTramite = obtener(fila, ["estado_tramite", "estado trámite", "estado"]);
    var areas = [
      { etapa: "Arquitectura", responsable: obtener(fila, ["arq_responsable", "arq responsable"]), conclusion: obtener(fila, ["conclu_arq", "conclusion_arq"]) },
      { etapa: "Ingeniería", responsable: obtener(fila, ["ing_responsable", "ing responsable"]), conclusion: obtener(fila, ["conclu_ing", "conclusion_ing"]) },
      { etapa: "Georreferenciación", responsable: obtener(fila, ["geo_responsable", "geo responsable"]), conclusion: obtener(fila, ["conclu_geo", "conclusion_geo"]) },
      { etapa: "Legal", responsable: obtener(fila, ["abg_responsable", "abg responsable"]), conclusion: obtener(fila, ["conclu_abg", "conclusion_abg"]) }
    ];

    var abiertas = [];
    for (var i = 0; i < areas.length; i++) {
      if (areas[i].responsable !== "" && !conclusionCierraEtapa(areas[i].conclusion, estadoTramite)) {
        abiertas.push(areas[i]);
      }
    }

    if (abiertas.length === 0) {
      return { etapas: ["Pendiente de cierre"], responsables: ["Pendiente de cierre"] };
    }

    var responsablesUnicos = [];
    var etapas = [];
    for (var j = 0; j < abiertas.length; j++) {
      etapas.push(abiertas[j].etapa + ": " + abiertas[j].responsable);
      if (responsablesUnicos.indexOf(abiertas[j].responsable) === -1) {
        responsablesUnicos.push(abiertas[j].responsable);
      }
    }

    return { etapas: etapas, responsables: responsablesUnicos };
  }

  function conclusionCierraEtapa(conclusion, estadoTramite) {
    var conclusionNorm = normalizarTexto(conclusion);
    var estadoNorm = normalizarTexto(estadoTramite);

    if (conclusionNorm === "") {
      return false;
    }

    var cierresDirectos = [
      "APROBADO SIN OBSERVACIONES",
      "APROBADO CON OBSERVACIONES",
      "DESISTIDO",
      "RESOLUCION FIRMADA"
    ];

    if (cierresDirectos.indexOf(conclusionNorm) !== -1) {
      return true;
    }

    if (conclusionNorm === "OTROS") {
      var estados = ["DESPACHADO FAVORABLE", "DESISTIDO", "OTRA DIRECCION"];
      return estados.indexOf(estadoNorm) !== -1;
    }

    return false;
  }

  function parseHistorial(t) {
    var texto = String(t.historial || "");
    var lineas = texto.split(/\r?\n/);
    var out = [];
    var areaCodigo = "";
    var mapaAreas = {
      arq: { nombre: "Arquitectura", tecnico: obtener(t.raw, ["arq_responsable", "arq responsable"]) },
      ing: { nombre: "Ingeniería", tecnico: obtener(t.raw, ["ing_responsable", "ing responsable"]) },
      geo: { nombre: "Georreferenciación", tecnico: obtener(t.raw, ["geo_responsable", "geo responsable"]) },
      abg: { nombre: "Legal", tecnico: obtener(t.raw, ["abg_responsable", "abg responsable"]) }
    };

    for (var i = 0; i < lineas.length; i++) {
      var linea = lineas[i].trim();
      if (!linea) {
        continue;
      }

      var encabezado = linea.match(/^(Arq|Ing|Geo|Abg)\s*:/i);
      if (encabezado) {
        areaCodigo = encabezado[1].toLowerCase();
        continue;
      }

      var match = linea.match(/^(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (match && areaCodigo && mapaAreas[areaCodigo]) {
        var inicio = parseFecha(match[2]);
        var fin = parseFecha(match[3]);
        var tecnico = mapaAreas[areaCodigo].tecnico || "Sin técnico definido";
        var dias = diasLaborables(inicio, fin);
        var movimientoCodigo = limpiarValor(match[1]);

        out.push({
          egob: t.egob,
          tramite: t.tramite,
          solicitante: t.solicitante,
          estadoDashboard: t.estadoDashboard,
          areaCodigo: areaCodigo,
          area: mapaAreas[areaCodigo].nombre,
          tecnico: tecnico,
          movimientoCodigo: movimientoCodigo,
          movimiento: significadoMovimiento(movimientoCodigo),
          inicio: inicio,
          fin: fin,
          inicioTexto: match[2],
          finTexto: match[3],
          dias: dias
        });
      }
    }

    return out;
  }

  function significadoMovimiento(codigo) {
    var norm = normalizarTexto(codigo).replace(/\s+/g, "");
    var mapa = {
      "A.": "Asignado",
      "OBS.1": "Observaciones 1",
      "OBS.2": "Observaciones 2",
      "OBS.3": "Observaciones 3",
      "EST.": "Solicitud de Revisión Estructural",
      "APR.": "Informe Aprobatorio",
      "OTR.": "Otros",
      "DESIS.": "Informe de desistimiento",
      "BORR.": "Borrador de Resolución",
      "EMIT.": "Resolución Firmada"
    };
    return mapa[norm] || codigo;
  }

  function renderizarIndicadores() {
    var total = tramites.length;
    var despachados = tramites.filter(function (t) { return t.estadoDashboard === "Despachado"; }).length;
    var activos = tramites.filter(function (t) { return t.estadoDashboard === "Activo"; }).length;
    if (elemento("totalTramites")) elemento("totalTramites").textContent = total;
    if (elemento("totalDespachados")) elemento("totalDespachados").textContent = despachados;
    if (elemento("totalActivos")) elemento("totalActivos").textContent = activos;
    if (elemento("totalActivosPorTipo")) elemento("totalActivosPorTipo").textContent = activos + " trámites";
    if (elemento("totalActivosPorTecnico")) {
      var asignaciones = 0;
      var porTecnico = contarPorTecnicosActivos(tramites.filter(function (t) { return t.estadoDashboard === "Activo"; }));
      var claves = Object.keys(porTecnico);
      for (var i = 0; i < claves.length; i++) asignaciones += porTecnico[claves[i]];
      elemento("totalActivosPorTecnico").textContent = asignaciones + " asignaciones";
    }
  }



function renderizarDashboard() {
  var total = tramites.length;
  var despachados = tramites.filter(function (t) { return t.estadoDashboard === "Despachado"; }).length;
  var activos = tramites.filter(function (t) { return t.estadoDashboard === "Activo"; }).length;

  renderizarDonaEstadoDashboard(total, activos, despachados);
  crearGraficoBarrasHtml("graficoDashboardPromediosTramite", promedioProcesoTotalPorTramiteDashboard(), "desc");

  var grafProm = elemento("graficoDashboardPromediosTramite");
  if (grafProm) grafProm.classList.add("grafico-multicolor");

  if (mapaDashboardListo) {
    renderizarMapaDashboard();
  }

  if (elemento("dashboardConsultaBusqueda") && elemento("dashboardConsultaBusqueda").value.trim() !== "") {
    buscarTramiteDashboard(true);
  } else {
    ocultarConsultaDashboard();
  }
}

function promedioProcesoTotalPorTramiteDashboard() {
  var grupos = {};
  for (var i = 0; i < tramites.length; i++) {
    var t = tramites[i];
    var key = (t.tramite || "").trim();
    if (!key || normalizarTexto(key) === "SIN DATO") continue;
    if (!grupos[key]) grupos[key] = [];
    if (t.diasProceso !== null) grupos[key].push(t.diasProceso);
  }

  var pares = Object.keys(grupos).map(function (k) {
    return [k, promedio(grupos[k])];
  }).filter(function (p) {
    return isFinite(p[1]) && p[1] > 0;
  }).sort(function (a, b) {
    return b[1] - a[1];
  });

  var obj = {};
  for (var j = 0; j < pares.length; j++) {
    obj[pares[j][0]] = pares[j][1];
  }
  return obj;
}

function renderizarDonaEstadoDashboard(total, activos, despachados) {
  var contenedor = elemento("graficoDashboardEstado");
  if (!contenedor) return;
  if (!total) {
    contenedor.innerHTML = "<div class='sin-datos'>No existen trámites para visualizar.</div>";
    return;
  }

  var circ = 2 * Math.PI * 62;
  var activosPct = total ? (activos / total) : 0;
  var despPct = total ? (despachados / total) : 0;
  var activosLen = Math.max(0, circ * activosPct);
  var despLen = Math.max(0, circ * despPct);
  var despOffset = -activosLen;
  var activosPorc = porcentaje(activos, total);
  var despPorc = porcentaje(despachados, total);

  contenedor.innerHTML = "" +
    "<div class='donut-widget'>" +
      "<div class='donut-chart-shell'>" +
        "<svg viewBox='0 0 200 200' class='donut-svg-v2' aria-label='Estado general de trámites'>" +
          "<circle class='donut-track-v2' cx='100' cy='100' r='62'></circle>" +
          "<circle class='donut-seg-activo' cx='100' cy='100' r='62' stroke-dasharray='" + activosLen + " " + (circ - activosLen) + "'><title>Activos: " + activos + " trámites · " + activosPorc + "</title></circle>" +
          "<circle class='donut-seg-despachado' cx='100' cy='100' r='62' stroke-dasharray='" + despLen + " " + (circ - despLen) + "' stroke-dashoffset='" + despOffset + "'><title>Despachados: " + despachados + " trámites · " + despPorc + "</title></circle>" +
        "</svg>" +
        "<div class='donut-center-html'><div class='donut-center-box'><span>Total</span><strong>" + total + "</strong><small>trámites</small></div></div>" +
      "</div>" +
      "<div class='donut-legend-v2'>" +
        "<div class='donut-legend-item' title='Activos: " + activos + " trámites · " + activosPorc + "'>" +
          "<span class='swatch activo'></span>" +
          "<div><div class='nombre'>Activos</div><div class='ayuda'>" + activosPorc + " del total</div></div>" +
          "<div class='meta'><span class='valor'>" + activos + "</span></div>" +
        "</div>" +
        "<div class='donut-legend-item' title='Despachados: " + despachados + " trámites · " + despPorc + "'>" +
          "<span class='swatch despachado'></span>" +
          "<div><div class='nombre'>Despachados</div><div class='ayuda'>" + despPorc + " del total</div></div>" +
          "<div class='meta'><span class='valor'>" + despachados + "</span></div>" +
        "</div>" +
      "</div>" +
    "</div>";
}

function porcentaje(valor, total) {
  if (!total) return "0%";
  return (Math.round((valor / total) * 1000) / 10).toFixed(1).replace(/\.0$/, "") + "%";
}

function actualizarDashboardBusqueda() {
    renderizarDashboardBusqueda();
    if (mapaDashboardListo) {
      renderizarMapaDashboard();
    }
  }

  function promedioProcesoTotalPorTramite() {
    var grupos = {};
    for (var i = 0; i < tramites.length; i++) {
      var t = tramites[i];
      var key = t.tramite || "Sin dato";
      if (!grupos[key]) grupos[key] = [];
      if (t.diasProceso !== null) grupos[key].push(t.diasProceso);
    }

    var pares = Object.keys(grupos).map(function (k) {
      return [k, promedio(grupos[k])];
    }).filter(function (p) {
      return isFinite(p[1]) && p[1] > 0;
    }).sort(function (a, b) {
      return b[1] - a[1];
    });

    var obj = {};
    for (var j = 0; j < pares.length; j++) {
      obj[pares[j][0]] = pares[j][1];
    }
    return obj;
  }

  function renderizarDashboardBusqueda() {
    var q = limpiar(elemento("dashboardBusqueda").value);
    var lista = tramites.filter(function (t) {
      if (!q) return true;
      var base = t.egob + " " + t.solicitante + " " + t.tramite + " " + t.responsableActual + " " + t.estadoDashboard;
      return limpiar(base).indexOf(q) !== -1;
    }).slice(0, 25);

    elemento("tablaDashboardBusqueda").innerHTML = lista.map(function (t) {
      var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";
      return "<tr>" +
        "<td><strong>" + escaparHtml(t.egob) + "</strong></td>" +
        "<td>" + escaparHtml(t.solicitante || "—") + "</td>" +
        "<td>" + escaparHtml(t.tramite || "—") + "</td>" +
        "<td><span class='estado " + claseEstado + "'>" + escaparHtml(t.estadoDashboard) + "</span></td>" +
        "<td>" + escaparHtml(t.responsableActual || "—") + "</td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='5'>No hay resultados para la búsqueda.</td></tr>";
  }

  function renderizarGraficos() {
    var activos = tramites.filter(function (t) { return t.estadoDashboard === "Activo"; });
    crearGraficoBarrasHtml("graficoTramite", contarPor(activos, "tramite"), "desc");
    crearGraficoBarrasHtml("graficoTecnico", contarPorTecnicosActivos(activos), "desc");
  }

  function crearGraficoBarrasHtml(idContenedor, datos, orden) {
    var contenedor = elemento(idContenedor);
    if (!contenedor) return;
    var entradas = Object.keys(datos).map(function (k) { return [k, datos[k]]; })
      .filter(function (item) { return item[0] !== ""; });

    if (orden === "asc") {
      entradas.sort(function (a, b) { return a[1] - b[1]; });
    } else {
      entradas.sort(function (a, b) { return b[1] - a[1]; });
    }

    if (entradas.length === 0) {
      contenedor.innerHTML = "<div class='sin-datos'>No existen datos para graficar.</div>";
      return;
    }

    var maximo = Math.max.apply(null, entradas.map(function (item) { return item[1]; }));
    var esPromedioDashboard = idContenedor === "graficoDashboardPromediosTramite";

    contenedor.innerHTML = entradas.map(function (item, index) {
      var etiqueta = item[0];
      var valor = item[1];
      var ancho = maximo > 0 ? Math.max(3, Math.round((valor / maximo) * 100)) : 0;
      var estiloColor = esPromedioDashboard ? " style='--color-barra:" + colorUnicoGrafico(index, entradas.length) + "'" : "";
      var valorTexto = esPromedioDashboard ? valor + " días" : valor;
      return "<div class='barra-fila' " + estiloColor + " title='" + escaparAtributo(etiqueta + ": " + valorTexto) + "'>" +
        "<div class='barra-label'>" + escaparHtml(etiqueta) + "</div>" +
        "<div class='barra-contenedor'><div class='barra' style='width:" + ancho + "%'></div></div>" +
        "<div class='barra-numero'>" + valorTexto + "</div>" +
      "</div>";
    }).join("");
  }

  function colorUnicoGrafico(index, total) {
    var paleta = [
      "#2563eb", "#06b6d4", "#d946ef", "#f59e0b", "#22c55e", "#ef4444",
      "#8b5cf6", "#14b8a6", "#f97316", "#0ea5e9", "#84cc16", "#ec4899",
      "#6366f1", "#10b981", "#eab308", "#f43f5e", "#3b82f6", "#a855f7"
    ];
    if (index < paleta.length) return paleta[index];
    var hue = Math.round((index * 137.508) % 360);
    return "hsl(" + hue + " 78% 48%)";
  }

  function contarPor(lista, propiedad) {
    var resultado = {};
    for (var i = 0; i < lista.length; i++) {
      var clave = lista[i][propiedad] || "Sin dato";
      resultado[clave] = (resultado[clave] || 0) + 1;
    }
    return resultado;
  }

  function contarPorTecnicosActivos(lista) {
    var resultado = {};
    for (var i = 0; i < lista.length; i++) {
      var tecnicos = lista[i].responsablesActuales || [];
      var unicos = [];

      for (var j = 0; j < tecnicos.length; j++) {
        var nombre = tecnicos[j];
        if (!nombre || nombre === "Pendiente de cierre" || nombre === "Despachado") {
          continue;
        }
        if (unicos.indexOf(nombre) === -1) {
          unicos.push(nombre);
        }
      }

      for (var k = 0; k < unicos.length; k++) {
        resultado[unicos[k]] = (resultado[unicos[k]] || 0) + 1;
      }
    }
    return resultado;
  }

  function llenarFiltroTramite() {
    var set = {};
    for (var i = 0; i < tramites.length; i++) {
      if (tramites[i].tramite) {
        set[tramites[i].tramite] = true;
      }
    }

    var lista = Object.keys(set).sort();
    var html = "<option value=''>Todos los trámites</option>";
    for (var j = 0; j < lista.length; j++) {
      html += "<option value='" + escaparAtributo(lista[j]) + "'>" + escaparHtml(lista[j]) + "</option>";
    }
    elemento("filtroTramite").innerHTML = html;
  }


  function llenarFiltroPromedioAreaTramite() {
    var set = {};
    for (var i = 0; i < tramites.length; i++) {
      if (tramites[i].tramite) {
        set[tramites[i].tramite] = true;
      }
    }

    var lista = Object.keys(set).sort();
    var html = "<option value=''>General: todos los trámites</option>";
    for (var j = 0; j < lista.length; j++) {
      html += "<option value='" + escaparAtributo(lista[j]) + "'>" + escaparHtml(lista[j]) + "</option>";
    }
    elemento("filtroPromedioAreaTramite").innerHTML = html;
  }

  function llenarSelectorTecnico() {
    var set = {};
    for (var i = 0; i < tramites.length; i++) {
      var reps = tramites[i].responsablesActuales || [];
      for (var j = 0; j < reps.length; j++) {
        if (reps[j] && reps[j] !== "Pendiente de cierre" && reps[j] !== "Despachado") {
          set[reps[j]] = true;
        }
      }
    }

    for (var k = 0; k < movimientos.length; k++) {
      if (movimientos[k].tecnico && movimientos[k].tecnico !== "Sin técnico definido") {
        set[movimientos[k].tecnico] = true;
      }
    }

    var tecnicos = Object.keys(set).sort();
    var html = "<option value=''>Selecciona un técnico</option>";
    for (var x = 0; x < tecnicos.length; x++) {
      html += "<option value='" + escaparAtributo(tecnicos[x]) + "'>" + escaparHtml(tecnicos[x]) + "</option>";
    }
    elemento("selectorTecnico").innerHTML = html;
  }

  function renderizarTabla() {
    var texto = limpiar(elemento("buscar").value);
    var estado = elemento("filtroEstado").value;
    var tramite = elemento("filtroTramite").value;
    var filtrados = [];

    for (var i = 0; i < tramites.length; i++) {
      var t = tramites[i];
      var textoFila = t.egob + " " + t.soy + " " + t.solicitante + " " + t.tramite + " " + t.responsableActual + " " + t.etapaActual;
      var coincideTexto = texto === "" || limpiar(textoFila).indexOf(texto) !== -1;
      var coincideEstado = estado === "" || t.estadoDashboard === estado;
      var coincideTramite = tramite === "" || t.tramite === tramite;
      if (coincideTexto && coincideEstado && coincideTramite) {
        filtrados.push(t);
      }
    }

    elemento("tablaTramites").innerHTML = filtrados.map(function (t) {
      var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";
      return "<tr>" +
        "<td><strong>" + escaparHtml(t.egob) + "</strong></td>" +
        "<td>" + escaparHtml(t.soy) + "</td>" +
        "<td>" + escaparHtml(t.solicitante) + "</td>" +
        "<td>" + escaparHtml(t.tramite) + "</td>" +
        "<td>" + escaparHtml(t.responsableActual) + "</td>" +
        "<td>" + escaparHtml(t.etapaActual) + "</td>" +
        "<td><span class='estado " + claseEstado + "'>" + t.estadoDashboard + "</span></td>" +
        "<td>" + escaparHtml(t.fechaTramite || "Sin fecha") + "</td>" +
        "<td>" + escaparHtml(t.fechaHabitat || "Sin fecha Hábitat") + "</td>" +
        "<td>" + escaparHtml(t.fechaFin || "—") + "</td>" +
      "</tr>";
    }).join("");
  }

  function ocultarConsultaDashboard() {
    var panel = elemento("dashboardConsultaPanel");
    if (panel) panel.classList.add("consulta-oculta");
    if (elemento("detalleTramiteDashboard")) {
      elemento("detalleTramiteDashboard").innerHTML =
        "<h3>Selecciona un trámite</h3><p class='ayuda'>Usa el buscador para cargar el detalle del trámite en esta vista.</p>";
    }
    if (elemento("tablaTiempoResponsableDashboard")) {
      elemento("tablaTiempoResponsableDashboard").innerHTML = "";
    }
  }

  function coincideBusquedaDashboard(t, q) {
    if (!q) return true;
    var qTrim = String(q || "").trim();
    if (/^\d+$/.test(qTrim)) {
      return String(t.egob || "").trim() === qTrim;
    }
    var base = t.egob + " " + t.soy + " " + t.solicitante + " " + t.tramite + " " + t.responsableActual + " " + t.estadoDashboard;
    return limpiar(base).indexOf(limpiar(qTrim)) !== -1;
  }

  function buscarTramiteDashboard(mantenerActual) {
    var input = elemento("dashboardConsultaBusqueda");
    var q = limpiar(input ? input.value : "");

    if (!q) {
      ocultarConsultaDashboard();
      if (mapaDashboardListo) {
        renderizarMapaDashboard();
      }
      return;
    }

    var filtroTramite = (elemento("dashboardMapaFiltroTramite") || {}).value || "";
    var filtroEstado = (elemento("dashboardMapaFiltroEstado") || {}).value || "";
    var filtroTecnico = (elemento("dashboardMapaFiltroTecnico") || {}).value || "";

    var encontrados = tramites.filter(function (t) {
      var coincideTexto = coincideBusquedaDashboard(t, q);
      var coincideTramite = !filtroTramite || t.tramite === filtroTramite;
      var coincideEstado = !filtroEstado || t.estadoDashboard === filtroEstado;
      var coincideTecnico = !filtroTecnico || (t.responsablesActuales || []).indexOf(filtroTecnico) !== -1;
      return coincideTexto && coincideTramite && coincideEstado && coincideTecnico;
    });

    if (!encontrados.length) {
      var panelNoEncontrado = elemento("dashboardConsultaPanel");
      if (panelNoEncontrado) panelNoEncontrado.classList.remove("consulta-oculta");
      elemento("detalleTramiteDashboard").innerHTML = "<h3>No encontrado</h3><p class='ayuda'>No se encontraron trámites con los filtros ingresados.</p>";
      elemento("tablaTiempoResponsableDashboard").innerHTML = "<div class='tiempo-empty'>No hay datos para mostrar.</div>";
      return;
    }

    mostrarTramiteIndividualDashboard(encontrados[0]);
    if (mapaDashboardListo) {
      renderizarMapaDashboard();
    }
  }

  function mostrarTramiteIndividualDashboard(t) {
    var panelConsulta = elemento("dashboardConsultaPanel");
    if (panelConsulta) panelConsulta.classList.remove("consulta-oculta");
    var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";

    elemento("detalleTramiteDashboard").innerHTML =
      "<h3>eGOB " + escaparHtml(t.egob) + " · " + escaparHtml(t.tramite) + "</h3>" +
      "<div class='kv'><strong>Soy Riobamba:</strong><span>" + escaparHtml(t.soy || "—") + "</span></div>" +
      "<div class='kv'><strong>Solicitante:</strong><span>" + escaparHtml(t.solicitante || "—") + "</span></div>" +
      "<div class='kv'><strong>Estado:</strong><span><span class='estado " + claseEstado + "'>" + t.estadoDashboard + "</span></span></div>" +
      "<div class='kv'><strong>Responsable actual:</strong><span>" + escaparHtml(t.responsableActual || "—") + "</span></div>" +
      "<div class='kv'><strong>Etapa actual:</strong><span>" + escaparHtml(t.etapaActual || "—") + "</span></div>" +
      "<div class='kv'><strong>Fecha trámite:</strong><span>" + escaparHtml(t.fechaTramite || "Sin fecha") + "</span></div>" +
      "<div class='kv'><strong>Fecha Hábitat:</strong><span>" + escaparHtml(t.fechaHabitat || "Sin fecha Hábitat") + "</span></div>" +
      "<div class='kv'><strong>Fecha fin:</strong><span>" + escaparHtml(t.fechaFin || "—") + "</span></div>" +
      "<div class='kv'><strong>Tiempo total:</strong><span>" + (t.diasProceso === null ? "Sin fecha de ingreso" : t.diasProceso + " días calendario") + "</span></div>" +
      "<div class='kv'><strong>Tiempo en Hábitat:</strong><span>" + (t.diasHabitat === null ? "Sin fecha Hábitat" : t.diasHabitat + " días calendario") + "</span></div>" +
      "<div class='kv'><strong>Comentarios:</strong><span>" + escaparHtml(t.comentarios || "—") + "</span></div>";

    var movs = movimientos.filter(function (m) { return m.egob === t.egob; });
    var totales = agruparMovimientosDetalleResponsable(movs);
    var gruposResp = Object.keys(totales);
    var totalDiasResponsables = 0;

    elemento("tablaTiempoResponsableDashboard").innerHTML = gruposResp.map(function (nombre) {
      var r = totales[nombre];
      totalDiasResponsables += r.dias || 0;
      var movimientosHtml = r.detalle.map(function (item) {
        return "<li>" + escaparHtml(item) + "</li>";
      }).join("");
      var fechasHtml = r.fechas.map(function (item) {
        return "<li>" + escaparHtml(item) + "</li>";
      }).join("");

      return "<article class='tiempo-card'>" +
        "<div class='tiempo-card-head'>" +
          "<div class='tiempo-card-title'>" +
            "<strong>" + escaparHtml(r.nombre) + "</strong>" +
            "<span>" + escaparHtml(r.areas.join("; ")) + "</span>" +
          "</div>" +
          "<div class='tiempo-card-total'>" + r.dias + " días</div>" +
        "</div>" +
        "<div class='tiempo-card-grid'>" +
          "<div class='tiempo-card-block'><h5>Movimientos</h5><ul>" + movimientosHtml + "</ul></div>" +
          "<div class='tiempo-card-block'><h5>Fechas</h5><ul>" + fechasHtml + "</ul></div>" +
        "</div>" +
      "</article>";
    }).join("") || "<div class='tiempo-empty'>No se detectaron movimientos cuantificables.</div>";

    if (gruposResp.length > 0) {
      elemento("tablaTiempoResponsableDashboard").innerHTML +=
        "<div class='tiempo-total-final'><span>Total días laborables del trámite</span><strong>" + totalDiasResponsables + " días</strong></div>";
    }
  }

  function buscarTramiteIndividual() {
    var q = limpiar(elemento("buscarIndividual").value);
    if (!q) {
      return;
    }

    var t = null;
    for (var i = 0; i < tramites.length; i++) {
      var base = tramites[i].egob + " " + tramites[i].soy + " " + tramites[i].solicitante + " " + tramites[i].tramite;
      if (limpiar(base).indexOf(q) !== -1) {
        t = tramites[i];
        break;
      }
    }

    if (!t) {
      elemento("detalleTramite").innerHTML = "<h3>No encontrado</h3><p class='ayuda'>Intenta con otro número eGOB, Soy Riobamba, nombre o trámite.</p>";
      elemento("historialOriginal").textContent = "—";
      elemento("tablaTiempoResponsable").innerHTML = "";
      return;
    }

    mostrarTramiteIndividual(t);
  }

  function mostrarTramiteIndividual(t) {
    var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";

    elemento("detalleTramite").innerHTML =
      "<h3>eGOB " + escaparHtml(t.egob) + " · " + escaparHtml(t.tramite) + "</h3>" +
      "<div class='kv'><strong>Soy Riobamba:</strong><span>" + escaparHtml(t.soy || "—") + "</span></div>" +
      "<div class='kv'><strong>Solicitante:</strong><span>" + escaparHtml(t.solicitante || "—") + "</span></div>" +
      "<div class='kv'><strong>Estado:</strong><span><span class='estado " + claseEstado + "'>" + t.estadoDashboard + "</span></span></div>" +
      "<div class='kv'><strong>Responsable actual:</strong><span>" + escaparHtml(t.responsableActual || "—") + "</span></div>" +
      "<div class='kv'><strong>Etapa actual:</strong><span>" + escaparHtml(t.etapaActual || "—") + "</span></div>" +
      "<div class='kv'><strong>Fecha trámite:</strong><span>" + escaparHtml(t.fechaTramite || "Sin fecha") + "</span></div>" +
      "<div class='kv'><strong>Fecha Hábitat:</strong><span>" + escaparHtml(t.fechaHabitat || "Sin fecha Hábitat") + "</span></div>" +
      "<div class='kv'><strong>Fecha fin:</strong><span>" + escaparHtml(t.fechaFin || "—") + "</span></div>" +
      "<div class='kv'><strong>Tiempo total:</strong><span>" + (t.diasProceso === null ? "Sin fecha de ingreso" : t.diasProceso + " días calendario") + "</span></div>" +
      "<div class='kv'><strong>Tiempo en Hábitat:</strong><span>" + (t.diasHabitat === null ? "Sin fecha Hábitat" : t.diasHabitat + " días calendario") + "</span></div>" +
      "<div class='kv'><strong>Comentarios:</strong><span>" + escaparHtml(t.comentarios || "—") + "</span></div>";

    elemento("historialOriginal").textContent = t.historial || "—";

    var movs = movimientos.filter(function (m) {
      return m.egob === t.egob;
    });
    var totales = agruparMovimientosDetalleResponsable(movs);
    var gruposResp = Object.keys(totales);

    var totalDiasResponsables = 0;

    elemento("tablaTiempoResponsable").innerHTML = gruposResp.map(function (nombre) {
      var r = totales[nombre];
      totalDiasResponsables += r.dias || 0;

      var lista = "<ul class='mov-lista'>" + r.detalle.map(function (item) {
        return "<li>" + escaparHtml(item) + "</li>";
      }).join("") + "</ul>";

      return "<tr>" +
        "<td><strong>" + escaparHtml(r.nombre) + "</strong></td>" +
        "<td>" + escaparHtml(r.areas.join("; ")) + "</td>" +
        "<td>" + lista + "</td>" +
        "<td><strong>" + r.dias + "</strong></td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='4'>No se detectaron movimientos cuantificables.</td></tr>";

    if (gruposResp.length > 0) {
      elemento("tablaTiempoResponsable").innerHTML +=
        "<tr style='background:#f8fafc; font-weight:900;'>" +
          "<td colspan='3' style='text-align:right;'>Total días laborables del trámite</td>" +
          "<td><strong>" + totalDiasResponsables + "</strong></td>" +
        "</tr>";
    }
  }

  function agruparMovimientosDetalleResponsable(movs) {
    var obj = {};
    for (var i = 0; i < movs.length; i++) {
      var m = movs[i];
      var key = m.tecnico || "Sin técnico definido";
      if (!obj[key]) {
        obj[key] = { nombre: key, dias: 0, movimientos: 0, areas: [], detalle: [], fechas: [] };
      }
      obj[key].dias += m.dias || 0;
      obj[key].movimientos += 1;
      if (obj[key].areas.indexOf(m.area) === -1) {
        obj[key].areas.push(m.area);
      }
      obj[key].detalle.push(m.movimiento + ": " + (m.dias || 0) + " día" + ((m.dias || 0) === 1 ? "" : "s"));
      obj[key].fechas.push((m.inicioTexto || "—") + " → " + (m.finTexto || "—"));
    }
    return obj;
  }

  function renderizarEficiencia() {
    var activos = tramites.filter(function (t) { return t.estadoDashboard === "Activo"; });
    var conProceso = tramites.filter(function (t) { return t.diasProceso !== null; });
    var conHabitat = tramites.filter(function (t) { return t.diasHabitat !== null; });

    if (elemento("promProcesoTotal")) {
      elemento("promProcesoTotal").textContent = promedio(conProceso.map(function (t) { return t.diasProceso; })) + " días";
    }
    if (elemento("promHabitat")) {
      elemento("promHabitat").textContent = promedio(conHabitat.map(function (t) { return t.diasHabitat; })) + " días";
    }

    var topAntiguos = activos.filter(function (t) { return t.fechaTramiteObj; })
      .sort(function (a, b) { return a.fechaTramiteObj - b.fechaTramiteObj; })
      .slice(0, 10);

    crearListaTop("topAntiguos", topAntiguos, function (t, i) {
      return itemLista(i, "eGOB " + t.egob + " · " + t.tramite, t.solicitante + " · Técnico actual: " + (t.responsableActual || "—") + " · " + (t.fechaTramite || "Sin fecha"), (t.diasProceso || 0) + " días");
    });

    var topHab = activos.filter(function (t) { return t.diasHabitat !== null; })
      .sort(function (a, b) { return b.diasHabitat - a.diasHabitat; })
      .slice(0, 10);

    crearListaTop("topHabitat", topHab, function (t, i) {
      return itemLista(i, "eGOB " + t.egob + " · " + t.tramite, t.solicitante + " · Técnico actual: " + (t.responsableActual || "—") + " · " + (t.fechaHabitat || "Sin fecha Hábitat"), (t.diasHabitat || 0) + " días");
    });

    crearGraficoBarrasHtml("rankingPromedioTecnico", rankingPromedioTecnico(), "asc");
    crearGraficoBarrasHtml("rankingDespachadosTecnico", rankingDespachadosTecnico(), "desc");
    crearGraficoBarrasHtml("rankingActivosTecnico", contarPorTecnicosActivos(activos), "desc");
    renderizarPromedioArea();
  }

  function crearListaTop(idContenedor, lista, renderItem) {
    var contenedor = elemento(idContenedor);
    if (!contenedor) return;
    if (!lista.length) {
      contenedor.innerHTML = "<div class='sin-datos'>No hay datos para mostrar.</div>";
      return;
    }

    var html = "";
    for (var i = 0; i < lista.length; i++) {
      html += renderItem(lista[i], i);
    }
    contenedor.innerHTML = html;
  }

  function itemLista(i, titulo, sub, metrica) {
    return "<div class='lista-item'>" +
      "<div class='rank'>" + (i + 1) + "</div>" +
      "<div><div class='item-title'>" + escaparHtml(titulo) + "</div><div class='item-sub'>" + escaparHtml(sub) + "</div></div>" +
      "<div class='metric'>" + escaparHtml(metrica) + "</div>" +
    "</div>";
  }

  function rankingPromedioTecnico() {
    var grupos = {};
    for (var i = 0; i < movimientos.length; i++) {
      var m = movimientos[i];
      if (!m.tecnico || m.tecnico === "Sin técnico definido") {
        continue;
      }
      if (!grupos[m.tecnico]) {
        grupos[m.tecnico] = [];
      }
      grupos[m.tecnico].push(m.dias);
    }

    var pares = Object.keys(grupos).map(function (tec) {
      return [tec, promedio(grupos[tec])];
    }).sort(function (a, b) {
      return a[1] - b[1];
    });

    var obj = {};
    for (var j = 0; j < pares.length; j++) {
      obj[pares[j][0]] = pares[j][1];
    }
    return obj;
  }

  function rankingDespachadosTecnico() {
    var despachados = {};
    for (var i = 0; i < tramites.length; i++) {
      if (tramites[i].estadoDashboard === "Despachado") {
        despachados[tramites[i].egob] = true;
      }
    }

    var resultadoSets = {};
    for (var j = 0; j < movimientos.length; j++) {
      var m = movimientos[j];
      if (!despachados[m.egob]) {
        continue;
      }
      if (!m.tecnico || m.tecnico === "Sin técnico definido") {
        continue;
      }
      if (!resultadoSets[m.tecnico]) {
        resultadoSets[m.tecnico] = {};
      }
      resultadoSets[m.tecnico][m.egob] = true;
    }

    var obj = {};
    var keys = Object.keys(resultadoSets);
    for (var k = 0; k < keys.length; k++) {
      obj[keys[k]] = Object.keys(resultadoSets[keys[k]]).length;
    }
    return obj;
  }

  function promedioPorArea(filtroTramite) {
    var grupos = {};
    for (var i = 0; i < movimientos.length; i++) {
      var m = movimientos[i];
      if (filtroTramite && m.tramite !== filtroTramite) {
        continue;
      }
      if (!grupos[m.area]) {
        grupos[m.area] = [];
      }
      grupos[m.area].push(m.dias);
    }

    var obj = {};
    var keys = Object.keys(grupos);
    for (var j = 0; j < keys.length; j++) {
      obj[keys[j]] = promedio(grupos[keys[j]]);
    }
    return obj;
  }

  function renderizarPromedioArea() {
    var filtroEl = elemento("filtroPromedioAreaTramite");
    var filtro = filtroEl ? filtroEl.value : "";
    crearGraficoBarrasHtml("promedioArea", promedioPorArea(filtro), "desc");
  }

  function renderizarPromediosPorTramite() {
    var grupos = {};
    for (var i = 0; i < tramites.length; i++) {
      var t = tramites[i];
      var key = t.tramite || "Sin dato";
      if (!grupos[key]) {
        grupos[key] = { nombre: key, cantidad: 0, totalProceso: [], totalHabitat: [] };
      }
      grupos[key].cantidad += 1;
      if (t.diasProceso !== null) {
        grupos[key].totalProceso.push(t.diasProceso);
      }
      if (t.diasHabitat !== null) {
        grupos[key].totalHabitat.push(t.diasHabitat);
      }
    }

    var filas = Object.keys(grupos).map(function (k) {
      return grupos[k];
    }).sort(function (a, b) {
      return promedio(b.totalHabitat) - promedio(a.totalHabitat);
    });

    elemento("tablaPromediosTramite").innerHTML = filas.map(function (g) {
      var promProc = promedio(g.totalProceso);
      var promHab = promedio(g.totalHabitat);
      return "<tr>" +
        "<td>" + escaparHtml(g.nombre) + "</td>" +
        "<td><strong>" + g.cantidad + "</strong></td>" +
        "<td>" + promProc + " días</td>" +
        "<td>" + promHab + " días</td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='4'>No hay datos para mostrar.</td></tr>";
  }

  function generarReporteTecnico() {
    var tecnico = elemento("selectorTecnico").value;
    if (!tecnico) {
      return;
    }

    var pendientes = tramites.filter(function (t) {
      return t.estadoDashboard === "Activo" && t.responsablesActuales && t.responsablesActuales.indexOf(tecnico) !== -1;
    });

    var movTec = movimientos.filter(function (m) {
      return m.tecnico === tecnico;
    });

    var egobsMov = {};
    for (var i = 0; i < movTec.length; i++) {
      egobsMov[movTec[i].egob] = true;
    }

    var desp = tramites.filter(function (t) {
      return t.estadoDashboard === "Despachado" && egobsMov[t.egob];
    });

    var intervino = tramites.filter(function (t) {
      return egobsMov[t.egob] || (t.responsablesActuales && t.responsablesActuales.indexOf(tecnico) !== -1);
    });

    var dias = movTec.map(function (m) {
      return m.dias;
    }).filter(function (n) {
      return isFinite(n);
    });

    var apr = 0;
    for (var j = 0; j < movTec.length; j++) {
      if (normalizarTexto(movTec[j].movimientoCodigo).replace(/\s+/g, "") === "APR.") {
        apr++;
      }
    }

    elemento("repPendientes").textContent = pendientes.length;
    elemento("repDespachados").textContent = desp.length;
    elemento("repPromedio").textContent = (dias.length ? promedio(dias) : 0) + " días";
    elemento("repMax").textContent = (dias.length ? Math.max.apply(null, dias) : 0) + " días";
    elemento("repMin").textContent = (dias.length ? Math.min.apply(null, dias) : 0) + " días";
    elemento("repAprobatorios").textContent = apr;
    elemento("repIntervenciones").textContent = intervino.length;

    var topHabTec = intervino.filter(function (t) {
      return t.diasHabitat !== null;
    }).sort(function (a, b) {
      return b.diasHabitat - a.diasHabitat;
    }).slice(0, 10);

    elemento("repHabitatMax").textContent = topHabTec.length ? topHabTec[0].diasHabitat + " días" : "0 días";

    crearListaTop("repTopHabitatTecnico", topHabTec, function (t, i) {
      return itemLista(i, "eGOB " + t.egob + " · " + t.tramite, t.solicitante + " · " + t.estadoDashboard, (t.diasHabitat || 0) + " días");
    });

    elemento("tablaReporteTecnico").innerHTML = intervino.map(function (t) {
      var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";
      return "<tr>" +
        "<td><strong>" + escaparHtml(t.egob) + "</strong></td>" +
        "<td>" + escaparHtml(t.solicitante) + "</td>" +
        "<td>" + escaparHtml(t.tramite) + "</td>" +
        "<td><span class='estado " + claseEstado + "'>" + t.estadoDashboard + "</span></td>" +
        "<td>" + (t.diasProceso === null ? "—" : t.diasProceso) + "</td>" +
        "<td>" + (t.diasHabitat === null ? "—" : t.diasHabitat) + "</td>" +
        "<td>" + escaparHtml(t.responsableActual) + "</td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='7'>No se encontraron trámites para este técnico.</td></tr>";
  }




  function normalizarTipo(texto) {
    return normalizarTexto(texto || "").replace(/\./g, "").replace(/\s+/g, " ").trim();
  }
  function iconoPorTipoTramite(tipo) {
    var t = normalizarTipo(tipo);
    if (t.indexOf("PROPIEDAD HORIZONTAL") !== -1) return "🏢";
    if (t.indexOf("URBANIZACION") !== -1) return "🏘️";
    if (t.indexOf("SUBDIVISION") !== -1) return "🧩";
    if (t.indexOf("DESMEMBRACION") !== -1) return "✂️";
    if (t.indexOf("PUBLICIDAD") !== -1) return "🪧";
    if (t.indexOf("IPRUS") !== -1) return "📋";
    if (t.indexOf("ICUS") !== -1) return "🏛️";
    if (t.indexOf("O MAYOR") !== -1 || t.indexOf("OBRA MAYOR") !== -1) return "🏗️";
    if (t.indexOf("ANTEP") !== -1 || t.indexOf("ANTEPROYECTO") !== -1) return "📝";
    if (t.indexOf("FRACCIONAMIENTO AGRICOLA") !== -1 || t.indexOf("AGRICOLA") !== -1) return "🌾";
    if (t.indexOf("RECONOCIMIENTO") !== -1 || t.indexOf("EDIFICACION") !== -1) return "🏠";
    if (t.indexOf("PRORROGA") !== -1) return "⏳";
    if (t.indexOf("MORFOLOGICO") !== -1) return "📐";
    if (t.indexOf("PETICIONES") !== -1 || t.indexOf("VARIAS") !== -1) return "✉️";
    if (t.indexOf("REESTRUCTURACION") !== -1 || t.indexOf("PARCEL") !== -1) return "🗂️";
    return "📍";
  }
  function claseEstadoMarcador(estado) {
    if (estado === "Despachado") return "despachado";
    if (estado === "Activo") return "activo";
    return "sin-estado";
  }
  function crearIconoTramite(t) {
    var emoji = iconoPorTipoTramite(t.tramite);
    var clase = claseEstadoMarcador(t.estadoDashboard);
    var titulo = escaparAtributo((t.tramite || "Trámite") + " · " + t.estadoDashboard);
    return L.divIcon({
      className: "",
      html: "<div class='tramite-marker " + clase + "' title='" + titulo + "'><span class='tramite-emoji'>" + emoji + "</span></div>",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14]
    });
  }
  function cargarCapasWmsDashboard() {
    var estado = elemento("estadoWmsDashboard");
    var select = elemento("selectWmsDashboard");
    if (!estado || !select) return;
    estado.className = "wms-estado";
    estado.textContent = "Cargando capas desde GeoServer...";
    var url = WMS_DIVISION_TERRITORIAL_URL + "?service=WMS&version=1.1.1&request=GetCapabilities";
    fetch(url)
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
      .then(function (xmlTexto) {
        var xml = new DOMParser().parseFromString(xmlTexto, "text/xml");
        var names = Array.prototype.slice.call(xml.getElementsByTagName("Name"));
        var capas = [];
        var usados = {};
        for (var i = 0; i < names.length; i++) {
          var nombre = (names[i].textContent || "").trim();
          if (!nombre || usados[nombre]) continue;
          var parent = names[i].parentNode;
          if (!parent || parent.nodeName.toLowerCase().indexOf("layer") === -1) continue;
          var titulo = nombre;
          var hijos = parent.childNodes;
          for (var h = 0; h < hijos.length; h++) {
            if (hijos[h].nodeName && hijos[h].nodeName.toLowerCase() === "title") {
              titulo = (hijos[h].textContent || nombre).trim();
              break;
            }
          }
          usados[nombre] = true;
          capas.push({ nombre: nombre, titulo: titulo });
        }
        capas.sort(function (a, b) { return a.titulo.localeCompare(b.titulo); });
        select.innerHTML = "<option value=''>Selecciona una capa territorial</option>" + capas.map(function (c) {
          return "<option value='" + escaparAtributo(c.nombre) + "'>" + escaparHtml(c.titulo + " (" + c.nombre + ")") + "</option>";
        }).join("");
        estado.className = "wms-estado ok";
        estado.textContent = capas.length + " capas encontradas. Selecciona una y presiona Agregar.";
      })
      .catch(function (err) {
        console.warn("No se pudo leer GetCapabilities WMS:", err);
        estado.className = "wms-estado error";
        estado.textContent = "No se pudo cargar la lista. Puedes escribir el nombre exacto de la capa WMS.";
      });
  }
  function agregarCapaWmsDashboard() {
    if (!mapaDashboardListo) iniciarMapaDashboard();
    if (!mapaDashboardListo) return;
    var select = elemento("selectWmsDashboard");
    var input = elemento("inputWmsManualDashboard");
    var estado = elemento("estadoWmsDashboard");
    var nombre = (select && select.value ? select.value : "").trim();
    if (!nombre && input) nombre = (input.value || "").trim();
    if (!nombre) {
      if (estado) { estado.className = "wms-estado error"; estado.textContent = "Selecciona o escribe una capa WMS."; }
      return;
    }
    if (capasWmsDashboard[nombre]) {
      if (estado) { estado.className = "wms-estado ok"; estado.textContent = "La capa ya está agregada."; }
      return;
    }
    var capa = L.tileLayer.wms(WMS_DIVISION_TERRITORIAL_URL, {
      layers: nombre,
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      opacity: 0.68,
      attribution: "GADMR GeoServer"
    });
    capa.addTo(mapaDashboard);
    capasWmsDashboard[nombre] = capa;
    if (!controlCapasWmsDashboard) {
      controlCapasWmsDashboard = L.control.layers(null, {}, { collapsed: true, position: "bottomleft" }).addTo(mapaDashboard);
    }
    controlCapasWmsDashboard.addOverlay(capa, nombre);
    if (estado) { estado.className = "wms-estado ok"; estado.textContent = "Capa agregada: " + nombre; }
  }
  function limpiarCapasWmsDashboard() {
    if (!mapaDashboardListo) return;
    Object.keys(capasWmsDashboard).forEach(function (nombre) { mapaDashboard.removeLayer(capasWmsDashboard[nombre]); });
    capasWmsDashboard = {};
    if (controlCapasWmsDashboard) { mapaDashboard.removeControl(controlCapasWmsDashboard); controlCapasWmsDashboard = null; }
    if (elemento("estadoWmsDashboard")) { elemento("estadoWmsDashboard").className = "wms-estado"; elemento("estadoWmsDashboard").textContent = "Capas territoriales retiradas."; }
  }

  function iniciarMapaDashboard() {
    if (mapaDashboardListo) return;

    if (typeof L === "undefined" || typeof proj4 === "undefined") {
      elemento("mapaDashboard").innerHTML = "<div class='sin-datos'>No se pudieron cargar las librerías del mapa.</div>";
      return;
    }

    proj4.defs("EPSG:32717", "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs");

    mapaDashboard = L.map("mapaDashboard", {
      zoomControl: true,
      preferCanvas: true
    }).setView([-1.67, -78.65], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(mapaDashboard);

    capaMarcadoresDashboard = L.layerGroup().addTo(mapaDashboard);
    renderizarLeyendaIconos();
    renderizarLeyendaWmsDashboard();
    mapaDashboardListo = true;
  }


function renderizarMapaDashboard() {
  if (!mapaDashboardListo) {
    iniciarMapaDashboard();
  }

  if (!mapaDashboardListo || !capaMarcadoresDashboard) return;

  capaMarcadoresDashboard.clearLayers();

  var q = limpiar((elemento("dashboardConsultaBusqueda") || {}).value || "");
  var filtroTramite = (elemento("dashboardMapaFiltroTramite") || {}).value || "";
  var filtroEstado = (elemento("dashboardMapaFiltroEstado") || {}).value || "";
  var filtroTecnico = (elemento("dashboardMapaFiltroTecnico") || {}).value || "";

  var puntos = [];
  var evaluados = 0;
  var invalidos = 0;

  for (var i = 0; i < tramites.length; i++) {
    var t = tramites[i];
    var texto = t.egob + " " + t.solicitante + " " + t.tramite + " " + t.responsableActual + " " + t.estadoDashboard;
    var coincideTexto = !q || limpiar(texto).indexOf(q) !== -1;
    var coincideTramite = !filtroTramite || t.tramite === filtroTramite;
    var coincideEstado = !filtroEstado || t.estadoDashboard === filtroEstado;
    var coincideTecnico = !filtroTecnico || (t.responsablesActuales || []).indexOf(filtroTecnico) !== -1;
    if (!coincideTexto || !coincideTramite || !coincideEstado || !coincideTecnico) continue;

    evaluados++;
    var x = numeroCoordenada(t.coordenadaX);
    var y = numeroCoordenada(t.coordenadaY);
    if (!isFinite(x) || !isFinite(y) || x === 0 || y === 0) {
      invalidos++;
      continue;
    }
    var punto = convertirUTMaLatLon(x, y);
    if (!punto || !isFinite(punto.lat) || !isFinite(punto.lon)) {
      invalidos++;
      continue;
    }
    t.latitud = punto.lat;
    t.longitud = punto.lon;
    puntos.push(t);
  }

  var bounds = [];
  for (var p = 0; p < puntos.length; p++) {
    var item = puntos[p];
    var marcador = L.circleMarker([item.latitud, item.longitud], {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: colorPorEstado(item.estadoDashboard),
      fillOpacity: 0.9
    });

    marcador.bindPopup(popupMapa(item));
    marcador.on("click", (function (tramiteSeleccionado) {
      return function () { mostrarTramiteIndividualDashboard(tramiteSeleccionado); };
    })(item));
    marcador.addTo(capaMarcadoresDashboard);
    bounds.push([item.latitud, item.longitud]);
  }

  if (elemento("dashboardMapaTotalPuntos")) elemento("dashboardMapaTotalPuntos").textContent = puntos.length + " puntos mapeados";
  if (elemento("dashboardMapaSinCoordenadas")) elemento("dashboardMapaSinCoordenadas").textContent = invalidos + " sin coordenadas válidas";
  if (elemento("dashboardMapaEvaluados")) elemento("dashboardMapaEvaluados").textContent = evaluados + " trámites evaluados";

  if (bounds.length > 0) {
    mapaDashboard.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  } else {
    mapaDashboard.setView([-1.67, -78.65], 12);
  }
}

function llenarFiltrosMapaDashboard() {
    var tipos = {};
    var tecnicos = {};

    for (var i = 0; i < tramites.length; i++) {
      if (tramites[i].tramite) {
        tipos[tramites[i].tramite] = true;
      }

      var reps = tramites[i].responsablesActuales || [];
      for (var j = 0; j < reps.length; j++) {
        if (reps[j] && reps[j] !== "Pendiente de cierre" && reps[j] !== "Despachado") {
          tecnicos[reps[j]] = true;
        }
      }
    }

    var listaTipos = Object.keys(tipos).sort();
    var htmlTipos = "<option value=''>Todos los tipos</option>";
    for (var a = 0; a < listaTipos.length; a++) {
      htmlTipos += "<option value='" + escaparAtributo(listaTipos[a]) + "'>" + escaparHtml(listaTipos[a]) + "</option>";
    }
    if (elemento("dashboardMapaFiltroTramite")) elemento("dashboardMapaFiltroTramite").innerHTML = htmlTipos;

    var listaTecnicos = Object.keys(tecnicos).sort();
    var htmlTecnicos = "<option value=''>Todos los técnicos</option>";
    for (var b = 0; b < listaTecnicos.length; b++) {
      htmlTecnicos += "<option value='" + escaparAtributo(listaTecnicos[b]) + "'>" + escaparHtml(listaTecnicos[b]) + "</option>";
    }
    if (elemento("dashboardMapaFiltroTecnico")) elemento("dashboardMapaFiltroTecnico").innerHTML = htmlTecnicos;
  }

  function llenarFiltrosMapa() {
    var tipos = {};
    var tecnicos = {};

    for (var i = 0; i < tramites.length; i++) {
      if (tramites[i].tramite) {
        tipos[tramites[i].tramite] = true;
      }

      var reps = tramites[i].responsablesActuales || [];
      for (var j = 0; j < reps.length; j++) {
        if (reps[j] && reps[j] !== "Pendiente de cierre" && reps[j] !== "Despachado") {
          tecnicos[reps[j]] = true;
        }
      }
    }

    var listaTipos = Object.keys(tipos).sort();
    var htmlTipos = "<option value=''>Todos los tipos</option>";
    for (var a = 0; a < listaTipos.length; a++) {
      htmlTipos += "<option value='" + escaparAtributo(listaTipos[a]) + "'>" + escaparHtml(listaTipos[a]) + "</option>";
    }
    elemento("mapaFiltroTramite").innerHTML = htmlTipos;

    var listaTecnicos = Object.keys(tecnicos).sort();
    var htmlTecnicos = "<option value=''>Todos los técnicos</option>";
    for (var b = 0; b < listaTecnicos.length; b++) {
      htmlTecnicos += "<option value='" + escaparAtributo(listaTecnicos[b]) + "'>" + escaparHtml(listaTecnicos[b]) + "</option>";
    }
    elemento("mapaFiltroTecnico").innerHTML = htmlTecnicos;
  }

  function iniciarMapa() {
    if (mapaListo) {
      return;
    }

    if (typeof L === "undefined" || typeof proj4 === "undefined") {
      elemento("mapaTramites").innerHTML = "<div class='sin-datos'>No se pudieron cargar las librerías del mapa. Revisa la conexión a internet.</div>";
      return;
    }

    proj4.defs("EPSG:32717", "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs");

    mapa = L.map("mapaTramites", {
      zoomControl: true,
      preferCanvas: true
    }).setView([-1.67, -78.65], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(mapa);

    capaMarcadores = L.layerGroup().addTo(mapa);
    agregarLeyendaMapa();
    mapaListo = true;
  }

  function agregarLeyendaMapa() {
    if (!mapa || controlLeyenda) {
      return;
    }

    controlLeyenda = L.control({ position: "bottomright" });
    controlLeyenda.onAdd = function () {
      var div = L.DomUtil.create("div", "leyenda-mapa");
      div.innerHTML =
        "<strong>Estado</strong>" +
        "<div class='leyenda-item'><span class='leyenda-color' style='background:#218838'></span>Despachado</div>" +
        "<div class='leyenda-item'><span class='leyenda-color' style='background:#b7791f'></span>Activo</div>" +
        "<div class='leyenda-item'><span class='leyenda-color' style='background:#6d5bd0'></span>Sin estado</div>";
      return div;
    };
    controlLeyenda.addTo(mapa);
  }

  function renderizarMapa() {
    if (!mapaListo) {
      iniciarMapa();
    }

    if (!mapaListo || !capaMarcadores) {
      return;
    }

    capaMarcadores.clearLayers();

    var busqueda = limpiar(elemento("mapaBusqueda").value);
    var filtroTramite = elemento("mapaFiltroTramite").value;
    var filtroEstado = elemento("mapaFiltroEstado").value;
    var filtroTecnico = elemento("mapaFiltroTecnico").value;

    var puntos = [];
    var invalidos = [];
    var evaluados = 0;
    var conXYTexto = 0;
    var conXYNumero = 0;
    var primerX = "";
    var primerY = "";

    for (var i = 0; i < tramites.length; i++) {
      var t = tramites[i];

      var coincideTexto = true;
      if (busqueda) {
        var texto = t.egob + " " + t.solicitante + " " + t.tramite + " " + t.responsableActual;
        coincideTexto = limpiar(texto).indexOf(busqueda) !== -1;
      }

      var coincideTramite = !filtroTramite || t.tramite === filtroTramite;
      var coincideEstado = !filtroEstado || t.estadoDashboard === filtroEstado;
      var coincideTecnico = !filtroTecnico || (t.responsablesActuales || []).indexOf(filtroTecnico) !== -1;

      if (!coincideTexto || !coincideTramite || !coincideEstado || !coincideTecnico) {
        continue;
      }

      evaluados++;

      var xTexto = String(t.coordenadaX || "").trim();
      var yTexto = String(t.coordenadaY || "").trim();

      if ((xTexto || yTexto) && !primerX && !primerY) {
        primerX = t.coordenadaX;
        primerY = t.coordenadaY;
      }

      if (xTexto !== "" && yTexto !== "") {
        conXYTexto++;
      }

      if (xTexto === "" && yTexto === "") {
        invalidos.push({ tramite: t, motivo: "Sin Coordenadas_X y Coordenadas_Y" });
        continue;
      }

      if (xTexto === "") {
        invalidos.push({ tramite: t, motivo: "Falta Coordenadas_X" });
        continue;
      }

      if (yTexto === "") {
        invalidos.push({ tramite: t, motivo: "Falta Coordenadas_Y" });
        continue;
      }

      var x = numeroCoordenada(t.coordenadaX);
      var y = numeroCoordenada(t.coordenadaY);

      if (isFinite(x) && isFinite(y)) {
        conXYNumero++;
      }

      if (!isFinite(x) || !isFinite(y)) {
        invalidos.push({ tramite: t, motivo: "Coordenadas con formato no numérico" });
        continue;
      }

      if (x === 0 || y === 0) {
        invalidos.push({ tramite: t, motivo: "Coordenadas en cero" });
        continue;
      }

      var punto = convertirUTMaLatLon(x, y);
      if (!punto || !isFinite(punto.lat) || !isFinite(punto.lon)) {
        invalidos.push({ tramite: t, motivo: "No se pudo convertir de UTM a latitud/longitud" });
        continue;
      }

      t.latitud = punto.lat;
      t.longitud = punto.lon;
      puntos.push(t);
    }

    var bounds = [];

    for (var p = 0; p < puntos.length; p++) {
      var item = puntos[p];
      var color = colorPorEstado(item.estadoDashboard);

      var marcador = L.marker([item.latitud, item.longitud], {
        icon: crearIconoTramite(item)
      });

      marcador.bindPopup(popupMapa(item));
      marcador.addTo(capaMarcadores);
      bounds.push([item.latitud, item.longitud]);
    }

    if (bounds.length > 0) {
      mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else {
      mapa.setView([-1.67, -78.65], 12);
    }

    elemento("mapaTotalPuntos").textContent = puntos.length + " puntos mapeados";
    elemento("mapaSinCoordenadas").textContent = invalidos.length + " trámites sin coordenadas válidas";
    elemento("mapaEvaluados").textContent = evaluados + " trámites evaluados";
    elemento("mapaDebugCoord").textContent = "XY texto: " + conXYTexto + " · XY número: " + conXYNumero + " · 1ra: " + (primerX || "—") + " / " + (primerY || "—");

    console.log("Mapa V16", {
      evaluados: evaluados,
      puntos: puntos.length,
      invalidos: invalidos.length,
      conXYTexto: conXYTexto,
      conXYNumero: conXYNumero,
      primerX: primerX,
      primerY: primerY
    });

    renderizarTablaMapa(puntos);
    renderizarTablaMapaInvalidos(invalidos);
  }

  function numeroCoordenada(valor) {
    if (valor === null || valor === undefined) {
      return NaN;
    }

    var s = String(valor).trim();
    if (!s) {
      return NaN;
    }

    s = s.replace(/\s/g, "");

    // Caso ecuatoriano frecuente: 763964,83
    if (s.indexOf(",") !== -1 && s.indexOf(".") === -1) {
      s = s.replace(",", ".");
      return parseFloat(s);
    }

    // Caso con punto de miles y coma decimal: 763.964,83
    if (s.indexOf(".") !== -1 && s.indexOf(",") !== -1) {
      s = s.replace(/\./g, "").replace(",", ".");
      return parseFloat(s);
    }

    return parseFloat(s);
  }

  function convertirUTMaLatLon(x, y) {
    try {
      var resultado = proj4("EPSG:32717", "WGS84", [x, y]);
      return {
        lon: resultado[0],
        lat: resultado[1]
      };
    } catch (e) {
      console.error("Error convirtiendo coordenada", x, y, e);
      return null;
    }
  }

  function colorPorEstado(estado) {
    if (estado === "Despachado") {
      return "#218838";
    }
    if (estado === "Activo") {
      return "#b7791f";
    }
    return "#6d5bd0";
  }

  function popupMapa(t) {
    return "<div class='mapa-popup'>" +
      "<h3>eGOB " + escaparHtml(t.egob || "—") + "</h3>" +
      "<div class='linea'><strong>Solicitante:</strong> " + escaparHtml(t.solicitante || "—") + "</div>" +
      "<div class='linea'><strong>Trámite:</strong> " + escaparHtml(t.tramite || "—") + "</div>" +
      "<div class='linea'><strong>Estado dashboard:</strong> " + escaparHtml(t.estadoDashboard || "—") + "</div>" +
      "<div class='linea'><strong>Estado matriz:</strong> " + escaparHtml(obtener(t.raw, ["estado_tramite", "estado trámite", "estado"]) || "—") + "</div>" +
      "<div class='linea'><strong>Técnico actual:</strong> " + escaparHtml(t.responsableActual || "—") + "</div>" +
      "<div class='linea'><strong>X:</strong> " + escaparHtml(t.coordenadaX || "—") + "</div>" +
      "<div class='linea'><strong>Y:</strong> " + escaparHtml(t.coordenadaY || "—") + "</div>" +
      "<div class='linea'><strong>Lat/Lon:</strong> " + t.latitud.toFixed(6) + ", " + t.longitud.toFixed(6) + "</div>" +
      "</div>";
  }


  function renderizarTablaMapaInvalidos(invalidos) {
    elemento("tablaMapaInvalidos").innerHTML = invalidos.map(function (item) {
      var t = item.tramite;
      var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";
      return "<tr>" +
        "<td><strong>" + escaparHtml(t.egob || "—") + "</strong></td>" +
        "<td>" + escaparHtml(t.solicitante || "—") + "</td>" +
        "<td>" + escaparHtml(t.tramite || "—") + "</td>" +
        "<td><span class='estado " + claseEstado + "'>" + escaparHtml(t.estadoDashboard || "—") + "</span></td>" +
        "<td>" + escaparHtml(t.responsableActual || "—") + "</td>" +
        "<td>" + escaparHtml(t.coordenadaX || "—") + "</td>" +
        "<td>" + escaparHtml(t.coordenadaY || "—") + "</td>" +
        "<td>" + escaparHtml(item.motivo || "Coordenada inválida") + "</td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='8'>No hay registros con coordenadas inválidas según los filtros actuales.</td></tr>";
  }

  function renderizarTablaMapa(puntos) {
    elemento("tablaMapa").innerHTML = puntos.map(function (t) {
      var claseEstado = t.estadoDashboard === "Despachado" ? "despachado" : "activo";
      return "<tr>" +
        "<td><strong>" + escaparHtml(t.egob) + "</strong></td>" +
        "<td>" + escaparHtml(t.solicitante) + "</td>" +
        "<td>" + escaparHtml(t.tramite) + "</td>" +
        "<td><span class='estado " + claseEstado + "'>" + escaparHtml(t.estadoDashboard) + "</span></td>" +
        "<td>" + escaparHtml(t.responsableActual || "—") + "</td>" +
        "<td>" + escaparHtml(t.coordenadaX || "—") + "</td>" +
        "<td>" + escaparHtml(t.coordenadaY || "—") + "</td>" +
        "<td>" + (t.latitud ? t.latitud.toFixed(6) : "—") + "</td>" +
        "<td>" + (t.longitud ? t.longitud.toFixed(6) : "—") + "</td>" +
      "</tr>";
    }).join("") || "<tr><td colspan='9'>No hay puntos para mostrar con los filtros actuales.</td></tr>";
  }

  function cambiarPestana(id) {
    var botones = document.querySelectorAll(".pestana");
    for (var i = 0; i < botones.length; i++) {
      botones[i].classList.toggle("activa", botones[i].getAttribute("data-tab") === id);
    }

    var secciones = document.querySelectorAll(".seccion");
    for (var j = 0; j < secciones.length; j++) {
      secciones[j].classList.toggle("activa", secciones[j].id === id);
    }

    if (id === "tab-mapa") {
      setTimeout(function () {
        iniciarMapa();
        renderizarMapa();
        if (mapa) {
          mapa.invalidateSize();
        }
      }, 150);
    }

    if (id === "tab-dashboard") {
      setTimeout(function () {
        iniciarMapaDashboard();
        renderizarMapaDashboard();
        if (mapaDashboard) {
          mapaDashboard.invalidateSize();
        }
      }, 150);
    }
  }

  function parseFecha(texto) {
    if (!texto) {
      return null;
    }
    var s = String(texto).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) {
      return null;
    }
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  function diasCalendario(inicio, fin) {
    if (!inicio || !fin) {
      return null;
    }
    var a = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    var b = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function diasLaborables(inicio, fin) {
    if (!inicio || !fin) {
      return 0;
    }

    var a = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    var b = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

    if (a.getTime() === b.getTime()) {
      return 1;
    }

    var start = a <= b ? a : b;
    var end = a <= b ? b : a;
    var count = 0;
    var feriadosSet = {};
    for (var i = 0; i < FERIADOS.length; i++) {
      feriadosSet[normalizarFechaTexto(FERIADOS[i])] = true;
    }

    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var day = d.getDay();
      var fechaTxt = normalizarFechaTexto(formatoFecha(d));
      if (day !== 0 && day !== 6 && !feriadosSet[fechaTxt]) {
        count++;
      }
    }

    return count;
  }

  function normalizarFechaTexto(fecha) {
    var f = parseFecha(fecha);
    if (!f) {
      return fecha;
    }
    var dd = String(f.getDate()).padStart(2, "0");
    var mm = String(f.getMonth() + 1).padStart(2, "0");
    var yyyy = f.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  }

  function formatoFecha(fecha) {
    if (!fecha) {
      return "";
    }
    var dd = String(fecha.getDate()).padStart(2, "0");
    var mm = String(fecha.getMonth() + 1).padStart(2, "0");
    var yyyy = fecha.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  }

  function promedio(arr) {
    var nums = arr.filter(function (n) { return isFinite(n); });
    if (!nums.length) {
      return 0;
    }
    var suma = 0;
    for (var i = 0; i < nums.length; i++) {
      suma += nums[i];
    }
    return Math.round(suma / nums.length);
  }

  function normalizarTexto(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function limpiar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escaparHtml(texto) {
    return String(texto || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "&#39;")
      .replace(/"/g, "&quot;");
  }

  function escaparAtributo(texto) {
    return escaparHtml(texto).replace(/`/g, "&#96;");
  }

  function actualizarFechaActual() {
    elemento("fechaActual").textContent = new Intl.DateTimeFormat(CONFIG.FORMATO_FECHA, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
  }

  function horaActual() {
    return new Intl.DateTimeFormat(CONFIG.FORMATO_FECHA, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
  }

  function mostrarAviso(mensaje, esError) {
    elemento("aviso").style.display = "block";
    elemento("aviso").textContent = mensaje;
    if (esError) {
      elemento("aviso").classList.add("error");
    } else {
      elemento("aviso").classList.remove("error");
    }
  }

  function ocultarAviso() {
    elemento("aviso").style.display = "none";
    elemento("aviso").textContent = "";
    elemento("aviso").classList.remove("error");
  }
})();
