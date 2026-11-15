
"use strict";

/* ============================================================
   SMART CLASSROOM — HISTORIAL DE MEDICIONES REALES
   Universidad de El Salvador

   Backend: Rust + Axum + SQLx en Render
   Base de datos: PostgreSQL / Supabase
   Endpoint: GET /api/mediciones

   Funcionalidades:
   - Temperatura y humedad relativa
   - Tres aulas reales
   - Filtros por aula, sensor, variable y fechas
   - Búsqueda de registros
   - Paginación de 10 registros
   - Estadísticas ambientales
   - Exportación CSV compatible con Excel

   No genera mediciones ficticias.
   No modifica registros históricos.
   ============================================================ */

(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {

        // ====================================================
        // 1. CONFIGURACIÓN
        // ====================================================

        const LIMITE_POR_PAGINA = 10;
        const LIMITE_API = 5000;
        const ZONA_HORARIA = "America/El_Salvador";

        const API = window.SmartClassroomAPI;

        const AULAS = [
            {
                id: "c337d423-65ff-4867-bbac-6819ff0b016e",
                codigo: "AULA-2B",
                nombre: "AULA-2B"
            },
            {
                id: "704f12e8-1dd7-4130-bfed-4e4b6019d719",
                codigo: "AULA-A6",
                nombre: "AULA-A6"
            },
            {
                id: "c38f5f0d-b44c-449d-a428-fd7369f7209d",
                codigo: "AULA-PRUEBAS",
                nombre: "AULA-PRUEBAS"
            }
        ];

        // ====================================================
        // 2. ELEMENTOS HTML
        // ====================================================

        const $ = id => document.getElementById(id);

        const formFiltros = $("form-filtros");
        const filtroAula = $("filtro-aula");
        const filtroSensor = $("filtro-sensor");
        const filtroVariable = $("filtro-variable");

        const fechaInicial = $("fecha-inicial");
        const fechaFinal = $("fecha-final");

        const botonBuscar = $("boton-buscar");
        const botonLimpiar = $("boton-limpiar");
        const botonExportar = $("boton-exportar");

        const campoBusqueda = $("history-search");

        const mensaje = $("mensaje");

        const tabla = $("tabla-mediciones");
        const tablaCuerpo = $("tabla-cuerpo");
        const estadoVacio = $("history-empty");

        const paginacion = $("paginacion");
        const botonAnterior = $("boton-anterior");
        const botonSiguiente = $("boton-siguiente");

        const textoPagina = $("texto-pagina");
        const resumenPagina = $("history-page-summary");

        const descripcionResultados =
            $("history-results-description");

        const totalElemento = $("history-total");
        const temperaturaElemento = $("history-temp-avg");
        const humedadElemento = $("history-humidity-avg");
        const aulasElemento = $("history-classrooms");

        const aviso = $("history-notice");
        const estadoConexion = $("connection-status");
        const estadoSidebar = $("sidebar-status-text");

        // ====================================================
        // 3. COMPROBACIONES
        // ====================================================

        if (
            !formFiltros ||
            !tabla ||
            !tablaCuerpo ||
            !paginacion
        ) {
            console.error(
                "SMART CLASSROOM: faltan elementos HTML del historial."
            );
            return;
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }

        if (!API || typeof API.get !== "function") {
            if (mensaje) {
                mensaje.textContent =
                    "No se pudo inicializar el cliente API.";
            }

            if (aviso) {
                aviso.textContent =
                    "Error: comprueba que api.js se cargue antes de historial.js.";
            }

            return;
        }

        // ====================================================
        // 4. ESTADO DEL MÓDULO
        // ====================================================

        let paginaActual = 1;
        let totalPaginas = 1;

        let mediciones = [];
        let medicionesFiltradas = [];

        let numeroSolicitud = 0;
        let consultaLimitada = false;

        // ====================================================
        // 5. CONFIGURAR AULAS
        // ====================================================

        function configurarAulas() {
            if (!filtroAula) return;

            const seleccionAnterior = filtroAula.value;

            filtroAula.replaceChildren();

            const opcionTodas =
                document.createElement("option");

            opcionTodas.value = "";
            opcionTodas.textContent = "Todas las aulas";

            filtroAula.appendChild(opcionTodas);

            for (const aula of AULAS) {
                const opcion =
                    document.createElement("option");

                opcion.value = aula.id;
                opcion.textContent =
                    `${aula.codigo} · ${aula.nombre}`;

                filtroAula.appendChild(opcion);
            }

            const existe = AULAS.some(
                aula => aula.id === seleccionAnterior
            );

            filtroAula.value = existe
                ? seleccionAnterior
                : "";
        }

        // ====================================================
        // 6. UTILIDADES
        // ====================================================

        function redondear(valor, decimales = 1) {
            if (!Number.isFinite(valor)) {
                return "—";
            }

            return valor.toFixed(decimales);
        }

        function nombreAula(aulaId) {
            const aula = AULAS.find(
                item => item.id === aulaId
            );

            return aula
                ? aula.nombre
                : aulaId || "Aula desconocida";
        }

        function nombreVariable(variable) {
            switch (variable) {
                case "temperatura":
                    return "Temperatura";

                case "humedad":
                    return "Humedad relativa";

                default:
                    return "Variable desconocida";
            }
        }

        function obtenerFechaObjeto(fechaHora) {
            if (!fechaHora) return null;

            const fecha = new Date(fechaHora);

            return Number.isFinite(fecha.getTime())
                ? fecha
                : null;
        }

        function formatearFecha(fechaHora) {
            const fecha = obtenerFechaObjeto(fechaHora);

            if (!fecha) return "—";

            return new Intl.DateTimeFormat("es-SV", {
                timeZone: ZONA_HORARIA,
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }).format(fecha);
        }

        function obtenerFechaSimple(fechaHora) {
            const fecha = obtenerFechaObjeto(fechaHora);

            if (!fecha) return "";

            const partes = new Intl.DateTimeFormat(
                "en-US",
                {
                    timeZone: ZONA_HORARIA,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }
            ).formatToParts(fecha);

            const obtener = tipo =>
                partes.find(parte => parte.type === tipo)?.value;

            return [
                obtener("year"),
                obtener("month"),
                obtener("day")
            ].join("-");
        }

        function mostrarMensaje(texto) {
            if (!mensaje) return;

            mensaje.textContent = texto;
            mensaje.hidden = !texto;
        }

        function ocultarMensaje() {
            if (!mensaje) return;

            mensaje.textContent = "";
            mensaje.hidden = true;
        }

        function actualizarAviso(texto) {
            if (aviso) {
                aviso.textContent = texto;
            }
        }

        function actualizarConexion(conectado) {
            if (estadoConexion) {
                estadoConexion.textContent = conectado
                    ? "API conectada"
                    : "API desconectada";
            }

            if (estadoSidebar) {
                estadoSidebar.textContent = conectado
                    ? "Backend conectado"
                    : "Backend desconectado";
            }

            const punto = $("sidebar-status-dot");

            if (punto) {
                punto.style.backgroundColor = conectado
                    ? "#22c55e"
                    : "#ef4444";
            }
        }

        // ====================================================
        // 7. VALIDAR FECHAS
        // ====================================================

        function fechasValidas() {
            const inicio = fechaInicial?.value || "";
            const final = fechaFinal?.value || "";

            if (inicio && final && inicio > final) {
                mostrarMensaje(
                    "La fecha inicial no puede ser posterior a la fecha final."
                );
                return false;
            }

            return true;
        }

        // ====================================================
        // 8. CONSTRUIR CONSULTA HTTP
        // ====================================================

        function construirConsulta() {
            const parametros = new URLSearchParams();

            parametros.set(
                "limit",
                String(LIMITE_API)
            );

            const aulaId = filtroAula?.value || "";

            if (aulaId) {
                parametros.set("aula_id", aulaId);
            }

            const inicio = fechaInicial?.value || "";
            const final = fechaFinal?.value || "";

            if (inicio) {
                const fechaInicio = new Date(
                    `${inicio}T00:00:00-06:00`
                );

                parametros.set(
                    "desde",
                    fechaInicio.toISOString()
                );
            }

            if (final) {
                const fechaFin = new Date(
                    `${final}T23:59:59.999-06:00`
                );

                parametros.set(
                    "hasta",
                    fechaFin.toISOString()
                );
            }

            return parametros;
        }

        // ====================================================
        // 9. NORMALIZAR MEDICIONES REALES
        // ====================================================

        function normalizarMediciones(registros) {
            const resultado = [];

            for (const registro of registros) {
                if (
                    registro.valor === null ||
                    registro.valor === undefined ||
                    registro.valor === ""
                ) {
                    continue;
                }

                const valor = Number(registro.valor);

                const fecha = obtenerFechaObjeto(
                    registro.medido_en
                );

                if (
                    !fecha ||
                    !Number.isFinite(valor)
                ) {
                    continue;
                }

                const variable = String(
                    registro.tipo_sensor || ""
                ).trim().toLowerCase();

                if (
                    variable !== "temperatura" &&
                    variable !== "humedad"
                ) {
                    continue;
                }

                resultado.push({
                    id: registro.id,

                    fecha_hora: registro.medido_en,
                    fechaObjeto: fecha,

                    aula_id: registro.aula_id,
                    aula: nombreAula(registro.aula_id),

                    sensor: "DHT22",
                    sensor_id: "dht22",

                    dispositivo_id:
                        registro.dispositivo_id,

                    variable,
                    variable_nombre:
                        nombreVariable(variable),

                    valor,

                    unidad:
                        registro.unidad ||
                        (variable === "temperatura"
                            ? "°C"
                            : "%"),

                    // No se inventan estados históricos.
                    estado: "Registrada"
                });
            }

            resultado.sort(
                (a, b) =>
                    b.fechaObjeto.getTime() -
                    a.fechaObjeto.getTime()
            );

            return resultado;
        }

        // ====================================================
        // 10. CARGAR MEDICIONES DESDE RENDER
        // ====================================================

        async function cargarMediciones() {
            if (!fechasValidas()) return;

            const solicitud = ++numeroSolicitud;

            if (botonBuscar) {
                botonBuscar.disabled = true;
            }

            actualizarAviso(
                "Consultando mediciones reales en PostgreSQL..."
            );

            try {
                const parametros = construirConsulta();

                const ruta =
                    `/api/mediciones?${parametros.toString()}`;

                const respuesta = await API.get(ruta);

                if (solicitud !== numeroSolicitud) {
                    return;
                }

                if (!Array.isArray(respuesta)) {
                    throw new Error(
                        "El backend no devolvió un arreglo de mediciones."
                    );
                }

                consultaLimitada =
                    respuesta.length >= LIMITE_API;

                mediciones = normalizarMediciones(
                    respuesta
                );

                paginaActual = 1;

                ocultarMensaje();
                actualizarConexion(true);

                aplicarFiltros();

                const advertencia = consultaLimitada
                    ? ` Se alcanzó el límite de ${LIMITE_API} registros; pueden existir más mediciones.`
                    : "";

                actualizarAviso(
                    `Se consultaron ${mediciones.length} mediciones reales.${advertencia}`
                );

                console.log(
                    "SMART CLASSROOM - Historial:",
                    {
                        registros: mediciones.length,
                        limiteAlcanzado: consultaLimitada,
                        endpoint: ruta
                    }
                );

            } catch (error) {
                if (solicitud !== numeroSolicitud) {
                    return;
                }

                console.error(
                    "SMART CLASSROOM - Error en historial:",
                    error
                );

                mediciones = [];
                medicionesFiltradas = [];

                paginaActual = 1;

                actualizarConexion(false);
                aplicarFiltros();

                actualizarAviso(
                    "No se pudieron consultar las mediciones."
                );

                mostrarMensaje(
                    "Error al consultar el historial: " +
                    error.message
                );

            } finally {
                if (
                    solicitud === numeroSolicitud &&
                    botonBuscar
                ) {
                    botonBuscar.disabled = false;
                }
            }
        }

        // ====================================================
        // 11. FILTRAR MEDICIONES
        // ====================================================

        function aplicarFiltros() {
            if (!fechasValidas()) return;

            const aulaSeleccionada =
                filtroAula?.value || "";

            const sensorSeleccionado =
                filtroSensor?.value || "";

            const variableSeleccionada =
                filtroVariable?.value || "";

            const inicio = fechaInicial?.value || "";
            const final = fechaFinal?.value || "";

            const busqueda = String(
                campoBusqueda?.value || ""
            ).trim().toLowerCase();

            medicionesFiltradas = mediciones.filter(
                medicion => {

                    if (
                        aulaSeleccionada &&
                        medicion.aula_id !== aulaSeleccionada
                    ) {
                        return false;
                    }

                    if (
                        sensorSeleccionado &&
                        ![
                            medicion.sensor_id,
                            medicion.sensor
                        ].some(
                            valor =>
                                String(valor).toLowerCase() ===
                                sensorSeleccionado.toLowerCase()
                        )
                    ) {
                        return false;
                    }

                    if (
                        variableSeleccionada &&
                        medicion.variable !==
                        variableSeleccionada.toLowerCase()
                    ) {
                        return false;
                    }

                    const fecha = obtenerFechaSimple(
                        medicion.fecha_hora
                    );

                    if (inicio && fecha < inicio) {
                        return false;
                    }

                    if (final && fecha > final) {
                        return false;
                    }

                    if (busqueda) {
                        const contenido = [
                            medicion.id,
                            medicion.aula,
                            medicion.sensor,
                            medicion.dispositivo_id,
                            medicion.variable,
                            medicion.variable_nombre,
                            medicion.valor,
                            medicion.unidad,
                            medicion.estado,
                            formatearFecha(
                                medicion.fecha_hora
                            )
                        ].join(" ").toLowerCase();

                        if (!contenido.includes(busqueda)) {
                            return false;
                        }
                    }

                    return true;
                }
            );

            totalPaginas = Math.max(
                1,
                Math.ceil(
                    medicionesFiltradas.length /
                    LIMITE_POR_PAGINA
                )
            );

            paginaActual = Math.min(
                paginaActual,
                totalPaginas
            );

            actualizarResumen();
            mostrarTabla();
            actualizarPaginacion();
        }

        // ====================================================
        // 12. ESTADÍSTICAS
        // ====================================================

        function promedio(valores) {
            const validos = valores.filter(
                Number.isFinite
            );

            if (validos.length === 0) {
                return null;
            }

            const suma = validos.reduce(
                (total, valor) => total + valor,
                0
            );

            return suma / validos.length;
        }

        function actualizarResumen() {
            const temperaturas = medicionesFiltradas
                .filter(
                    medicion =>
                        medicion.variable === "temperatura"
                )
                .map(medicion => medicion.valor);

            const humedades = medicionesFiltradas
                .filter(
                    medicion =>
                        medicion.variable === "humedad"
                )
                .map(medicion => medicion.valor);

            const promedioTemperatura =
                promedio(temperaturas);

            const promedioHumedad =
                promedio(humedades);

            const aulas = new Set(
                medicionesFiltradas
                    .map(medicion => medicion.aula_id)
                    .filter(Boolean)
            );

            if (totalElemento) {
                totalElemento.textContent =
                    medicionesFiltradas.length;
            }

            if (temperaturaElemento) {
                temperaturaElemento.textContent =
                    promedioTemperatura === null
                        ? "—"
                        : `${redondear(promedioTemperatura)} °C`;
            }

            if (humedadElemento) {
                humedadElemento.textContent =
                    promedioHumedad === null
                        ? "—"
                        : `${redondear(promedioHumedad)} %`;
            }

            if (aulasElemento) {
                aulasElemento.textContent =
                    aulas.size;
            }

            if (descripcionResultados) {
                descripcionResultados.textContent =
                    `${medicionesFiltradas.length} registros encontrados.`;
            }
        }

        // ====================================================
        // 13. CREAR CELDAS SEGURAS
        // ====================================================

        function crearCelda(texto, clase = "") {
            const celda = document.createElement("td");

            celda.textContent = String(texto ?? "—");

            if (clase) {
                celda.className = clase;
            }

            return celda;
        }

        function crearCeldaVariable(medicion) {
            const celda = document.createElement("td");

            const etiqueta =
                document.createElement("span");

            etiqueta.className =
                "history-variable";

            const punto =
                document.createElement("span");

            punto.className =
                "history-variable-dot";

            if (medicion.variable === "humedad") {
                punto.classList.add("humidity");
            }

            const texto =
                document.createElement("span");

            texto.textContent =
                medicion.variable_nombre;

            etiqueta.append(punto, texto);
            celda.appendChild(etiqueta);

            return celda;
        }

        function crearCeldaEstado(estado) {
            const celda = document.createElement("td");

            const etiqueta =
                document.createElement("span");

            etiqueta.className =
                "history-status";

            const punto =
                document.createElement("span");

            punto.className =
                "history-status-dot";

            const texto =
                document.createElement("span");

            texto.textContent = estado;

            etiqueta.append(punto, texto);
            celda.appendChild(etiqueta);

            return celda;
        }

        // ====================================================
        // 14. MOSTRAR TABLA
        // ====================================================

        function mostrarTabla() {
            tablaCuerpo.replaceChildren();

            const total = medicionesFiltradas.length;

            if (total === 0) {
                tabla.hidden = true;

                if (estadoVacio) {
                    estadoVacio.hidden = false;
                }

                return;
            }

            tabla.hidden = false;

            if (estadoVacio) {
                estadoVacio.hidden = true;
            }

            const inicio =
                (paginaActual - 1) *
                LIMITE_POR_PAGINA;

            const registros = medicionesFiltradas.slice(
                inicio,
                inicio + LIMITE_POR_PAGINA
            );

            for (const medicion of registros) {
                const fila =
                    document.createElement("tr");

                fila.appendChild(
                    crearCelda(
                        formatearFecha(
                            medicion.fecha_hora
                        ),
                        "history-date"
                    )
                );

                fila.appendChild(
                    crearCelda(
                        medicion.aula,
                        "history-classroom"
                    )
                );

                fila.appendChild(
                    crearCelda(
                        medicion.sensor,
                        "history-sensor"
                    )
                );

                fila.appendChild(
                    crearCeldaVariable(medicion)
                );

                fila.appendChild(
                    crearCelda(
                        `${redondear(medicion.valor)} ${medicion.unidad}`,
                        "history-value"
                    )
                );

                fila.appendChild(
                    crearCeldaEstado(
                        medicion.estado
                    )
                );

                tablaCuerpo.appendChild(fila);
            }
        }

        // ====================================================
        // 15. PAGINACIÓN
        // ====================================================

        function actualizarPaginacion() {
            const total = medicionesFiltradas.length;

            totalPaginas = Math.max(
                1,
                Math.ceil(total / LIMITE_POR_PAGINA)
            );

            paginaActual = Math.min(
                paginaActual,
                totalPaginas
            );

            const inicio = total === 0
                ? 0
                : (paginaActual - 1) *
                  LIMITE_POR_PAGINA + 1;

            const fin = Math.min(
                paginaActual * LIMITE_POR_PAGINA,
                total
            );

            if (textoPagina) {
                textoPagina.textContent =
                    `Página ${paginaActual} de ${totalPaginas}`;
            }

            if (resumenPagina) {
                resumenPagina.textContent =
                    `Mostrando ${inicio}–${fin} de ${total} registros`;
            }

            if (botonAnterior) {
                botonAnterior.disabled =
                    paginaActual <= 1;
            }

            if (botonSiguiente) {
                botonSiguiente.disabled =
                    paginaActual >= totalPaginas;
            }

            paginacion.hidden = total === 0;
        }

        function irPaginaAnterior() {
            if (paginaActual <= 1) return;

            paginaActual--;

            mostrarTabla();
            actualizarPaginacion();
        }

        function irPaginaSiguiente() {
            if (paginaActual >= totalPaginas) {
                return;
            }

            paginaActual++;

            mostrarTabla();
            actualizarPaginacion();
        }

        // ====================================================
        // 16. EXPORTAR CSV PARA EXCEL
        // ====================================================

        function escaparCSV(valor) {
            const texto = String(valor ?? "");

            // Escapar comillas y separadores.
            const escapado = texto.replace(/"/g, '""');

            // Proteger contra interpretación de fórmulas
            // al abrir datos de texto en Excel.
            const protegido = /^[=+\-@\t\r]/.test(texto)
                ? "'" + escapado
                : escapado;

            return `"${protegido}"`;
        }

        function exportarCSV() {
            if (medicionesFiltradas.length === 0) {
                mostrarMensaje(
                    "No hay registros para exportar."
                );
                return;
            }

            const encabezados = [
                "ID",
                "Fecha y hora",
                "Aula",
                "Sensor",
                "Dispositivo",
                "Variable",
                "Valor",
                "Unidad",
                "Estado"
            ];

            const filas = [
                encabezados
            ];

            for (const medicion of medicionesFiltradas) {
                filas.push([
                    medicion.id,
                    formatearFecha(medicion.fecha_hora),
                    medicion.aula,
                    medicion.sensor,
                    medicion.dispositivo_id,
                    medicion.variable_nombre,
                    medicion.valor,
                    medicion.unidad,
                    medicion.estado
                ]);
            }

            // CSV con punto y coma para Excel regional.
            const contenido = filas
                .map(fila =>
                    fila.map(escaparCSV).join(";")
                )
                .join("\r\n");

            // BOM UTF-8 para preservar acentos.
            const archivo = new Blob(
                ["\uFEFF", contenido],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );

            const url = URL.createObjectURL(archivo);

            const enlace =
                document.createElement("a");

            enlace.href = url;

            const fecha = new Date()
                .toISOString()
                .slice(0, 10);

            enlace.download =
                `SMART_CLASSROOM_HISTORIAL_${fecha}.csv`;

            document.body.appendChild(enlace);

            enlace.click();
            enlace.remove();

            URL.revokeObjectURL(url);

            mostrarMensaje(
                `Se exportaron ${medicionesFiltradas.length} registros reales correctamente.`
            );
        }

        // ====================================================
        // 17. LIMPIAR FILTROS
        // ====================================================

        function limpiarFiltros() {
            formFiltros.reset();

            if (campoBusqueda) {
                campoBusqueda.value = "";
            }

            paginaActual = 1;

            cargarMediciones();
        }

        // ====================================================
        // 18. EVENTOS
        // ====================================================

        formFiltros.addEventListener(
            "submit",
            evento => {
                evento.preventDefault();

                paginaActual = 1;
                cargarMediciones();
            }
        );

        botonLimpiar?.addEventListener(
            "click",
            limpiarFiltros
        );

        botonAnterior?.addEventListener(
            "click",
            irPaginaAnterior
        );

        botonSiguiente?.addEventListener(
            "click",
            irPaginaSiguiente
        );

        botonExportar?.addEventListener(
            "click",
            exportarCSV
        );

        campoBusqueda?.addEventListener(
            "input",
            () => {
                paginaActual = 1;
                aplicarFiltros();
            }
        );

        // ====================================================
        // 19. INICIALIZACIÓN
        // ====================================================

        configurarAulas();

        actualizarConexion(false);

        actualizarAviso(
            "Preparando consulta del historial..."
        );

        cargarMediciones();

        console.log(
            "SMART CLASSROOM: Historial real inicializado."
        );
    });
})();
