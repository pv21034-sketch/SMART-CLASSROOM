
"use strict";

// ============================================================
// SMART CLASSROOM - GRÁFICAS REALES
// Universidad de El Salvador
//
// Fuente: Backend Rust / PostgreSQL / Supabase
// Endpoint: GET /api/mediciones
//
// 2 variables medidas por DHT22:
// - Temperatura
// - Humedad relativa
//
// 4 variables calculadas:
// - Punto de rocío
// - Humedad absoluta
// - Presión parcial de vapor
// - Variación térmica
//
// No genera datos ficticios.
// No modifica registros históricos.
// ============================================================

(() => {

    document.addEventListener("DOMContentLoaded", () => {

        // ====================================================
        // 1. CONFIGURACIÓN
        // ====================================================

        const API = window.SmartClassroomAPI;

        const ZONA_HORARIA = "America/El_Salvador";
        const INTERVALO_ACTUALIZACION = 60000;

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

        const aula = document.getElementById("graph-aula");
        const periodo = document.getElementById("graph-period");
        const boton = document.getElementById("graph-refresh");
        const aviso = document.getElementById("graphs-notice");

        const graficas = new Map();

        let numeroSolicitud = 0;
        let controlador = null;

        // ====================================================
        // 2. COMPROBACIONES
        // ====================================================

        if (window.lucide) {
            window.lucide.createIcons();
        }

        if (!aula || !periodo || !aviso) {
            console.error(
                "SMART CLASSROOM: faltan elementos HTML de gráficas."
            );
            return;
        }

        if (!window.Chart) {
            aviso.textContent =
                "Error: Chart.js no está disponible.";
            return;
        }

        if (!API || typeof API.get !== "function") {
            aviso.textContent =
                "Error: no se pudo inicializar el cliente API.";
            return;
        }

        // ====================================================
        // 3. CONFIGURACIÓN DE LAS SEIS GRÁFICAS
        // ====================================================

        const configuraciones = [
            {
                id: "temperature-chart",
                clave: "temperatura",
                nombre: "Temperatura",
                unidad: "°C",
                color: "#f4b942",
                decimales: 1
            },
            {
                id: "humidity-chart",
                clave: "humedad",
                nombre: "Humedad relativa",
                unidad: "%",
                color: "#75bfe5",
                decimales: 1
            },
            {
                id: "dew-point-chart",
                clave: "puntoRocio",
                nombre: "Punto de rocío",
                unidad: "°C",
                color: "#75bfe5",
                decimales: 2
            },
            {
                id: "absolute-humidity-chart",
                clave: "humedadAbsoluta",
                nombre: "Humedad absoluta",
                unidad: "g/m³",
                color: "#83cda4",
                decimales: 2
            },
            {
                id: "vapor-pressure-chart",
                clave: "presionVapor",
                nombre: "Presión de vapor",
                unidad: "kPa",
                color: "#f4b942",
                decimales: 3
            },
            {
                id: "thermal-variation-chart",
                clave: "variacionTermica",
                nombre: "Variación térmica",
                unidad: "°C/min",
                color: "#c5a3f2",
                decimales: 4
            }
        ];

        // ====================================================
        // 4. UTILIDADES
        // ====================================================

        function escribir(id, texto) {
            const elemento = document.getElementById(id);

            if (elemento) {
                elemento.textContent = texto;
            }
        }

        function fechaValida(valor) {
            const fecha = new Date(valor);

            return Number.isFinite(fecha.getTime())
                ? fecha
                : null;
        }

        function formatearNumero(valor, decimales = 2) {

            if (!Number.isFinite(valor)) {
                return "—";
            }

            const resultado = Number(
                valor.toFixed(decimales)
            );

            return String(
                Object.is(resultado, -0) ? 0 : resultado
            );
        }

        function fechaLocal(fecha) {

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
                partes.find(p => p.type === tipo)?.value;

            return [
                obtener("year"),
                obtener("month"),
                obtener("day")
            ].join("-");
        }

        function formatearFecha(fecha) {

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

        function formatearEtiqueta(fecha, tipoPeriodo) {

            if (tipoPeriodo === "hoy") {

                return new Intl.DateTimeFormat(
                    "es-SV",
                    {
                        timeZone: ZONA_HORARIA,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                    }
                ).format(fecha);
            }

            return new Intl.DateTimeFormat(
                "es-SV",
                {
                    timeZone: ZONA_HORARIA,
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                }
            ).format(fecha);
        }

        function obtenerFechaInicio(tipoPeriodo) {

            const ahora = new Date();

            if (tipoPeriodo === "todo") {
                return null;
            }

            if (tipoPeriodo === "hoy") {

                const dia = fechaLocal(ahora);

                return new Date(
                    `${dia}T00:00:00-06:00`
                );
            }

            const dias =
                tipoPeriodo === "30d" ? 30 : 7;

            return new Date(
                ahora.getTime() -
                dias * 24 * 60 * 60 * 1000
            );
        }

        // ====================================================
        // 5. CONFIGURAR SELECTORES
        // ====================================================

        function configurarAulas() {

            const valorAnterior = aula.value;

            aula.innerHTML = "";

            AULAS.forEach(item => {

                const opcion =
                    document.createElement("option");

                opcion.value = item.id;
                opcion.textContent = item.nombre;

                aula.appendChild(opcion);
            });

            const existe = AULAS.some(
                item => item.id === valorAnterior
            );

            aula.value = existe
                ? valorAnterior
                : AULAS[2].id;
        }

        function configurarPeriodos() {

            const opciones = [
                ["hoy", "Hoy"],
                ["7d", "7 días"],
                ["30d", "30 días"],
                ["todo", "Todo el historial"]
            ];

            const valorAnterior = periodo.value;

            periodo.innerHTML = "";

            opciones.forEach(([valor, texto]) => {

                const opcion =
                    document.createElement("option");

                opcion.value = valor;
                opcion.textContent = texto;

                periodo.appendChild(opcion);
            });

            const existe = opciones.some(
                opcion => opcion[0] === valorAnterior
            );

            periodo.value = existe
                ? valorAnterior
                : "todo";
        }

        // ====================================================
        // 6. OBTENER MEDICIONES REALES
        // ====================================================

        async function obtenerMediciones(aulaId, tipoPeriodo) {

            const parametros = new URLSearchParams({
                aula_id: aulaId,
                limit: "5000"
            });

            const desde =
                obtenerFechaInicio(tipoPeriodo);

            if (desde) {
                parametros.set(
                    "desde",
                    desde.toISOString()
                );
            }

            const respuesta = await API.get(
                `/api/mediciones?${parametros.toString()}`
            );

            if (!Array.isArray(respuesta)) {
                throw new Error(
                    "La API no devolvió un arreglo de mediciones."
                );
            }

            return respuesta;
        }

        // ====================================================
        // 7. AGRUPAR TEMPERATURA Y HUMEDAD
        // ====================================================

        function construirLecturas(filas) {

            const grupos = new Map();

            for (const fila of filas) {

                const tipo = String(
                    fila.tipo_sensor || ""
                ).trim().toLowerCase();

                if (
                    tipo !== "temperatura" &&
                    tipo !== "humedad"
                ) {
                    continue;
                }

                const fecha =
                    fechaValida(fila.medido_en);

                const valor = Number(fila.valor);

                if (
                    !fecha ||
                    !Number.isFinite(valor)
                ) {
                    continue;
                }

                const clave = fecha.toISOString();

                if (!grupos.has(clave)) {

                    grupos.set(clave, {
                        fecha,
                        temperatura: null,
                        humedad: null
                    });
                }

                const grupo = grupos.get(clave);

                if (tipo === "temperatura") {
                    grupo.temperatura = valor;
                }

                if (tipo === "humedad") {
                    grupo.humedad = valor;
                }
            }

            const lecturas = [];

            for (const grupo of grupos.values()) {

                if (
                    grupo.temperatura === null ||
                    grupo.humedad === null
                ) {
                    continue;
                }

                lecturas.push(grupo);
            }

            lecturas.sort(
                (a, b) =>
                    a.fecha.getTime() -
                    b.fecha.getTime()
            );

            return lecturas;
        }

        // ====================================================
        // 8. CÁLCULOS TERMODINÁMICOS
        // Mismas ecuaciones que el backend Rust.
        // ====================================================

        function calcularTermodinamica(T, HR) {

            if (
                !Number.isFinite(T) ||
                !Number.isFinite(HR) ||
                T < -40 ||
                T > 85 ||
                HR <= 0 ||
                HR > 100
            ) {
                return null;
            }

            const presionSaturacion =
                0.61094 *
                Math.exp(
                    (17.625 * T) /
                    (T + 243.04)
                );

            const presionVapor =
                (HR / 100) * presionSaturacion;

            const gamma =
                Math.log(HR / 100) +
                (17.625 * T) /
                (243.04 + T);

            const puntoRocio =
                (243.04 * gamma) /
                (17.625 - gamma);

            const humedadAbsoluta =
                216.7 *
                (presionVapor * 10) /
                (T + 273.15);

            if (
                !Number.isFinite(puntoRocio) ||
                !Number.isFinite(humedadAbsoluta) ||
                !Number.isFinite(presionVapor)
            ) {
                return null;
            }

            return {
                puntoRocio,
                humedadAbsoluta,
                presionVapor
            };
        }

        function calcularVariacion(actual, anterior) {

            if (!actual || !anterior) {
                return null;
            }

            const segundos =
                (
                    actual.fecha.getTime() -
                    anterior.fecha.getTime()
                ) / 1000;

            if (segundos <= 0) {
                return null;
            }

            // No unir jornadas diferentes como si fueran
            // mediciones consecutivas de una misma sesión.
            const fechaActual =
                fechaLocal(actual.fecha);

            const fechaAnterior =
                fechaLocal(anterior.fecha);

            if (fechaActual !== fechaAnterior) {
                return null;
            }

            return (
                actual.temperatura -
                anterior.temperatura
            ) / (segundos / 60);
        }

        function agregarPropiedades(lecturas) {

            const resultado = [];

            for (let i = 0; i < lecturas.length; i++) {

                const lectura = lecturas[i];

                const propiedades =
                    calcularTermodinamica(
                        lectura.temperatura,
                        lectura.humedad
                    );

                const anterior =
                    i > 0 ? lecturas[i - 1] : null;

                const variacion =
                    calcularVariacion(
                        lectura,
                        anterior
                    );

                resultado.push({
                    ...lectura,

                    puntoRocio:
                        propiedades?.puntoRocio ?? null,

                    humedadAbsoluta:
                        propiedades?.humedadAbsoluta ?? null,

                    presionVapor:
                        propiedades?.presionVapor ?? null,

                    variacionTermica:
                        Number.isFinite(variacion)
                            ? variacion
                            : null
                });
            }

            return resultado;
        }

        // ====================================================
        // 9. ESTADÍSTICAS REALES
        // ====================================================

        function estadisticas(valores) {

            const validos = valores.filter(
                Number.isFinite
            );

            if (!validos.length) {
                return null;
            }

            const suma = validos.reduce(
                (total, valor) => total + valor,
                0
            );

            return {
                promedio: suma / validos.length,
                minimo: Math.min(...validos),
                maximo: Math.max(...validos)
            };
        }

        function actualizarEstadisticas(datos) {

            const temperaturas = estadisticas(
                datos.map(d => d.temperatura)
            );

            const humedades = estadisticas(
                datos.map(d => d.humedad)
            );

            escribir(
                "temp-avg",
                temperaturas
                    ? `${formatearNumero(
                        temperaturas.promedio, 1
                    )} °C`
                    : "—"
            );

            escribir(
                "temp-range",
                temperaturas
                    ? `${formatearNumero(
                        temperaturas.minimo, 1
                    )} / ${formatearNumero(
                        temperaturas.maximo, 1
                    )}`
                    : "—"
            );

            escribir(
                "humidity-avg",
                humedades
                    ? `${formatearNumero(
                        humedades.promedio, 1
                    )} %`
                    : "—"
            );

            escribir(
                "humidity-range",
                humedades
                    ? `${formatearNumero(
                        humedades.minimo, 1
                    )} / ${formatearNumero(
                        humedades.maximo, 1
                    )}`
                    : "—"
            );
        }

        // ====================================================
        // 10. OPCIONES DE CHART.JS
        // ====================================================

        function opcionesGrafica(config) {

            return {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    mode: "index",
                    intersect: false
                },

                animation: {
                    duration: 350
                },

                plugins: {

                    legend: {
                        display: false
                    },

                    tooltip: {
                        backgroundColor: "#252932",
                        titleColor: "#ffffff",
                        bodyColor: "#e7e7e7",

                        callbacks: {

                            title: elementos => {

                                const indice =
                                    elementos[0]?.dataIndex;

                                const fechas =
                                    elementos[0]?.chart
                                        ?._fechasReales;

                                const fecha =
                                    fechas?.[indice];

                                return fecha
                                    ? formatearFecha(fecha)
                                    : "";
                            },

                            label: contexto => {

                                const valor =
                                    contexto.parsed.y;

                                if (
                                    valor === null ||
                                    !Number.isFinite(valor)
                                ) {
                                    return "Sin dato";
                                }

                                return (
                                    `${config.nombre}: ` +
                                    `${formatearNumero(
                                        valor,
                                        config.decimales
                                    )} ${config.unidad}`
                                );
                            }
                        }
                    }
                },

                scales: {

                    x: {
                        ticks: {
                            color: "#aeb4bf",
                            maxTicksLimit: 9
                        },

                        grid: {
                            color:
                                "rgba(255,255,255,0.07)"
                        }
                    },

                    y: {
                        ticks: {

                            color: "#aeb4bf",

                            callback: valor => {

                                return (
                                    `${formatearNumero(
                                        Number(valor),
                                        config.decimales
                                    )} ${config.unidad}`
                                );
                            }
                        },

                        grid: {
                            color:
                                "rgba(255,255,255,0.07)"
                        },

                        ...(config.clave === "humedad"
                            ? {
                                min: 0,
                                max: 100
                            }
                            : {})
                    }
                }
            };
        }

        // ====================================================
        // 11. DIBUJAR LAS SEIS GRÁFICAS
        // ====================================================

        function dibujarGrafica(config, datos, tipoPeriodo) {

            const canvas =
                document.getElementById(config.id);

            if (!canvas) {
                console.warn(
                    `No se encontró ${config.id}`
                );
                return;
            }

            const anterior =
                graficas.get(config.id);

            if (anterior) {
                anterior.destroy();
            }

            const etiquetas = datos.map(
                dato => formatearEtiqueta(
                    dato.fecha,
                    tipoPeriodo
                )
            );

            const valores = datos.map(dato => {

                const valor = dato[config.clave];

                return Number.isFinite(valor)
                    ? Number(
                        valor.toFixed(config.decimales)
                    )
                    : null;
            });

            const grafica = new Chart(canvas, {

                type: "line",

                data: {
                    labels: etiquetas,

                    datasets: [{
                        label: config.nombre,
                        data: valores,

                        borderColor: config.color,

                        backgroundColor:
                            config.color + "22",

                        borderWidth: 2.5,

                        pointRadius:
                            valores.length > 100
                                ? 0
                                : valores.length > 20
                                    ? 2
                                    : 3,

                        pointHoverRadius: 6,

                        pointBackgroundColor:
                            config.color,

                        tension: 0.32,
                        fill: true,
                        spanGaps: false
                    }]
                },

                options: opcionesGrafica(config)
            });

            grafica._fechasReales = datos.map(
                dato => dato.fecha
            );

            graficas.set(config.id, grafica);
        }

        function actualizarGraficas(datos, tipoPeriodo) {

            configuraciones.forEach(config => {
                dibujarGrafica(
                    config,
                    datos,
                    tipoPeriodo
                );
            });
        }

        // ====================================================
        // 12. LIMPIAR RESULTADOS
        // ====================================================

        function limpiarResultados() {

            actualizarEstadisticas([]);

            actualizarGraficas(
                [],
                periodo.value
            );
        }

        // ====================================================
        // 13. ACTUALIZACIÓN DESDE RUST
        // ====================================================

        async function actualizar() {

            const solicitudActual =
                ++numeroSolicitud;

            const aulaId = aula.value;
            const tipoPeriodo = periodo.value;

            const aulaSeleccionada =
                AULAS.find(item => item.id === aulaId);

            const nombreAula =
                aulaSeleccionada?.nombre ||
                "Aula seleccionada";

            boton && (boton.disabled = true);

            aviso.textContent =
                `Consultando mediciones reales de ${nombreAula}...`;

            try {

                const filas = await obtenerMediciones(
                    aulaId,
                    tipoPeriodo
                );

                // Ignorar respuestas antiguas si el usuario
                // cambió de aula o período mientras cargaba.
                if (solicitudActual !== numeroSolicitud) {
                    return;
                }

                const lecturas =
                    construirLecturas(filas);

                const datos =
                    agregarPropiedades(lecturas);

                actualizarEstadisticas(datos);

                actualizarGraficas(
                    datos,
                    tipoPeriodo
                );

                if (!datos.length) {

                    aviso.textContent =
                        `No hay mediciones completas ` +
                        `para ${nombreAula} en el período seleccionado.`;

                    return;
                }

                const ultima =
                    datos[datos.length - 1];

                aviso.textContent =
                    `Datos reales · ${nombreAula} · ` +
                    `${datos.length} mediciones completas · ` +
                    `Última: ${formatearFecha(
                        ultima.fecha
                    )}.`;

                console.log(
                    "SMART CLASSROOM - Gráficas reales:",
                    {
                        aula: nombreAula,
                        periodo: tipoPeriodo,
                        mediciones: datos.length,
                        ultimaMedicion: ultima.fecha
                    }
                );

            } catch (error) {

                if (solicitudActual !== numeroSolicitud) {
                    return;
                }

                console.error(
                    "Error al cargar gráficas:",
                    error
                );

                limpiarResultados();

                aviso.textContent =
                    "No se pudieron obtener las mediciones: " +
                    error.message;

            } finally {

                if (solicitudActual === numeroSolicitud) {
                    boton && (boton.disabled = false);
                }
            }
        }

        // ====================================================
        // 14. EVENTOS E INICIALIZACIÓN
        // ====================================================

        configurarAulas();
        configurarPeriodos();

        aula.addEventListener(
            "change",
            actualizar
        );

        periodo.addEventListener(
            "change",
            actualizar
        );

        boton?.addEventListener(
            "click",
            actualizar
        );

        actualizar();

        setInterval(
            actualizar,
            INTERVALO_ACTUALIZACION
        );

        console.log(
            "SMART CLASSROOM: módulo de gráficas reales iniciado."
        );

    });

})();
