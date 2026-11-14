
"use strict";

// ============================================================
// SMART CLASSROOM - TERMODINÁMICA
// Universidad de El Salvador
//
// Datos reales desde GET /api/mediciones
// Propiedades calculadas con las ecuaciones de Rust.
// No modifica datos en PostgreSQL.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    const API = window.SmartClassroomAPI;

    const INTERVALO_ACTUALIZACION = 60000;
    const ZONA_HORARIA = "America/El_Salvador";

    const aulas = [
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

    const elementos = {
        aula: document.getElementById("aula-select"),
        periodo: document.getElementById("periodo-select"),
        actualizar: document.getElementById("refresh-button"),
        aviso: document.getElementById("data-notice"),
        ultima: document.getElementById("last-update"),

        rocio: document.getElementById("punto-rocio-valor"),
        absoluta: document.getElementById("humedad-absoluta-valor"),
        vapor: document.getElementById("presion-vapor-valor"),
        variacion: document.getElementById("variacion-termica-valor"),

        estadoRocio: document.getElementById("punto-rocio-estado"),
        estadoAbsoluta: document.getElementById("humedad-absoluta-estado"),
        estadoVapor: document.getElementById("presion-vapor-estado"),
        estadoVariacion: document.getElementById("variacion-termica-estado")
    };

    const graficas = {};

    let cargando = false;
    let generacion = 0;

    // ========================================================
    // 1. UTILIDADES
    // ========================================================

    function escribir(elemento, contenido) {
        if (elemento) {
            elemento.textContent = contenido;
        }
    }

    function numero(valor, decimales = 2) {
        return Number.isFinite(valor)
            ? valor.toFixed(decimales)
            : "—";
    }

    function fechaValida(valor) {
        const fecha = new Date(valor);
        return Number.isFinite(fecha.getTime()) ? fecha : null;
    }

    function formatoFecha(valor) {
        const fecha = fechaValida(valor);

        if (!fecha) {
            return "Fecha desconocida";
        }

        return new Intl.DateTimeFormat("es-SV", {
            timeZone: ZONA_HORARIA,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }).format(fecha);
    }

    function formatoHora(valor) {
        const fecha = fechaValida(valor);

        if (!fecha) {
            return "—";
        }

        return new Intl.DateTimeFormat("es-SV", {
            timeZone: ZONA_HORARIA,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(fecha);
    }

    function fechaLocalISO(fecha) {
        const partes = new Intl.DateTimeFormat("en-CA", {
            timeZone: ZONA_HORARIA,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(fecha);

        const obtener = tipo =>
            partes.find(parte => parte.type === tipo)?.value;

        return [
            obtener("year"),
            obtener("month"),
            obtener("day")
        ].join("-");
    }

    function inicioPeriodo(periodo) {
        const ahora = new Date();

        if (periodo === "hoy") {
            // El Salvador utiliza UTC-06:00 todo el año.
            const dia = fechaLocalISO(ahora);
            return new Date(`${dia}T00:00:00-06:00`);
        }

        const dias = periodo === "30d" ? 30 : 7;

        return new Date(
            ahora.getTime() - dias * 24 * 60 * 60 * 1000
        );
    }

    function mostrarAviso(mensaje) {
        escribir(elementos.aviso, mensaje);
    }

    // ========================================================
    // 2. MODELO TERMODINÁMICO
    // Misma formulación que services/termodinamica.rs
    // ========================================================

    function calcularTermodinamica(temperatura, humedad) {

        if (
            !Number.isFinite(temperatura) ||
            !Number.isFinite(humedad) ||
            temperatura < -40 ||
            temperatura > 85 ||
            humedad <= 0 ||
            humedad > 100
        ) {
            return null;
        }

        const presionSaturacion =
            0.61094 *
            Math.exp(
                (17.625 * temperatura) /
                (temperatura + 243.04)
            );

        const presionVapor =
            (humedad / 100) * presionSaturacion;

        const gamma =
            Math.log(humedad / 100) +
            (17.625 * temperatura) /
            (243.04 + temperatura);

        const puntoRocio =
            (243.04 * gamma) / (17.625 - gamma);

        const humedadAbsoluta =
            216.7 * (presionVapor * 10) /
            (temperatura + 273.15);

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
            (actual.fecha.getTime() -
             anterior.fecha.getTime()) / 1000;

        if (segundos <= 0) {
            return null;
        }

        const resultado =
            (actual.temperatura - anterior.temperatura) /
            (segundos / 60);

        return Number.isFinite(resultado)
            ? resultado
            : null;
    }

    // ========================================================
    // 3. CONSULTAR MEDICIONES REALES
    // ========================================================

    async function obtenerMediciones(aulaId, periodo) {

        const desde = inicioPeriodo(periodo).toISOString();

        const parametros = new URLSearchParams({
            aula_id: aulaId,
            desde,
            limit: "5000"
        });

        const respuesta = await API.get(
            `/api/mediciones?${parametros.toString()}`
        );

        if (!Array.isArray(respuesta)) {
            throw new Error(
                "El backend no devolvió un historial válido."
            );
        }

        return respuesta;
    }

    // ========================================================
    // 4. AGRUPAR TEMPERATURA Y HUMEDAD
    // ========================================================

    function construirLecturas(filas) {

        const grupos = new Map();

        for (const fila of filas) {

            const tipo = String(
                fila.tipo_sensor || ""
            ).trim().toLowerCase();

            if (tipo !== "temperatura" && tipo !== "humedad") {
                continue;
            }

            const fecha = fechaValida(fila.medido_en);
            const valor = Number(fila.valor);

            if (!fecha || !Number.isFinite(valor)) {
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
            } else {
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

            const propiedades = calcularTermodinamica(
                grupo.temperatura,
                grupo.humedad
            );

            if (!propiedades) {
                continue;
            }

            lecturas.push({
                ...grupo,
                ...propiedades,
                variacion: null
            });
        }

        lecturas.sort(
            (a, b) => a.fecha.getTime() - b.fecha.getTime()
        );

        for (let i = 1; i < lecturas.length; i++) {
            lecturas[i].variacion = calcularVariacion(
                lecturas[i],
                lecturas[i - 1]
            );
        }

        return lecturas;
    }

    // ========================================================
    // 5. TARJETAS DE RESULTADOS
    // ========================================================

    function limpiarTarjetas() {

        escribir(elementos.rocio, "—");
        escribir(elementos.absoluta, "—");
        escribir(elementos.vapor, "—");
        escribir(elementos.variacion, "—");

        escribir(elementos.estadoRocio, "Sin datos disponibles");
        escribir(elementos.estadoAbsoluta, "Sin datos disponibles");
        escribir(elementos.estadoVapor, "Sin datos disponibles");
        escribir(elementos.estadoVariacion, "Sin datos disponibles");

        escribir(
            elementos.ultima,
            "Última actualización: —"
        );
    }

    function actualizarTarjetas(lecturas) {

        if (!lecturas.length) {
            limpiarTarjetas();
            return;
        }

        const actual = lecturas[lecturas.length - 1];

        escribir(
            elementos.rocio,
            numero(actual.puntoRocio)
        );

        escribir(
            elementos.absoluta,
            numero(actual.humedadAbsoluta)
        );

        escribir(
            elementos.vapor,
            numero(actual.presionVapor, 3)
        );

        escribir(
            elementos.variacion,
            actual.variacion === null
                ? "—"
                : numero(actual.variacion, 3)
        );

        escribir(
            elementos.estadoRocio,
            "Calculado a partir de temperatura y humedad relativa."
        );

        escribir(
            elementos.estadoAbsoluta,
            "Concentración estimada de vapor de agua."
        );

        escribir(
            elementos.estadoVapor,
            "Presión parcial estimada del vapor de agua."
        );

        escribir(
            elementos.estadoVariacion,
            actual.variacion === null
                ? "Se necesitan dos lecturas consecutivas."
                : actual.variacion > 0
                    ? "La temperatura está aumentando."
                    : actual.variacion < 0
                        ? "La temperatura está disminuyendo."
                        : "La temperatura permanece estable."
        );

        escribir(
            elementos.ultima,
            `Última medición: ${formatoFecha(actual.fecha)}`
        );
    }

    // ========================================================
    // 6. GRÁFICAS CON CHART.JS
    // ========================================================

    function crearGrafica(id, etiqueta, color) {

        const canvas = document.getElementById(id);

        if (!canvas || !window.Chart) {
            return null;
        }

        const contexto = canvas.getContext("2d");

        if (!contexto) {
            return null;
        }

        return new Chart(contexto, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: etiqueta,
                    data: [],
                    borderColor: color,
                    backgroundColor: color,
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    tension: 0.25,
                    spanGaps: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: "index",
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: elementos => {
                                const fecha =
                                    elementos[0]?.raw?.fecha;

                                return fecha
                                    ? formatoFecha(fecha)
                                    : "";
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            maxTicksLimit: 7,
                            color: "#9ca3af"
                        },
                        grid: {
                            color: "rgba(156,163,175,0.08)"
                        }
                    },
                    y: {
                        ticks: {
                            color: "#9ca3af"
                        },
                        grid: {
                            color: "rgba(156,163,175,0.08)"
                        }
                    }
                }
            }
        });
    }

    function inicializarGraficas() {

        if (!window.Chart) {
            console.error(
                "SMART CLASSROOM: Chart.js no está disponible."
            );
            return;
        }

        graficas.rocio = crearGrafica(
            "punto-rocio-chart",
            "Punto de rocío (°C)",
            "#38bdf8"
        );

        graficas.absoluta = crearGrafica(
            "humedad-absoluta-chart",
            "Humedad absoluta (g/m³)",
            "#34d399"
        );

        graficas.vapor = crearGrafica(
            "presion-vapor-chart",
            "Presión de vapor (kPa)",
            "#f59e0b"
        );

        graficas.variacion = crearGrafica(
            "variacion-termica-chart",
            "Variación térmica (°C/min)",
            "#a78bfa"
        );
    }

    function actualizarGrafica(grafica, lecturas, campo) {

        if (!grafica) {
            return;
        }

        grafica.data.labels = lecturas.map(
            lectura => formatoHora(lectura.fecha)
        );

        grafica.data.datasets[0].data = lecturas.map(
            lectura => ({
                x: formatoHora(lectura.fecha),
                y: lectura[campo],
                fecha: lectura.fecha.toISOString()
            })
        );

        grafica.update("none");
    }

    function actualizarGraficas(lecturas) {

        actualizarGrafica(
            graficas.rocio,
            lecturas,
            "puntoRocio"
        );

        actualizarGrafica(
            graficas.absoluta,
            lecturas,
            "humedadAbsoluta"
        );

        actualizarGrafica(
            graficas.vapor,
            lecturas,
            "presionVapor"
        );

        actualizarGrafica(
            graficas.variacion,
            lecturas,
            "variacion"
        );
    }

    // ========================================================
    // 7. SELECTOR DE AULAS
    // ========================================================

    function inicializarAulas() {

        if (!elementos.aula) {
            return;
        }

        elementos.aula.innerHTML = "";

        for (const aula of aulas) {

            const opcion = document.createElement("option");

            opcion.value = aula.id;
            opcion.textContent = aula.nombre;

            elementos.aula.appendChild(opcion);
        }

        // En pruebas, seleccionar el aula que recibe
        // las lecturas físicas del ESP32.
        elementos.aula.value =
            "c38f5f0d-b44c-449d-a428-fd7369f7209d";
    }

    // ========================================================
    // 8. ACTUALIZACIÓN DE INFORMACIÓN
    // ========================================================

    async function actualizarDatos() {

        if (!API || typeof API.get !== "function") {
            mostrarAviso(
                "Error: no se encontró SmartClassroomAPI."
            );
            return;
        }

        if (cargando) {
            return;
        }

        const aulaId = elementos.aula?.value;
        const periodo = elementos.periodo?.value || "hoy";

        if (!aulaId) {
            mostrarAviso("Selecciona un aula.");
            return;
        }

        cargando = true;
        const solicitudActual = ++generacion;

        if (elementos.actualizar) {
            elementos.actualizar.disabled = true;
        }

        mostrarAviso("Consultando mediciones reales...");

        try {

            const filas = await obtenerMediciones(
                aulaId,
                periodo
            );

            if (solicitudActual !== generacion) {
                return;
            }

            const lecturas = construirLecturas(filas);

            actualizarTarjetas(lecturas);
            actualizarGraficas(lecturas);

            if (lecturas.length === 0) {

                mostrarAviso(
                    "No hay mediciones completas de temperatura " +
                    "y humedad para esta aula y período."
                );

            } else {

                const nombreAula =
                    aulas.find(a => a.id === aulaId)?.nombre ||
                    "Aula seleccionada";

                mostrarAviso(
                    `${nombreAula}: ${lecturas.length} ` +
                    "mediciones completas. " +
                    `Última lectura: ${
                        formatoFecha(
                            lecturas[lecturas.length - 1].fecha
                        )
                    }.`
                );
            }

        } catch (error) {

            console.error(
                "SMART CLASSROOM - Termodinámica:",
                error
            );

            limpiarTarjetas();
            actualizarGraficas([]);

            mostrarAviso(
                `No se pudieron cargar los datos: ${error.message}`
            );

        } finally {

            cargando = false;

            if (elementos.actualizar) {
                elementos.actualizar.disabled = false;
            }
        }
    }

    // ========================================================
    // 9. EVENTOS
    // ========================================================

    inicializarAulas();
    inicializarGraficas();

    elementos.aula?.addEventListener(
        "change",
        actualizarDatos
    );

    elementos.periodo?.addEventListener(
        "change",
        actualizarDatos
    );

    elementos.actualizar?.addEventListener(
        "click",
        actualizarDatos
    );

    if (window.lucide) {
        window.lucide.createIcons();
    }

    actualizarDatos();

    // Actualización automática cada minuto.
    setInterval(
        actualizarDatos,
        INTERVALO_ACTUALIZACION
    );

});
