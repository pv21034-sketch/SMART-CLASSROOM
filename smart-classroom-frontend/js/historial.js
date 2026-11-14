
/* ============================================================
   SMART CLASSROOM — HISTORIAL DE MEDICIONES REALES
   Universidad de El Salvador

   BACKEND:
   Rust + Axum + SQLx

   BASE DE DATOS:
   PostgreSQL / Supabase

   ENDPOINT:
   GET /api/mediciones

   FUNCIONALIDADES:
   - Temperatura y humedad relativa.
   - Tres aulas reales.
   - Historial de octubre, noviembre y fechas futuras.
   - Filtros por aula, sensor, variable y fechas.
   - Búsqueda de registros.
   - Paginación de 10 registros.
   - Estadísticas ambientales.
   - Exportación CSV compatible con Excel.
   - Indicadores visuales originales.

   IMPORTANTE:
   - No genera mediciones sintéticas.
   - No modifica registros de Supabase.
   - No inventa estados de alerta.
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
        // 2. ELEMENTOS HTML ORIGINALES
        // ====================================================

        const formFiltros =
            document.getElementById("form-filtros");

        const filtroAula =
            document.getElementById("filtro-aula");

        const filtroSensor =
            document.getElementById("filtro-sensor");

        const filtroVariable =
            document.getElementById("filtro-variable");

        const fechaInicial =
            document.getElementById("fecha-inicial");

        const fechaFinal =
            document.getElementById("fecha-final");

        const botonBuscar =
            document.getElementById("boton-buscar");

        const botonLimpiar =
            document.getElementById("boton-limpiar");

        const botonExportar =
            document.getElementById("boton-exportar");

        const campoBusqueda =
            document.getElementById("history-search");

        const mensaje =
            document.getElementById("mensaje");

        const tabla =
            document.getElementById("tabla-mediciones");

        const tablaCuerpo =
            document.getElementById("tabla-cuerpo");

        const estadoVacio =
            document.getElementById("history-empty");

        const paginacion =
            document.getElementById("paginacion");

        const botonAnterior =
            document.getElementById("boton-anterior");

        const botonSiguiente =
            document.getElementById("boton-siguiente");

        const textoPagina =
            document.getElementById("texto-pagina");

        const resumenPagina =
            document.getElementById(
                "history-page-summary"
            );

        const descripcionResultados =
            document.getElementById(
                "history-results-description"
            );

        const totalElemento =
            document.getElementById("history-total");

        const temperaturaElemento =
            document.getElementById("history-temp-avg");

        const humedadElemento =
            document.getElementById("history-humidity-avg");

        const aulasElemento =
            document.getElementById("history-classrooms");

        const aviso =
            document.getElementById("history-notice");

        const estadoConexion =
            document.getElementById("connection-status");

        const estadoSidebar =
            document.getElementById("sidebar-status-text");

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
                "SMART CLASSROOM: faltan elementos del Historial."
            );

            return;
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }

        if (!API || typeof API.get !== "function") {

            mostrarMensaje(
                "No se pudo inicializar el cliente API."
            );

            if (aviso) {
                aviso.textContent =
                    "Error: no se pudo conectar con la API.";
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
        // 5. CONFIGURAR AULAS REALES
        // ====================================================

        function configurarAulas() {

            const seleccionAnterior = filtroAula.value;

            filtroAula.innerHTML = "";

            const opcionTodas =
                document.createElement("option");

            opcionTodas.value = "";
            opcionTodas.textContent = "Todas las aulas";

            filtroAula.appendChild(opcionTodas);

            AULAS.forEach(aula => {

                const opcion =
                    document.createElement("option");

                opcion.value = aula.id;
                opcion.textContent = aula.nombre;

                filtroAula.appendChild(opcion);
            });

            const existe = AULAS.some(
                aula => aula.id === seleccionAnterior
            );

            filtroAula.value = existe
                ? seleccionAnterior
                : "";
        }

        // ====================================================
        // 6. FUNCIONES AUXILIARES
        // ====================================================

        function redondear(valor, decimales = 1) {

            if (!Number.isFinite(valor)) {
                return null;
            }

            return Number(valor.toFixed(decimales));
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
                    return variable || "Desconocida";
            }
        }

        function obtenerFechaObjeto(fechaHora) {

            const fecha = new Date(fechaHora);

            return Number.isFinite(fecha.getTime())
                ? fecha
                : null;
        }

        // ====================================================
        // 7. FECHAS EN HORARIO DE EL SALVADOR
        // ====================================================

        function formatearFecha(fechaHora) {

            const fecha = obtenerFechaObjeto(fechaHora);

            if (!fecha) {
                return "—";
            }

            return new Intl.DateTimeFormat(
                "es-SV",
                {
                    timeZone: ZONA_HORARIA,
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                }
            ).format(fecha);
        }

        function obtenerFechaSimple(fechaHora) {

            const fecha = obtenerFechaObjeto(fechaHora);

            if (!fecha) {
                return "";
            }

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
                partes.find(
                    parte => parte.type === tipo
                )?.value;

            return (
                `${obtener("year")}-` +
                `${obtener("month")}-` +
                `${obtener("day")}`
            );
        }

        // ====================================================
        // 8. MENSAJES
        // ====================================================

        function mostrarMensaje(texto) {

            if (!mensaje) {
                return;
            }

            mensaje.textContent = texto;
            mensaje.hidden = false;
        }

        function ocultarMensaje() {

            if (!mensaje) {
                return;
            }

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
                    ? "Conectado · Datos reales"
                    : "Sin conexión";
            }

            if (estadoSidebar) {
                estadoSidebar.textContent = conectado
                    ? "Sistema conectado"
                    : "Sin conexión";
            }
        }

        // ====================================================
        // 9. VALIDACIÓN DE FECHAS
        // ====================================================

        function fechasValidas() {

            const inicio = fechaInicial.value;
            const final = fechaFinal.value;

            if (
                inicio &&
                final &&
                inicio > final
            ) {

                mostrarMensaje(
                    "La fecha inicial no puede ser " +
                    "posterior a la fecha final."
                );

                return false;
            }

            return true;
        }

        // ====================================================
        // 10. CONSTRUIR CONSULTA PARA RUST
        // ====================================================

        function construirConsulta() {

            const parametros = new URLSearchParams();

            parametros.set(
                "limit",
                String(LIMITE_API)
            );

            // Aula seleccionada.
            if (filtroAula.value) {

                parametros.set(
                    "aula_id",
                    filtroAula.value
                );
            }

            // Variable seleccionada.
            if (filtroVariable.value) {

                parametros.set(
                    "tipo",
                    filtroVariable.value
                );
            }

            // Fecha inicial.
            if (fechaInicial.value) {

                const inicio = new Date(
                    `${fechaInicial.value}T00:00:00-06:00`
                );

                parametros.set(
                    "desde",
                    inicio.toISOString()
                );
            }

            // Fecha final.
            if (fechaFinal.value) {

                const final = new Date(
                    `${fechaFinal.value}T23:59:59.999-06:00`
                );

                parametros.set(
                    "hasta",
                    final.toISOString()
                );
            }

            return parametros;
        }

        // ====================================================
        // 11. ADAPTAR REGISTROS REALES A TU TABLA
        // ====================================================

        function normalizarMediciones(registros) {

            const resultado = [];

            for (const registro of registros) {

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

                    aula: nombreAula(
                        registro.aula_id
                    ),

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
                        (
                            variable === "temperatura"
                                ? "°C"
                                : "%"
                        ),

                    // El endpoint no devuelve el
                    // estado histórico de alertas.
                    estado: "Registrada"
                });
            }

            // Más recientes primero.
            resultado.sort((a, b) => {

                const diferencia =
                    b.fechaObjeto.getTime() -
                    a.fechaObjeto.getTime();

                if (diferencia !== 0) {
                    return diferencia;
                }

                return String(b.id).localeCompare(
                    String(a.id)
                );
            });

            return resultado;
        }

        // ====================================================
        // 12. OBTENER MEDICIONES REALES
        // ====================================================

        async function cargarMediciones() {

            ocultarMensaje();

            if (!fechasValidas()) {
                return;
            }

            const solicitud = ++numeroSolicitud;

            actualizarAviso(
                "Consultando mediciones reales de PostgreSQL..."
            );

            if (botonBuscar) {
                botonBuscar.disabled = true;
            }

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
                        "La API no devolvió una lista de mediciones."
                    );
                }

                consultaLimitada =
                    respuesta.length >= LIMITE_API;

                mediciones = normalizarMediciones(
                    respuesta
                );

                paginaActual = 1;

                actualizarConexion(true);

                aplicarFiltros();

                if (consultaLimitada) {

                    actualizarAviso(
                        `Se recibieron ${mediciones.length} ` +
                        `mediciones. Se alcanzó el límite ` +
                        `de ${LIMITE_API} registros por consulta. ` +
                        `Utiliza filtros de fecha para consultar ` +
                        `otros períodos.`
                    );

                } else {

                    actualizarAviso(
                        `Datos reales obtenidos correctamente. ` +
                        `${mediciones.length} mediciones ` +
                        `consultadas desde PostgreSQL.`
                    );
                }

                console.log(
                    "SMART CLASSROOM - Historial:",
                    {
                        registros: mediciones.length,
                        aula: filtroAula.value || "Todas",
                        variable:
                            filtroVariable.value || "Todas"
                    }
                );

            } catch (error) {

                if (solicitud !== numeroSolicitud) {
                    return;
                }

                console.error(
                    "Error al cargar historial:",
                    error
                );

                mediciones = [];
                medicionesFiltradas = [];

                paginaActual = 1;
                totalPaginas = 1;

                actualizarConexion(false);

                aplicarFiltros();

                actualizarAviso(
                    "Error al consultar el backend: " +
                    error.message
                );

                mostrarMensaje(
                    "Verifica que el servidor Rust esté " +
                    "ejecutándose y tenga conexión " +
                    "con PostgreSQL."
                );

            } finally {

                if (solicitud === numeroSolicitud && botonBuscar) {
                    botonBuscar.disabled = false;
                }
            }
        }

        // ====================================================
        // 13. FILTROS ORIGINALES
        // ====================================================

        function aplicarFiltros() {

            if (!fechasValidas()) {
                return;
            }

            const aulaSeleccionada =
                filtroAula.value;

            const sensorSeleccionado =
                filtroSensor.value;

            const variableSeleccionada =
                filtroVariable.value;

            const inicio =
                fechaInicial.value;

            const final =
                fechaFinal.value;

            const busqueda =
                campoBusqueda.value
                    .trim()
                    .toLocaleLowerCase("es");

            medicionesFiltradas = mediciones.filter(
                medicion => {

                    // Aula.
                    if (
                        aulaSeleccionada &&
                        medicion.aula_id !== aulaSeleccionada
                    ) {
                        return false;
                    }

                    // Sensor.
                    if (
                        sensorSeleccionado &&
                        medicion.sensor_id !== sensorSeleccionado
                    ) {
                        return false;
                    }

                    // Variable.
                    if (
                        variableSeleccionada &&
                        medicion.variable !== variableSeleccionada
                    ) {
                        return false;
                    }

                    // Fechas.
                    const fecha =
                        obtenerFechaSimple(
                            medicion.fecha_hora
                        );

                    if (inicio && fecha < inicio) {
                        return false;
                    }

                    if (final && fecha > final) {
                        return false;
                    }

                    // Búsqueda de texto.
                    if (busqueda) {

                        const contenido = [
                            medicion.fecha_hora,
                            formatearFecha(
                                medicion.fecha_hora
                            ),
                            medicion.aula,
                            medicion.sensor,
                            medicion.variable_nombre,
                            medicion.valor,
                            medicion.unidad,
                            medicion.estado,
                            medicion.dispositivo_id || ""
                        ]
                            .join(" ")
                            .toLocaleLowerCase("es");

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

            if (paginaActual > totalPaginas) {
                paginaActual = totalPaginas;
            }

            actualizarResumen();
            mostrarTabla();
            actualizarPaginacion();
        }

        // ====================================================
        // 14. ESTADÍSTICAS
        // ====================================================

        function promedio(valores) {

            if (valores.length === 0) {
                return null;
            }

            const suma = valores.reduce(
                (total, valor) => total + valor,
                0
            );

            return suma / valores.length;
        }

        function actualizarResumen() {

            const temperaturas =
                medicionesFiltradas
                    .filter(
                        item =>
                            item.variable === "temperatura"
                    )
                    .map(item => item.valor);

            const humedades =
                medicionesFiltradas
                    .filter(
                        item =>
                            item.variable === "humedad"
                    )
                    .map(item => item.valor);

            const promedioTemperatura =
                promedio(temperaturas);

            const promedioHumedad =
                promedio(humedades);

            const aulas = new Set(
                medicionesFiltradas.map(
                    item => item.aula_id
                )
            );

            totalElemento.textContent =
                medicionesFiltradas.length.toLocaleString(
                    "es-SV"
                );

            temperaturaElemento.textContent =
                promedioTemperatura === null
                    ? "—"
                    : `${promedioTemperatura.toFixed(1)} °C`;

            humedadElemento.textContent =
                promedioHumedad === null
                    ? "—"
                    : `${promedioHumedad.toFixed(1)} %`;

            aulasElemento.textContent =
                String(aulas.size);

            descripcionResultados.textContent =
                `${medicionesFiltradas.length} ` +
                `registros reales encontrados.`;

            botonExportar.disabled =
                medicionesFiltradas.length === 0;
        }

        // ====================================================
        // 15. CREACIÓN SEGURA DE CELDAS
        // ====================================================

        function crearCelda(texto, clase = "") {

            const celda =
                document.createElement("td");

            celda.textContent =
                texto ?? "—";

            if (clase) {
                celda.className = clase;
            }

            return celda;
        }

        function crearCeldaVariable(medicion) {

            const celda =
                document.createElement("td");

            const contenedor =
                document.createElement("span");

            contenedor.className =
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

            contenedor.appendChild(punto);
            contenedor.appendChild(texto);

            celda.appendChild(contenedor);

            return celda;
        }

        function crearCeldaEstado(estado) {

            const celda =
                document.createElement("td");

            const etiqueta =
                document.createElement("span");

            // Conservamos el estilo original.
            etiqueta.className =
                "history-status " +
                (
                    estado === "Normal"
                        ? "normal"
                        : estado === "Alerta"
                            ? "alert"
                            : ""
                );

            etiqueta.textContent = estado;

            celda.appendChild(etiqueta);

            return celda;
        }

        // ====================================================
        // 16. MOSTRAR TABLA
        // ====================================================

        function mostrarTabla() {

            tablaCuerpo.replaceChildren();

            const total =
                medicionesFiltradas.length;

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

            const fin =
                inicio + LIMITE_POR_PAGINA;

            const pagina =
                medicionesFiltradas.slice(
                    inicio,
                    fin
                );

            const fragmento =
                document.createDocumentFragment();

            pagina.forEach(medicion => {

                const fila =
                    document.createElement("tr");

                // Fecha y hora.
                fila.appendChild(
                    crearCelda(
                        formatearFecha(
                            medicion.fecha_hora
                        ),
                        "history-date"
                    )
                );

                // Aula.
                fila.appendChild(
                    crearCelda(medicion.aula)
                );

                // Sensor.
                fila.appendChild(
                    crearCelda(medicion.sensor)
                );

                // Variable.
                fila.appendChild(
                    crearCeldaVariable(medicion)
                );

                // Valor.
                fila.appendChild(
                    crearCelda(
                        `${medicion.valor.toFixed(1)} ` +
                        medicion.unidad,
                        "history-value"
                    )
                );

                // Estado.
                fila.appendChild(
                    crearCeldaEstado(
                        medicion.estado
                    )
                );

                fragmento.appendChild(fila);
            });

            tablaCuerpo.appendChild(fragmento);
        }

        // ====================================================
        // 17. PAGINACIÓN ORIGINAL
        // ====================================================

        function actualizarPaginacion() {

            const total =
                medicionesFiltradas.length;

            const inicio =
                total === 0
                    ? 0
                    : (paginaActual - 1) *
                      LIMITE_POR_PAGINA + 1;

            const fin = Math.min(
                paginaActual * LIMITE_POR_PAGINA,
                total
            );

            textoPagina.textContent =
                `Página ${paginaActual} de ${totalPaginas}`;

            resumenPagina.textContent =
                `Mostrando ${inicio}–${fin} ` +
                `de ${total} registros`;

            botonAnterior.disabled =
                paginaActual <= 1;

            botonSiguiente.disabled =
                paginaActual >= totalPaginas;

            paginacion.hidden = total === 0;
        }

        function irPaginaAnterior() {

            if (paginaActual <= 1) {
                return;
            }

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
        // 18. EXPORTACIÓN CSV REAL
        // ====================================================

        function escaparCSV(valor) {

            const texto = String(valor ?? "");

            // Evitar interpretación de fórmulas al
            // abrir valores de texto en Excel.
            const seguro = /^[=+\-@\t\r]/.test(texto)
                ? "'" + texto
                : texto;

            return (
                '"' +
                seguro.replace(/"/g, '""') +
                '"'
            );
        }

        function exportarCSV() {

            if (medicionesFiltradas.length === 0) {

                mostrarMensaje(
                    "No hay registros para exportar."
                );

                return;
            }

            const encabezados = [
                "Fecha y hora",
                "Aula",
                "Sensor",
                "Variable",
                "Valor",
                "Unidad",
                "Estado",
                "Origen",
                "ID de medición",
                "ID de dispositivo"
            ];

            const filas = [encabezados];

            medicionesFiltradas.forEach(medicion => {

                filas.push([
                    formatearFecha(
                        medicion.fecha_hora
                    ),
                    medicion.aula,
                    medicion.sensor,
                    medicion.variable_nombre,
                    medicion.valor,
                    medicion.unidad,
                    medicion.estado,
                    "POSTGRESQL",
                    medicion.id || "",
                    medicion.dispositivo_id || ""
                ]);
            });

            const contenido = filas
                .map(
                    fila => fila
                        .map(escaparCSV)
                        .join(";")
                )
                .join("\r\n");

            // BOM para compatibilidad con Excel.
            const archivo = new Blob(
                ["\uFEFF" + contenido],
                {
                    type: "text/csv;charset=utf-8;"
                }
            );

            const url =
                URL.createObjectURL(archivo);

            const enlace =
                document.createElement("a");

            enlace.href = url;

            enlace.download =
                "smart-classroom-historial-real.csv";

            document.body.appendChild(enlace);

            enlace.click();

            enlace.remove();

            URL.revokeObjectURL(url);

            mostrarMensaje(
                `Se exportaron ${medicionesFiltradas.length} ` +
                `registros reales correctamente.`
            );
        }

        // ====================================================
        // 19. LIMPIAR FILTROS
        // ====================================================

        function limpiarFiltros() {

            formFiltros.reset();

            campoBusqueda.value = "";

            paginaActual = 1;

            cargarMediciones();
        }

        // ====================================================
        // 20. EVENTOS
        // ====================================================

        formFiltros.addEventListener(
            "submit",
            evento => {

                evento.preventDefault();

                paginaActual = 1;

                cargarMediciones();
            }
        );

        botonLimpiar.addEventListener(
            "click",
            limpiarFiltros
        );

        botonAnterior.addEventListener(
            "click",
            irPaginaAnterior
        );

        botonSiguiente.addEventListener(
            "click",
            irPaginaSiguiente
        );

        botonExportar.addEventListener(
            "click",
            exportarCSV
        );

        campoBusqueda.addEventListener(
            "input",
            () => {

                paginaActual = 1;

                aplicarFiltros();
            }
        );

        // ====================================================
        // 21. INICIALIZACIÓN
        // ====================================================

        configurarAulas();

        actualizarAviso(
            "Preparando consulta del historial..."
        );

        cargarMediciones();

        console.log(
            "SMART CLASSROOM: Historial real inicializado."
        );

    });

})();
