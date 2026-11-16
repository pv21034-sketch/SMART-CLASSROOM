
"use strict";

/* ============================================================
   SMART CLASSROOM
   DASHBOARD — RUST / POSTGRESQL / SUPABASE

   - Mediciones reales por aula
   - Temperatura y humedad relativa
   - Gráficas Chart.js
   - Índice de confort
   - Alertas activas
   - Actualización automática
   - Adaptación a celulares y tablets

   No genera mediciones ficticias.
   ============================================================ */

(() => {
    const API = window.SmartClassroomAPI;

    const INTERVALO_ACTUALIZACION = 30000;
    const LIMITE_MEDICIONES = 5000;
    const ZONA_HORARIA = "America/El_Salvador";

    const COLOR_TEMPERATURA = "#F5B942";
    const COLOR_HUMEDAD = "#68C8F4";

    const $ = (id) => document.getElementById(id);

    let aulaSeleccionada = "";
    let registrosActuales = [];
    let conjuntosActuales = [];

    let graficaTemperatura = null;
    let graficaHumedad = null;

    let actualizando = false;
    let actualizacionPendiente = false;

    let intervaloDashboard = null;

    /* ========================================================
       1. UTILIDADES
       ======================================================== */

    function texto(id, valor) {
        const elemento = $(id);

        if (elemento) {
            elemento.textContent = String(valor);
        }
    }

    function numero(valor) {
        if (
            valor === null ||
            valor === undefined ||
            valor === ""
        ) {
            return null;
        }

        const resultado = Number(valor);

        return Number.isFinite(resultado)
            ? resultado
            : null;
    }

    function lista(respuesta, claves = []) {
        if (Array.isArray(respuesta)) {
            return respuesta;
        }

        if (!respuesta || typeof respuesta !== "object") {
            return [];
        }

        for (const clave of [
            ...claves,
            "data",
            "datos",
            "items",
            "resultados"
        ]) {
            if (Array.isArray(respuesta[clave])) {
                return respuesta[clave];
            }
        }

        if (
            respuesta.data &&
            typeof respuesta.data === "object"
        ) {
            return lista(respuesta.data, claves);
        }

        return [];
    }

    function fechaValida(valor) {
        if (!valor) {
            return null;
        }

        const fecha = new Date(valor);

        return Number.isNaN(fecha.getTime())
            ? null
            : fecha;
    }

    function fechaRegistro(registro) {
        return (
            registro?.medido_en ??
            registro?.fecha_hora ??
            registro?.fecha ??
            registro?.created_at ??
            registro?.timestamp ??
            null
        );
    }

    function formatearFecha(valor) {
        const fecha = fechaValida(valor);

        if (!fecha) {
            return "Fecha no disponible";
        }

        return fecha.toLocaleString("es-SV", {
            timeZone: ZONA_HORARIA,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatearNumero(valor, decimales = 1) {
        const n = numero(valor);

        return n === null
            ? "—"
            : n.toFixed(decimales);
    }

    function tipoSensor(registro) {
        return String(
            registro?.tipo_sensor ?? ""
        ).trim().toLowerCase();
    }

    function idAula(registro) {
        return String(
            registro?.aula_id ??
            registro?.id_aula ??
            registro?.aula?.id ??
            ""
        );
    }

    function idDispositivo(registro) {
        return String(
            registro?.dispositivo_id ?? ""
        );
    }

    function aviso(mensaje) {
        texto("data-notice", mensaje);
    }

    function progreso(id, valor, maximo) {
        const elemento = $(id);

        if (!elemento) {
            return;
        }

        const n = numero(valor);

        const porcentaje = n === null
            ? 0
            : Math.max(
                0,
                Math.min(100, (n / maximo) * 100)
            );

        elemento.style.width = `${porcentaje}%`;
    }

    function mostrarConexion(conectado) {
        const indicador = $("connection-status");

        if (indicador) {
            indicador.textContent = conectado
                ? "Conectado"
                : "Sin conexión";

            indicador.classList.toggle(
                "connected",
                conectado
            );

            indicador.classList.toggle(
                "disconnected",
                !conectado
            );
        }

        texto(
            "sidebar-status-text",
            conectado
                ? "Sistema conectado"
                : "Sin conexión"
        );

        const punto = $("sidebar-status-dot");

        if (punto) {
            punto.classList.toggle(
                "connected",
                conectado
            );

            punto.classList.toggle(
                "disconnected",
                !conectado
            );

            punto.style.background = conectado
                ? "#22c55e"
                : "#ef4444";
        }
    }

    /* ========================================================
       2. NORMALIZACIÓN DE MEDICIONES
       ======================================================== */

    function normalizarRegistros(respuesta) {
        const registros = lista(
            respuesta,
            ["mediciones"]
        );

        return registros
            .filter((registro) => {
                if (
                    !registro ||
                    typeof registro !== "object"
                ) {
                    return false;
                }

                const tipo = tipoSensor(registro);

                return (
                    (
                        tipo === "temperatura" ||
                        tipo === "humedad" ||
                        tipo === "humedad_relativa"
                    ) &&
                    numero(registro.valor) !== null &&
                    fechaValida(fechaRegistro(registro)) !== null
                );
            })
            .map((registro) => ({
                ...registro,

                tipo_normalizado:
                    tipoSensor(registro) === "humedad_relativa"
                        ? "humedad"
                        : tipoSensor(registro),

                valor_normalizado: numero(
                    registro.valor
                ),

                fecha_normalizada: fechaRegistro(
                    registro
                )
            }))
            .sort((a, b) =>
                new Date(b.fecha_normalizada) -
                new Date(a.fecha_normalizada)
            );
    }

    /* ========================================================
       3. AGRUPAR TEMPERATURA Y HUMEDAD
       ======================================================== */

    function agruparMediciones(registros) {
        const mapa = new Map();

        for (const registro of registros) {
            const aula = idAula(registro);
            const dispositivo = idDispositivo(registro);

            const fecha = new Date(
                registro.fecha_normalizada
            ).toISOString();

            const clave = JSON.stringify([
                aula,
                dispositivo,
                fecha
            ]);

            if (!mapa.has(clave)) {
                mapa.set(clave, {
                    aula_id: aula,
                    dispositivo_id: dispositivo,
                    medido_en: fecha,
                    temperatura: null,
                    humedad: null
                });
            }

            const conjunto = mapa.get(clave);

            if (
                registro.tipo_normalizado ===
                "temperatura"
            ) {
                conjunto.temperatura =
                    registro.valor_normalizado;
            }

            if (
                registro.tipo_normalizado ===
                "humedad"
            ) {
                conjunto.humedad =
                    registro.valor_normalizado;
            }
        }

        return Array.from(mapa.values())
            .sort((a, b) =>
                new Date(b.medido_en) -
                new Date(a.medido_en)
            );
    }

    /* ========================================================
       4. CARGAR AULAS
       ======================================================== */

    function agregarOpcion(selector, nombre, valor) {
        selector.add(new Option(nombre, valor));
    }

    async function cargarAulas() {
        const selector = $("aula-select");

        if (!selector) {
            return;
        }

        let aulas = [];

        try {
            const respuesta = await API.get(
                "/api/aulas"
            );

            aulas = lista(
                respuesta,
                ["aulas"]
            );

        } catch (error) {
            console.error(
                "Error consultando aulas:",
                error
            );
        }

        // Alternativa basada únicamente en registros reales.
        if (aulas.length === 0) {
            try {
                const respuesta = await API.get(
                    `/api/mediciones?limit=${LIMITE_MEDICIONES}`
                );

                const registros = lista(
                    respuesta,
                    ["mediciones"]
                );

                const ids = [
                    ...new Set(
                        registros
                            .map(idAula)
                            .filter(Boolean)
                    )
                ];

                aulas = ids.map((id) => ({
                    id,
                    nombre: `Aula ${id.slice(0, 8)}`
                }));

            } catch (error) {
                console.error(
                    "No se pudieron recuperar las aulas:",
                    error
                );
            }
        }

        selector.replaceChildren();

        if (aulas.length === 0) {
            agregarOpcion(
                selector,
                "Sin aulas disponibles",
                ""
            );

            aulaSeleccionada = "";
            return;
        }

        const idsAgregados = new Set();

        for (const aula of aulas) {
            const id = String(
                aula.id ??
                aula.aula_id ??
                ""
            );

            if (
                !id ||
                idsAgregados.has(id)
            ) {
                continue;
            }

            idsAgregados.add(id);

            const nombre = String(
                aula.nombre ??
                aula.nombre_aula ??
                aula.codigo ??
                `Aula ${id.slice(0, 8)}`
            );

            const codigo = String(
                aula.codigo ?? ""
            );

            const etiqueta = codigo
                ? `${codigo} — ${nombre}`
                : nombre;

            agregarOpcion(
                selector,
                etiqueta,
                id
            );
        }

        if (
            aulaSeleccionada &&
            idsAgregados.has(aulaSeleccionada)
        ) {
            selector.value = aulaSeleccionada;
        } else {
            aulaSeleccionada = selector.value;
        }
    }

    /* ========================================================
       5. CONSULTAR MEDICIONES
       ======================================================== */

    async function consultarMediciones(idAulaSeleccionada) {
        if (!idAulaSeleccionada) {
            return [];
        }

        const parametros = new URLSearchParams({
            aula_id: idAulaSeleccionada,
            limit: String(LIMITE_MEDICIONES)
        });

        const ruta =
            `/api/mediciones?${parametros.toString()}`;

        const respuesta = await API.get(ruta);

        const registros = normalizarRegistros(
            respuesta
        );

        return registros.filter(
            (registro) =>
                idAula(registro) === idAulaSeleccionada
        );
    }

    /* ========================================================
       6. CONSULTAR RESUMEN DEL AULA
       ======================================================== */

    async function consultarResumenAula(id) {
        if (!id) {
            return null;
        }

        try {
            return await API.get(
                `/api/aulas/${encodeURIComponent(id)}/ultima`
            );

        } catch (error) {
            console.warn(
                "No se pudo consultar el resumen del aula:",
                error
            );

            return null;
        }
    }

    /* ========================================================
       7. INDICADORES
       ======================================================== */

    function limpiarIndicadores() {
        texto("temperatura-valor", "—");
        texto("humedad-valor", "—");
        texto("confort-valor", "—");

        texto("temperatura-estado", "Sin mediciones");
        texto("humedad-estado", "Sin mediciones");
        texto("confort-estado", "Pendiente de cálculo");

        texto("aula-estado", "Sin información");

        texto(
            "aula-descripcion",
            "Esperando mediciones ambientales."
        );

        texto(
            "last-update",
            "Última actualización: —"
        );

        progreso("temperatura-progress", null, 45);
        progreso("humedad-progress", null, 100);
        progreso("confort-progress", null, 100);
    }

    function mostrarIndicadores(registros, conjuntos) {
        if (registros.length === 0) {
            limpiarIndicadores();

            aviso(
                "No hay mediciones disponibles para esta aula."
            );

            return;
        }

        const ultimaTemperatura = registros.find(
            (registro) =>
                registro.tipo_normalizado ===
                "temperatura"
        );

        const ultimaHumedad = registros.find(
            (registro) =>
                registro.tipo_normalizado ===
                "humedad"
        );

        const temperatura =
            ultimaTemperatura?.valor_normalizado ?? null;

        const humedad =
            ultimaHumedad?.valor_normalizado ?? null;

        texto(
            "temperatura-valor",
            formatearNumero(temperatura)
        );

        texto(
            "humedad-valor",
            formatearNumero(humedad)
        );

        texto(
            "temperatura-estado",
            ultimaTemperatura
                ? `Medida: ${formatearFecha(
                    ultimaTemperatura.fecha_normalizada
                )}`
                : "Sin mediciones"
        );

        texto(
            "humedad-estado",
            ultimaHumedad
                ? `Medida: ${formatearFecha(
                    ultimaHumedad.fecha_normalizada
                )}`
                : "Sin mediciones"
        );

        progreso(
            "temperatura-progress",
            temperatura,
            45
        );

        progreso(
            "humedad-progress",
            humedad,
            100
        );

        const ultimaFecha =
            registros[0].fecha_normalizada;

        texto(
            "last-update",
            `Última medición: ${formatearFecha(
                ultimaFecha
            )}`
        );

        texto(
            "aula-estado",
            "Mediciones disponibles"
        );

        texto(
            "aula-descripcion",
            "El aula tiene registros ambientales almacenados."
        );

        aviso(
            `${registros.length} registros de sensores ` +
            `organizados en ${conjuntos.length} ` +
            `instantes de medición.`
        );
    }

    /* ========================================================
       8. ÍNDICE DE CONFORT
       ======================================================== */

    function mostrarConfort(resumen) {
        const confort = resumen?.confort;

        const valor = numero(
            confort?.valor
        );

        if (valor === null) {
            texto("confort-valor", "—");

            texto(
                "confort-estado",
                "Pendiente de cálculo"
            );

            progreso(
                "confort-progress",
                null,
                100
            );

            return;
        }

        texto(
            "confort-valor",
            formatearNumero(valor)
        );

        texto(
            "confort-estado",
            confort.estado ?? "Calculado"
        );

        progreso(
            "confort-progress",
            valor,
            100
        );
    }

    /* ========================================================
       9. ÚLTIMAS MEDICIONES
       ======================================================== */

    function mostrarRecientes(conjuntos) {
        const contenedor = $("recent-measurements");

        if (!contenedor) {
            return;
        }

        contenedor.replaceChildren();

        if (conjuntos.length === 0) {
            const mensaje = document.createElement("p");

            mensaje.className = "empty-state";
            mensaje.textContent =
                "No hay mediciones disponibles.";

            contenedor.append(mensaje);
            return;
        }

        for (const conjunto of conjuntos.slice(0, 5)) {
            const fila = document.createElement("div");

            fila.className = "recent-measurement";

            const fecha = document.createElement("span");

            fecha.textContent = formatearFecha(
                conjunto.medido_en
            );

            const valores = document.createElement("strong");

            valores.textContent =
                `Temperatura: ${
                    formatearNumero(conjunto.temperatura)
                } °C | Humedad: ${
                    formatearNumero(conjunto.humedad)
                } %`;

            fila.append(
                fecha,
                valores
            );

            contenedor.append(fila);
        }
    }

    /* ========================================================
       10. FILTROS DE FECHA
       ======================================================== */

    function inicioDeHoyElSalvador() {
        const ahora = new Date();

        const partes = new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: ZONA_HORARIA,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(ahora);

        const obtener = (tipo) =>
            partes.find(
                (parte) => parte.type === tipo
            )?.value;

        const fecha = [
            obtener("year"),
            obtener("month"),
            obtener("day")
        ].join("-");

        return new Date(
            `${fecha}T00:00:00-06:00`
        );
    }

    function filtrarPeriodo(conjuntos) {
        const periodo =
            $("periodo-select")?.value || "7d";

        const ahora = new Date();

        let inicio;

        if (periodo === "7d") {
            inicio = new Date(
                ahora.getTime() - 7 * 86400000
            );

        } else if (periodo === "30d") {
            inicio = new Date(
                ahora.getTime() - 30 * 86400000
            );

        } else if (periodo === "todo") {
            inicio = new Date(0);

        } else {
            inicio = inicioDeHoyElSalvador();
        }

        return conjuntos
            .filter((conjunto) => {
                const fecha = fechaValida(
                    conjunto.medido_en
                );

                return (
                    fecha !== null &&
                    fecha >= inicio &&
                    fecha <= ahora
                );
            })
            .sort((a, b) =>
                new Date(a.medido_en) -
                new Date(b.medido_en)
            );
    }

    /* ========================================================
       11. GRÁFICAS CHART.JS
       ======================================================== */

    function crearGrafica(
        canvasId,
        etiqueta,
        conjuntos,
        campo
    ) {
        const canvas = $(canvasId);

        if (!canvas || !window.Chart) {
            return null;
        }

        const esTemperatura =
            campo === "temperatura";

        const color = esTemperatura
            ? COLOR_TEMPERATURA
            : COLOR_HUMEDAD;

        const colorRelleno = esTemperatura
            ? "rgba(245,185,66,0.12)"
            : "rgba(104,200,244,0.12)";

        const etiquetas = conjuntos.map(
            (conjunto) =>
                formatearFecha(conjunto.medido_en)
        );

        const valores = conjuntos.map(
            (conjunto) =>
                numero(conjunto[campo])
        );

        const esMovil = window.innerWidth <= 640;

        return new window.Chart(canvas, {
            type: "line",

            data: {
                labels: etiquetas,

                datasets: [{
                    label: etiqueta,
                    data: valores,

                    borderColor: color,
                    backgroundColor: colorRelleno,

                    pointBackgroundColor: color,
                    pointBorderColor: color,

                    pointHoverBackgroundColor: "#ffffff",
                    pointHoverBorderColor: color,

                    borderWidth: esMovil ? 2 : 3,

                    pointRadius: esMovil ? 1.5 : 2.5,
                    pointHoverRadius: 6,
                    pointHitRadius: 12,

                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                animation: {
                    duration: 500
                },

                interaction: {
                    mode: "index",
                    intersect: false
                },

                plugins: {
                    legend: {
                        display: false
                    },

                    tooltip: {
                        backgroundColor: "#20232B",
                        titleColor: "#FFFFFF",
                        bodyColor: "#F1EDE4",
                        borderColor: color,
                        borderWidth: 1,
                        padding: esMovil ? 8 : 12,
                        displayColors: false
                    }
                },

                scales: {
                    x: {
                        ticks: {
                            color: "#A6AAB5",
                            maxTicksLimit: esMovil ? 4 : 8,
                            maxRotation: 0,
                            autoSkip: true,
                            font: {
                                size: esMovil ? 10 : 12
                            }
                        },

                        grid: {
                            color: "rgba(255,255,255,0.05)"
                        },

                        border: {
                            color: "rgba(255,255,255,0.12)"
                        }
                    },

                    y: {
                        beginAtZero: false,

                        ticks: {
                            color: "#A6AAB5",
                            font: {
                                size: esMovil ? 10 : 12
                            }
                        },

                        grid: {
                            color: "rgba(255,255,255,0.08)"
                        },

                        border: {
                            color: "rgba(255,255,255,0.12)"
                        }
                    }
                }
            }
        });
    }

    function actualizarGraficas() {
        if (graficaTemperatura) {
            graficaTemperatura.destroy();
            graficaTemperatura = null;
        }

        if (graficaHumedad) {
            graficaHumedad.destroy();
            graficaHumedad = null;
        }

        const datos = filtrarPeriodo(
            conjuntosActuales
        );

        graficaTemperatura = crearGrafica(
            "temperatura-chart",
            "Temperatura (°C)",
            datos,
            "temperatura"
        );

        graficaHumedad = crearGrafica(
            "humedad-chart",
            "Humedad relativa (%)",
            datos,
            "humedad"
        );

        if (!window.Chart) {
            console.warn(
                "SMART CLASSROOM: Chart.js no disponible."
            );
        }
    }

    /* ========================================================
       12. ADAPTACIÓN DE GRÁFICAS A LA PANTALLA
       ======================================================== */

    function adaptarGrafica(grafica, esMovil) {
        if (!grafica) {
            return;
        }

        const dataset = grafica.data.datasets[0];

        if (dataset) {
            dataset.borderWidth = esMovil ? 2 : 3;
            dataset.pointRadius = esMovil ? 1.5 : 2.5;
        }

        const escalas = grafica.options.scales;

        if (escalas?.x?.ticks) {
            escalas.x.ticks.maxTicksLimit = esMovil ? 4 : 8;
            escalas.x.ticks.font.size = esMovil ? 10 : 12;
        }

        if (escalas?.y?.ticks) {
            escalas.y.ticks.font.size = esMovil ? 10 : 12;
        }

        if (grafica.options.plugins?.tooltip) {
            grafica.options.plugins.tooltip.padding =
                esMovil ? 8 : 12;
        }

        grafica.update("none");
        grafica.resize();
    }

    function iniciarAdaptacionGraficas() {
        const mediaMovil = window.matchMedia(
            "(max-width: 640px)"
        );

        function sincronizarGraficas() {
            const esMovil = mediaMovil.matches;

            adaptarGrafica(
                graficaTemperatura,
                esMovil
            );

            adaptarGrafica(
                graficaHumedad,
                esMovil
            );
        }

        if (
            typeof mediaMovil.addEventListener ===
            "function"
        ) {
            mediaMovil.addEventListener(
                "change",
                sincronizarGraficas
            );
        } else {
            mediaMovil.addListener(
                sincronizarGraficas
            );
        }
    }

    /* ========================================================
       13. ALERTAS
       ======================================================== */

    function mostrarAlertasResumen(resumen) {
        const cantidad = numero(
            resumen?.alertas_activas
        );

        if (cantidad === null) {
            texto("alertas-valor", "—");

            texto(
                "alertas-estado",
                "No se pudo consultar el estado de alertas"
            );

            // El contador de la campana lo administra
            // layout.js mediante /api/alertas.
            return;
        }

        texto("alertas-valor", cantidad);

        texto(
            "alertas-estado",
            cantidad === 0
                ? "Sin alertas activas"
                : `${cantidad} alertas activas`
        );

        // No sobrescribir notification-count:
        // layout.js es el responsable de actualizarlo.
    }

    /* ========================================================
       14. ACTUALIZACIÓN DEL DASHBOARD
       ======================================================== */

    async function actualizarDashboard() {
        if (actualizando) {
            actualizacionPendiente = true;
            return;
        }

        actualizando = true;

        const boton = $("refresh-button");

        if (boton) {
            boton.disabled = true;
        }

        const idConsultado = aulaSeleccionada;

        try {
            const [registros, resumen] =
                await Promise.all([
                    consultarMediciones(idConsultado),
                    consultarResumenAula(idConsultado)
                ]);

            // Evitar mostrar datos de otra aula cuando
            // el usuario cambia la selección rápidamente.
            if (idConsultado !== aulaSeleccionada) {
                actualizacionPendiente = true;
                return;
            }

            registrosActuales = registros;

            conjuntosActuales =
                agruparMediciones(registrosActuales);

            mostrarIndicadores(
                registrosActuales,
                conjuntosActuales
            );

            mostrarRecientes(
                conjuntosActuales
            );

            mostrarConfort(resumen);
            mostrarAlertasResumen(resumen);

            actualizarGraficas();
            mostrarConexion(true);

            console.info(
                "SMART CLASSROOM:",
                idConsultado,
                registrosActuales.length,
                "registros recuperados."
            );

        } catch (error) {
            console.error(
                "Error actualizando SMART CLASSROOM:",
                error
            );

            if (idConsultado !== aulaSeleccionada) {
                actualizacionPendiente = true;
                return;
            }

            mostrarConexion(false);

            registrosActuales = [];
            conjuntosActuales = [];

            limpiarIndicadores();
            mostrarRecientes([]);
            mostrarConfort(null);
            mostrarAlertasResumen(null);
            actualizarGraficas();

            aviso(
                "No se pudieron obtener las mediciones " +
                "del backend Rust."
            );

        } finally {
            if (boton) {
                boton.disabled = false;
            }

            actualizando = false;

            if (actualizacionPendiente) {
                actualizacionPendiente = false;
                actualizarDashboard();
            }
        }
    }

    /* ========================================================
       15. INICIALIZACIÓN
       ======================================================== */

    async function iniciar() {
        // El menú responsive se administra exclusivamente
        // desde layout.js para evitar conflictos de estado.
        iniciarAdaptacionGraficas();

        if (
            !API ||
            typeof API.get !== "function"
        ) {
            console.error(
                "SMART CLASSROOM: no se encontró " +
                "SmartClassroomAPI.get()."
            );

            aviso(
                "No se pudo cargar la conexión con el servidor."
            );

            mostrarConexion(false);
            return;
        }

        $("refresh-button")?.addEventListener(
            "click",
            actualizarDashboard
        );

        $("aula-select")?.addEventListener(
            "change",
            (evento) => {
                aulaSeleccionada = evento.target.value;
                actualizarDashboard();
            }
        );

        $("periodo-select")?.addEventListener(
            "change",
            actualizarGraficas
        );

        try {
            await cargarAulas();
            await actualizarDashboard();

        } catch (error) {
            console.error(
                "Error inicializando el Dashboard:",
                error
            );

            mostrarConexion(false);
        }

        // Actualizar mediciones cada 30 segundos.
        if (intervaloDashboard !== null) {
            window.clearInterval(intervaloDashboard);
        }

        intervaloDashboard = window.setInterval(
            () => {
                if (!document.hidden) {
                    actualizarDashboard();
                }
            },
            INTERVALO_ACTUALIZACION
        );

        // Recuperar datos cuando el usuario
        // regresa a la pestaña.
        document.addEventListener(
            "visibilitychange",
            () => {
                if (!document.hidden) {
                    actualizarDashboard();
                }
            }
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

})();
