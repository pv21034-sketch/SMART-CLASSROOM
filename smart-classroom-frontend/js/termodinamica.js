
"use strict";

// ============================================================
// SMART CLASSROOM - TERMODINÁMICA
// Universidad de El Salvador
//
// Datos reales desde GET /api/mediciones
// Backend Rust + Axum en Render
// Base de datos PostgreSQL / Supabase
//
// Variables calculadas:
// 1. Punto de rocío
// 2. Humedad absoluta
// 3. Presión parcial del vapor de agua
// 4. Tasa de variación térmica
//
// No genera datos ficticios.
// No modifica registros en PostgreSQL.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // CONFIGURACIÓN
    // ========================================================

    const API = window.SmartClassroomAPI;

    const INTERVALO_ACTUALIZACION = 60000;
    const ZONA_HORARIA = "America/El_Salvador";

    // Tolerancia para emparejar temperatura y humedad
    // cuando PostgreSQL guarda timestamps ligeramente
    // diferentes. Solo se emparejan registros compatibles.
    const TOLERANCIA_PAREJA_MS = 2000;

    // No calcular variación térmica entre jornadas ni
    // entre mediciones excesivamente separadas.
    const INTERVALO_MAXIMO_VARIACION_MS = 60 * 60 * 1000;

    const LIMITE_API = 5000;

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
    let controladorActual = null;

    // ========================================================
    // 1. UTILIDADES
    // ========================================================

    function escribir(elemento, contenido) {
        if (elemento) {
            elemento.textContent = String(contenido);
        }
    }

    function numero(valor, decimales = 2) {
        return Number.isFinite(valor)
            ? valor.toFixed(decimales)
            : "—";
    }

    function fechaValida(valor) {
        if (valor === null || valor === undefined || valor === "") {
            return null;
        }

        const fecha = valor instanceof Date
            ? valor
            : new Date(valor);

        return Number.isFinite(fecha.getTime())
            ? fecha
            : null;
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
        const partes = new Intl.DateTimeFormat("en-US", {
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

        // Todo el historial: sin filtro de fecha.
        if (
            periodo === "todo" ||
            periodo === "all" ||
            periodo === "historico"
        ) {
            return null;
        }

        if (periodo === "hoy") {
            const dia = fechaLocalISO(ahora);

            // El Salvador utiliza UTC-06:00.
            return new Date(`${dia}T00:00:00-06:00`);
        }

        const dias = periodo === "30d"
            ? 30
            : periodo === "7d"
                ? 7
                : 7;

        return new Date(
            ahora.getTime() -
            dias * 24 * 60 * 60 * 1000
        );
    }

    function mostrarAviso(mensaje) {
        escribir(elementos.aviso, mensaje);
    }

    // ========================================================
    // 2. MODELO TERMODINÁMICO
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

        // Presión de saturación en kPa.
        // Aproximación de Magnus.
        const presionSaturacion =
            0.61094 *
            Math.exp(
                (17.625 * temperatura) /
                (temperatura + 243.04)
            );

        // Presión parcial del vapor en kPa.
        const presionVapor =
            (humedad / 100) * presionSaturacion;

        // Punto de rocío en °C.
        const gamma =
            Math.log(humedad / 100) +
            (17.625 * temperatura) /
            (243.04 + temperatura);

        const puntoRocio =
            (243.04 * gamma) /
            (17.625 - gamma);

        // Humedad absoluta en g/m³.
        // Convertimos kPa a hPa multiplicando por 10.
        const humedadAbsoluta =
            216.7 *
            (presionVapor * 10) /
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

    // ========================================================
    // 3. VARIACIÓN TÉRMICA
    // ========================================================

    function calcularVariacion(actual, anterior) {

        if (!actual || !anterior) {
            return null;
        }

        if (
            !Number.isFinite(actual.temperatura) ||
            !Number.isFinite(anterior.temperatura)
        ) {
            return null;
        }

        const tiempoActual = actual.fecha.getTime();
        const tiempoAnterior = anterior.fecha.getTime();

        const diferenciaMs =
            tiempoActual - tiempoAnterior;

        if (diferenciaMs <= 0) {
            return null;
        }

        // Evitar diferencias entre jornadas.
        if (
            fechaLocalISO(actual.fecha) !==
            fechaLocalISO(anterior.fecha)
        ) {
            return null;
        }

        // Evitar intervalos excesivamente largos.
        if (
            diferenciaMs >
            INTERVALO_MAXIMO_VARIACION_MS
        ) {
            return null;
        }

        const minutos = diferenciaMs / 60000;

        const resultado =
            (actual.temperatura -
             anterior.temperatura) / minutos;

        return Number.isFinite(resultado)
            ? resultado
            : null;
    }

    // ========================================================
    // 4. CONSULTAR MEDICIONES REALES
    // ========================================================

    async function obtenerMediciones(aulaId, periodo) {

        if (!API || typeof API.get !== "function") {
            throw new Error(
                "No se encontró SmartClassroomAPI. " +
                "Comprueba que api.js se cargue primero."
            );
        }

        const parametros = new URLSearchParams({
            aula_id: aulaId,
            limit: String(LIMITE_API)
        });

        const desde = inicioPeriodo(periodo);

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
                "El backend no devolvió un arreglo válido de mediciones."
            );
        }

        return respuesta;
    }

    // ========================================================
    // 5. AGRUPAR TEMPERATURA Y HUMEDAD
    // ========================================================

    function construirLecturas(filas) {

        const temperaturas = [];
        const humedades = [];

        for (const fila of filas) {

            const tipo = String(
                fila.tipo_sensor || ""
            )
                .trim()
                .toLowerCase();

            if (
                tipo !== "temperatura" &&
                tipo !== "humedad"
            ) {
                continue;
            }

            const fecha = fechaValida(
                fila.medido_en
            );

            if (
                !fecha ||
                fila.valor === null ||
                fila.valor === undefined ||
                fila.valor === ""
            ) {
                continue;
            }

            const valor = Number(fila.valor);

            if (!Number.isFinite(valor)) {
                continue;
            }

            const medicion = {
                fecha,
                valor,
                aulaId: fila.aula_id || null,
                dispositivoId: fila.dispositivo_id || null
            };

            if (tipo === "temperatura") {
                temperaturas.push(medicion);
            } else {
                humedades.push(medicion);
            }
        }

        temperaturas.sort(
            (a, b) =>
                a.fecha.getTime() -
                b.fecha.getTime()
        );

        humedades.sort(
            (a, b) =>
                a.fecha.getTime() -
                b.fecha.getTime()
        );

        const lecturas = [];
        const usadas = new Set();

        // Cada temperatura se empareja con la humedad
        // más cercana dentro de la tolerancia.
        for (const temperatura of temperaturas) {

            let mejorIndice = -1;
            let mejorDiferencia =
                TOLERANCIA_PAREJA_MS + 1;

            for (let i = 0; i < humedades.length; i++) {

                if (usadas.has(i)) {
                    continue;
                }

                const humedad = humedades[i];

                // No mezclar aulas diferentes.
                if (
                    temperatura.aulaId &&
                    humedad.aulaId &&
                    temperatura.aulaId !== humedad.aulaId
                ) {
                    continue;
                }

                // No mezclar dispositivos diferentes.
                if (
                    temperatura.dispositivoId &&
                    humedad.dispositivoId &&
                    temperatura.dispositivoId !==
                    humedad.dispositivoId
                ) {
                    continue;
                }

                const diferencia = Math.abs(
                    temperatura.fecha.getTime() -
                    humedad.fecha.getTime()
                );

                if (
                    diferencia <= TOLERANCIA_PAREJA_MS &&
                    diferencia < mejorDiferencia
                ) {
                    mejorDiferencia = diferencia;
                    mejorIndice = i;

                    if (diferencia === 0) {
                        break;
                    }
                }
            }

            if (mejorIndice === -1) {
                continue;
            }

            usadas.add(mejorIndice);

            const humedad = humedades[mejorIndice];

            const propiedades = calcularTermodinamica(
                temperatura.valor,
                humedad.valor
            );

            if (!propiedades) {
                continue;
            }

            lecturas.push({
                fecha: temperatura.fecha,
                temperatura: temperatura.valor,
                humedad: humedad.valor,

                ...propiedades,

                variacion: null
            });
        }

        lecturas.sort(
            (a, b) =>
                a.fecha.getTime() -
                b.fecha.getTime()
        );

        // Calcular variación térmica.
        for (let i = 1; i < lecturas.length; i++) {
            lecturas[i].variacion =
                calcularVariacion(
                    lecturas[i],
                    lecturas[i - 1]
                );
        }

        return lecturas;
    }

    // ========================================================
    // 6. TARJETAS DE RESULTADOS
    // ========================================================

    function limpiarTarjetas() {

        escribir(elementos.rocio, "—");
        escribir(elementos.absoluta, "—");
        escribir(elementos.vapor, "—");
        escribir(elementos.variacion, "—");

        escribir(
            elementos.estadoRocio,
            "Sin datos disponibles"
        );

        escribir(
            elementos.estadoAbsoluta,
            "Sin datos disponibles"
        );

        escribir(
            elementos.estadoVapor,
            "Sin datos disponibles"
        );

        escribir(
            elementos.estadoVariacion,
            "Sin datos disponibles"
        );

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

        const actual =
            lecturas[lecturas.length - 1];

        escribir(
            elementos.rocio,
            numero(actual.puntoRocio, 2)
        );

        escribir(
            elementos.absoluta,
            numero(actual.humedadAbsoluta, 2)
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
                ? "Se necesitan dos lecturas consecutivas de la misma jornada."
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
    // 7. GRÁFICAS CON CHART.JS
    // ========================================================

    function crearGrafica(id, etiqueta, color) {

        const canvas = document.getElementById(id);

        if (!canvas || !window.Chart) {
            console.warn(
                `No se pudo crear la gráfica: ${id}`
            );
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
                            title: items => {
                                const indice =
                                    items[0]?.dataIndex;

                                const fechas =
                                    items[0]?.chart?._fechasReales;

                                const fecha =
                                    fechas?.[indice];

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
                            color:
                                "rgba(156,163,175,0.08)"
                        }
                    },

                    y: {
                        ticks: {
                            color: "#9ca3af"
                        },

                        grid: {
                            color:
                                "rgba(156,163,175,0.08)"
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

            mostrarAviso(
                "Error: no se pudo cargar Chart.js."
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
            lectura => {
                const valor = lectura[campo];

                return Number.isFinite(valor)
                    ? valor
                    : null;
            }
        );

        // Conservar las fechas completas para tooltips.
        grafica._fechasReales = lecturas.map(
            lectura => lectura.fecha
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
    // 8. SELECTOR DE AULAS
    // ========================================================

    function inicializarAulas() {

        if (!elementos.aula) {
            return;
        }

        const seleccionAnterior =
            elementos.aula.value;

        elementos.aula.replaceChildren();

        for (const aula of aulas) {

            const opcion =
                document.createElement("option");

            opcion.value = aula.id;
            opcion.textContent = aula.nombre;

            elementos.aula.appendChild(opcion);
        }

        const existe = aulas.some(
            aula => aula.id === seleccionAnterior
        );

        // Mantener selección si existe.
        // De lo contrario, seleccionar AULA-PRUEBAS.
        elementos.aula.value = existe
            ? seleccionAnterior
            : "c38f5f0d-b44c-449d-a428-fd7369f7209d";
    }

    // ========================================================
    // 9. ACTUALIZACIÓN DE INFORMACIÓN
    // ========================================================

    async function actualizarDatos() {

        const solicitudActual = ++generacion;

        if (!API || typeof API.get !== "function") {
            mostrarAviso(
                "Error: no se encontró SmartClassroomAPI. " +
                "Comprueba que api.js se cargue primero."
            );
            return;
        }

        const aulaId = elementos.aula?.value;
        const periodo =
            elementos.periodo?.value || "hoy";

        if (!aulaId) {
            mostrarAviso("Selecciona un aula.");
            return;
        }

        cargando = true;

        if (elementos.actualizar) {
            elementos.actualizar.disabled = true;
        }

        mostrarAviso(
            "Consultando mediciones reales..."
        );

        try {

            const filas = await obtenerMediciones(
                aulaId,
                periodo
            );

            // Si el usuario cambió de aula o período
            // mientras se consultaba, ignorar resultados
            // de solicitudes anteriores.
            if (solicitudActual !== generacion) {
                return;
            }

            const lecturas =
                construirLecturas(filas);

            actualizarTarjetas(lecturas);
            actualizarGraficas(lecturas);

            if (lecturas.length === 0) {

                mostrarAviso(
                    "No hay mediciones completas de temperatura " +
                    "y humedad para esta aula y período."
                );

            } else {

                const nombreAula =
                    aulas.find(
                        aula => aula.id === aulaId
                    )?.nombre ||
                    "Aula seleccionada";

                const ultima =
                    lecturas[lecturas.length - 1];

                const advertencia =
                    filas.length >= LIMITE_API
                        ? " Se alcanzó el límite de consulta; pueden existir más registros."
                        : "";

                mostrarAviso(
                    `${nombreAula}: ${lecturas.length} ` +
                    "mediciones completas. " +
                    `Última lectura: ${
                        formatoFecha(ultima.fecha)
                    }.${advertencia}`
                );
            }

        } catch (error) {

            if (solicitudActual !== generacion) {
                return;
            }

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

            if (solicitudActual === generacion) {
                cargando = false;

                if (elementos.actualizar) {
                    elementos.actualizar.disabled = false;
                }
            }
        }
    }

    // ========================================================
    // 10. EVENTOS
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

    // Actualización automática cada 60 segundos.
    setInterval(
        actualizarDatos,
        INTERVALO_ACTUALIZACION
    );

    console.log(
        "SMART CLASSROOM: módulo termodinámico iniciado."
    );
});
