
/* ============================================================
   SMART CLASSROOM — CONFIGURACIÓN
   Universidad de El Salvador

   Funcionalidades:
   - Consulta de aulas desde el backend
   - Consulta de dispositivos ESP32
   - Consulta de tipos de sensor
   - Consulta y actualización de rangos por aula
   - Calculadora termodinámica local
   - Contador de alertas activas
   - Información del sistema
   - Cierre de sesión

   Backend: Rust + Axum
   Base de datos: PostgreSQL / Supabase
   ============================================================ */

(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {

        // ====================================================
        // 1. CONFIGURACIÓN GENERAL
        // ====================================================

        const API_URL = String(
            window.SMART_CLASSROOM_CONFIG?.API_URL ||
            window.SmartClassroomAPI?.baseURL ||
            window.SmartClassroomAPI?.baseUrl ||
            "https://smart-classroom-hitb.onrender.com"
        ).replace(/\/+$/, "");

        const $ = (id) => document.getElementById(id);

        const INTERVALO_ALERTAS = 30000;

        const datos = {
            aulas: [],
            dispositivos: [],
            rangos: [],
            tipos: [],

            aulaId: "",
            tiposValidos: false,
            rangosValidos: false,
            guardando: false,

            servicios: {
                aulas: false,
                dispositivos: false,
                tipos: false,
                rangos: false,
                alertas: false
            }
        };

        // ====================================================
        // 2. COMUNICACIÓN CON EL BACKEND
        // ====================================================

        async function solicitar(ruta, opciones = {}) {
            const token = sessionStorage.getItem("sc_token");

            const encabezados = {
                Accept: "application/json",
                ...(opciones.body !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(token
                    ? { Authorization: `Bearer ${token}` }
                    : {}),
                ...(opciones.headers || {})
            };

            const respuesta = await fetch(
                `${API_URL}${ruta}`,
                {
                    ...opciones,
                    headers: encabezados,
                    cache: "no-store"
                }
            );

            const texto = await respuesta.text();

            let resultado = null;

            if (texto.trim()) {
                try {
                    resultado = JSON.parse(texto);
                } catch {
                    resultado = texto;
                }
            }

            if (!respuesta.ok) {
                const descripcion =
                    typeof resultado === "string"
                        ? resultado
                        : resultado?.mensaje ||
                          resultado?.message ||
                          resultado?.error ||
                          `Error HTTP ${respuesta.status}`;

                const error = new Error(
                    typeof descripcion === "string"
                        ? descripcion
                        : JSON.stringify(descripcion)
                );

                error.status = respuesta.status;
                throw error;
            }

            return resultado;
        }

        function extraerLista(respuesta, propiedad) {
            if (Array.isArray(respuesta)) {
                return respuesta;
            }

            if (Array.isArray(respuesta?.[propiedad])) {
                return respuesta[propiedad];
            }

            if (Array.isArray(respuesta?.datos)) {
                return respuesta.datos;
            }

            if (Array.isArray(respuesta?.data)) {
                return respuesta.data;
            }

            throw new Error(
                "La API no devolvió una lista válida."
            );
        }

        // ====================================================
        // 3. UTILIDADES
        // ====================================================

        function escribir(id, valor) {
            const elemento = $(id);

            if (elemento) {
                elemento.textContent = String(valor ?? "—");
            }
        }

        function mostrarMensaje(id, texto, error = false) {
            const elemento = $(id);

            if (!elemento) {
                return;
            }

            elemento.textContent = String(texto || "");
            elemento.hidden = !texto;
            elemento.classList.toggle("error", error);
        }

        function normalizarId(valor) {
            return String(valor ?? "").trim();
        }

        function normalizarTexto(valor) {
            return String(valor ?? "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
        }

        function crearTabla(id, registros, columnas) {
            const cuerpo = $(id);

            if (!cuerpo) {
                return;
            }

            const fragmento = document.createDocumentFragment();

            for (const registro of registros) {
                const fila = document.createElement("tr");

                for (const valor of columnas(registro)) {
                    const celda = document.createElement("td");

                    celda.textContent = String(valor ?? "—");
                    fila.appendChild(celda);
                }

                fragmento.appendChild(fila);
            }

            cuerpo.replaceChildren(fragmento);
        }

        function actualizarIconos() {
            if (window.lucide?.createIcons) {
                window.lucide.createIcons();
            }
        }

        function actualizarConexion() {
            const servicios = Object.values(datos.servicios);
            const conectados = servicios.filter(Boolean).length;

            const indicador = $("connection-status");
            const punto = $("sidebar-status-dot");

            let texto = "API desconectada";
            let descripcion = "Backend sin respuesta";
            let color = "#ef4444";

            if (conectados === servicios.length) {
                texto = "API conectada";
                descripcion = "Servicios conectados";
                color = "#22c55e";
            } else if (conectados > 0) {
                texto = "Conexión parcial";
                descripcion = "Algunos servicios no responden";
                color = "#f59e0b";
            }

            if (indicador) {
                indicador.textContent = texto;
                indicador.title =
                    `${conectados} de ${servicios.length} consultas correctas`;
            }

            escribir("sidebar-status-text", descripcion);

            if (punto) {
                punto.style.backgroundColor = color;
            }
        }

        function registrarServicio(nombre, correcto) {
            datos.servicios[nombre] = Boolean(correcto);
            actualizarConexion();
        }

        function nombreAula(id) {
            const aula = datos.aulas.find(
                (registro) =>
                    normalizarId(registro.id) === normalizarId(id)
            );

            return aula?.nombre ||
                   aula?.codigo ||
                   "Aula no identificada";
        }

        function descripcionAula(aula) {
            const codigo = String(aula.codigo ?? "").trim();
            const nombre = String(aula.nombre ?? "").trim();

            if (codigo && nombre) {
                return `${codigo} · ${nombre}`;
            }

            return nombre || codigo || `Aula ${aula.id}`;
        }

        // ====================================================
        // 4. AULAS
        // ====================================================

        function crearSelectorAulas() {
            const formulario = $("form-rangos");

            if (
                !formulario ||
                $("selector-aula-rangos")
            ) {
                return;
            }

            const contenedor = document.createElement("div");
            contenedor.className =
                "settings-field settings-aula-selector";

            const etiqueta = document.createElement("label");
            etiqueta.htmlFor = "selector-aula-rangos";
            etiqueta.textContent =
                "Seleccione el aula que desea configurar";

            const selector = document.createElement("select");
            selector.id = "selector-aula-rangos";
            selector.name = "aula_id";
            selector.required = true;

            const opcion = document.createElement("option");
            opcion.value = "";
            opcion.textContent = "Seleccione un aula";

            selector.appendChild(opcion);

            contenedor.append(etiqueta, selector);
            formulario.prepend(contenedor);

            selector.addEventListener("change", () => {
                datos.aulaId = selector.value;
                mostrarRangos();
            });
        }

        function actualizarSelectorAulas() {
            const selector = $("selector-aula-rangos");

            if (!selector) {
                return;
            }

            const valorAnterior = datos.aulaId;

            const fragmento = document.createDocumentFragment();

            const inicial = document.createElement("option");
            inicial.value = "";
            inicial.textContent = "Seleccione un aula";

            fragmento.appendChild(inicial);

            for (const aula of datos.aulas) {
                const opcion = document.createElement("option");

                opcion.value = normalizarId(aula.id);
                opcion.textContent = descripcionAula(aula);

                fragmento.appendChild(opcion);
            }

            selector.replaceChildren(fragmento);

            const existe = datos.aulas.some(
                (aula) =>
                    normalizarId(aula.id) === valorAnterior
            );

            datos.aulaId = existe ? valorAnterior : "";
            selector.value = datos.aulaId;
        }

        async function cargarAulas() {
            try {
                const respuesta = await solicitar("/api/aulas");

                datos.aulas = extraerLista(respuesta, "aulas");

                escribir(
                    "settings-total-aulas",
                    datos.aulas.length
                );

                escribir(
                    "settings-aulas-count",
                    `${datos.aulas.length} aulas`
                );

                crearTabla(
                    "cuerpo-aulas",
                    datos.aulas,
                    (aula) => [descripcionAula(aula)]
                );

                actualizarSelectorAulas();

                mostrarMensaje(
                    "mensaje-aulas",
                    datos.aulas.length
                        ? ""
                        : "No hay aulas registradas."
                );

                registrarServicio("aulas", true);

            } catch (error) {
                registrarServicio("aulas", false);

                datos.aulas = [];

                escribir("settings-total-aulas", "—");
                escribir("settings-aulas-count", "Sin datos");

                crearTabla("cuerpo-aulas", [], () => []);
                actualizarSelectorAulas();

                mostrarMensaje(
                    "mensaje-aulas",
                    `No se pudieron cargar las aulas: ${error.message}`,
                    true
                );

                console.error("Error al cargar aulas:", error);
            }
        }

        // ====================================================
        // 5. DISPOSITIVOS
        // ====================================================

        function crearEstadoDispositivo(celda, estado) {
            const valor = normalizarTexto(estado);

            const etiqueta = document.createElement("span");
            etiqueta.className = "settings-device-status";

            if (
                valor === "activo" ||
                valor === "activa" ||
                valor === "conectado"
            ) {
                etiqueta.classList.add("ready");

            } else if (
                valor === "mantenimiento" ||
                valor === "pendiente"
            ) {
                etiqueta.classList.add("pending");

            } else {
                etiqueta.classList.add("offline");
            }

            const punto = document.createElement("span");
            punto.className = "settings-device-dot";

            const texto = document.createElement("span");
            texto.textContent = String(estado ?? "Desconocido");

            etiqueta.append(punto, texto);
            celda.replaceChildren(etiqueta);
        }

        async function cargarDispositivos() {
            try {
                const respuesta = await solicitar(
                    "/api/dispositivos"
                );

                datos.dispositivos = extraerLista(
                    respuesta,
                    "dispositivos"
                );

                escribir(
                    "settings-total-dispositivos",
                    datos.dispositivos.length
                );

                escribir(
                    "settings-dispositivos-count",
                    `${datos.dispositivos.length} dispositivos`
                );

                crearTabla(
                    "cuerpo-dispositivos",
                    datos.dispositivos,
                    (dispositivo) => [
                        [
                            dispositivo.nombre || "ESP32",
                            dispositivo.identificador
                                ? `(${dispositivo.identificador})`
                                : ""
                        ].filter(Boolean).join(" "),

                        nombreAula(dispositivo.aula_id),

                        dispositivo.sensor ||
                        dispositivo.tipo_sensor ||
                        "DHT22",

                        dispositivo.estado || "Desconocido"
                    ]
                );

                const filas = $("cuerpo-dispositivos")
                    ?.querySelectorAll("tr") || [];

                filas.forEach((fila, indice) => {
                    const celda = fila.cells[3];

                    if (celda) {
                        crearEstadoDispositivo(
                            celda,
                            datos.dispositivos[indice].estado
                        );
                    }
                });

                mostrarMensaje(
                    "mensaje-dispositivos",
                    datos.dispositivos.length
                        ? ""
                        : "No hay dispositivos registrados."
                );

                registrarServicio("dispositivos", true);

            } catch (error) {
                registrarServicio("dispositivos", false);

                datos.dispositivos = [];

                escribir("settings-total-dispositivos", "—");
                escribir(
                    "settings-dispositivos-count",
                    "Sin datos"
                );

                crearTabla(
                    "cuerpo-dispositivos",
                    [],
                    () => []
                );

                mostrarMensaje(
                    "mensaje-dispositivos",
                    `No se pudieron cargar los dispositivos: ${error.message}`,
                    true
                );

                console.error(
                    "Error al cargar dispositivos:",
                    error
                );
            }
        }

        // ====================================================
        // 6. TIPOS DE SENSOR Y RANGOS
        // ====================================================

        function variableSensor(tipo) {
            const nombre = normalizarTexto(tipo?.nombre);

            if (nombre.includes("temperatura")) {
                return "temperatura";
            }

            if (nombre.includes("humedad")) {
                return "humedad";
            }

            return null;
        }

        function rangoActivo(rango) {
            return (
                rango.activo === true ||
                rango.activo === 1 ||
                rango.activo === "true"
            );
        }

        function buscarRango(variable) {
            if (
                !datos.aulaId ||
                !datos.tiposValidos ||
                !datos.rangosValidos
            ) {
                return null;
            }

            return datos.rangos.find((rango) => {
                if (
                    normalizarId(rango.aula_id) !== datos.aulaId
                ) {
                    return false;
                }

                if (!rangoActivo(rango)) {
                    return false;
                }

                const tipo = datos.tipos.find(
                    (registro) =>
                        normalizarId(registro.id) ===
                        normalizarId(rango.tipo_sensor_id)
                );

                return variableSensor(tipo) === variable;

            }) || null;
        }

        async function cargarTipos() {
            datos.tiposValidos = false;

            try {
                const respuesta = await solicitar(
                    "/api/tipos-sensor"
                );

                datos.tipos = extraerLista(
                    respuesta,
                    "tipos_sensor"
                );

                datos.tiposValidos = true;
                registrarServicio("tipos", true);

            } catch (error) {
                datos.tipos = [];
                registrarServicio("tipos", false);

                console.error(
                    "Error al cargar tipos de sensor:",
                    error
                );
            }
        }

        async function cargarRangos() {
            datos.rangosValidos = false;

            try {
                const respuesta = await solicitar(
                    "/api/rangos"
                );

                datos.rangos = extraerLista(
                    respuesta,
                    "rangos"
                );

                datos.rangosValidos = true;
                registrarServicio("rangos", true);

                mostrarRangos();

            } catch (error) {
                registrarServicio("rangos", false);

                mostrarMensaje(
                    "mensaje-rangos",
                    `No se pudieron consultar los rangos: ${error.message}`,
                    true
                );

                throw error;
            }
        }

        function escribirRango(variable, rango) {
            const minimo = $(`rango-${variable}-min`);
            const maximo = $(`rango-${variable}-max`);

            if (minimo) {
                minimo.value =
                    rango?.valor_minimo != null
                        ? String(rango.valor_minimo)
                        : "";
            }

            if (maximo) {
                maximo.value =
                    rango?.valor_maximo != null
                        ? String(rango.valor_maximo)
                        : "";
            }
        }

        function actualizarBotonGuardar() {
            const boton = $("boton-guardar-rangos");

            if (!boton) {
                return;
            }

            boton.disabled = !(
                datos.aulaId &&
                datos.tiposValidos &&
                datos.rangosValidos &&
                buscarRango("temperatura") &&
                buscarRango("humedad") &&
                !datos.guardando
            );
        }

        function mostrarRangos() {
            const temperatura = buscarRango("temperatura");
            const humedad = buscarRango("humedad");

            // No sobrescribir campos mientras se guarda.
            if (!datos.guardando) {
                escribirRango("temperatura", temperatura);
                escribirRango("humedad", humedad);
            }

            actualizarBotonGuardar();

            if (!datos.aulaId) {
                mostrarMensaje(
                    "mensaje-rangos",
                    "Seleccione un aula para consultar sus rangos."
                );

                return;
            }

            if (!datos.tiposValidos) {
                mostrarMensaje(
                    "mensaje-rangos",
                    "No se pudieron identificar los tipos de sensor.",
                    true
                );

                return;
            }

            if (!datos.rangosValidos) {
                mostrarMensaje(
                    "mensaje-rangos",
                    "Los rangos todavía no están disponibles.",
                    true
                );

                return;
            }

            if (!temperatura || !humedad) {
                mostrarMensaje(
                    "mensaje-rangos",
                    "Esta aula no tiene ambos rangos activos de temperatura y humedad."
                );

                return;
            }

            mostrarMensaje("mensaje-rangos", "");
        }

        function leerRango(variable) {
            const minimoTexto =
                $(`rango-${variable}-min`)?.value.trim();

            const maximoTexto =
                $(`rango-${variable}-max`)?.value.trim();

            if (!minimoTexto || !maximoTexto) {
                throw new Error(
                    `Complete los límites de ${variable}.`
                );
            }

            const minimo = Number(minimoTexto);
            const maximo = Number(maximoTexto);

            if (
                !Number.isFinite(minimo) ||
                !Number.isFinite(maximo)
            ) {
                throw new Error(
                    `Introduzca límites numéricos válidos para ${variable}.`
                );
            }

            if (minimo >= maximo) {
                throw new Error(
                    `El mínimo de ${variable} debe ser menor que el máximo.`
                );
            }

            if (variable === "temperatura") {
                if (minimo < -273.15) {
                    throw new Error(
                        "La temperatura no puede ser inferior al cero absoluto."
                    );
                }
            }

            if (variable === "humedad") {
                if (minimo < 0 || maximo > 100) {
                    throw new Error(
                        "La humedad relativa debe estar entre 0 y 100 %."
                    );
                }
            }

            return {
                valor_minimo: minimo,
                valor_maximo: maximo
            };
        }

        // ====================================================
        // 7. GUARDAR RANGOS EN POSTGRESQL
        // ====================================================

        async function guardarRangos() {
            if (datos.guardando) {
                return;
            }

            const temperatura = buscarRango("temperatura");
            const humedad = buscarRango("humedad");

            if (!temperatura || !humedad) {
                mostrarMensaje(
                    "mensaje-rangos",
                    "Seleccione un aula con ambos rangos activos configurados.",
                    true
                );

                return;
            }

            let nuevosTemperatura;
            let nuevosHumedad;

            try {
                nuevosTemperatura = leerRango("temperatura");
                nuevosHumedad = leerRango("humedad");

            } catch (error) {
                mostrarMensaje(
                    "mensaje-rangos",
                    error.message,
                    true
                );

                return;
            }

            datos.guardando = true;
            actualizarBotonGuardar();

            const selector = $("selector-aula-rangos");
            const botonRecargar =
                $("boton-restablecer-rangos");

            if (selector) {
                selector.disabled = true;
            }

            if (botonRecargar) {
                botonRecargar.disabled = true;
            }

            mostrarMensaje(
                "mensaje-rangos",
                "Guardando rangos en el backend..."
            );

            try {
                // NOTA:
                // Son dos operaciones PUT independientes.
                // Si la segunda falla, la primera podría
                // haber quedado guardada en PostgreSQL.

                await solicitar(
                    `/api/rangos/${encodeURIComponent(temperatura.id)}`,
                    {
                        method: "PUT",
                        body: JSON.stringify(nuevosTemperatura)
                    }
                );

                await solicitar(
                    `/api/rangos/${encodeURIComponent(humedad.id)}`,
                    {
                        method: "PUT",
                        body: JSON.stringify(nuevosHumedad)
                    }
                );

                await cargarRangos();

                mostrarMensaje(
                    "mensaje-rangos",
                    "Los rangos se actualizaron correctamente y se consultaron nuevamente desde el backend."
                );

            } catch (error) {
                console.error(
                    "Error al guardar rangos:",
                    error
                );

                mostrarMensaje(
                    "mensaje-rangos",
                    "No se pudo completar el guardado: " +
                    error.message +
                    ". Una parte de los cambios podría haberse aplicado. Recargue los rangos para verificar.",
                    true
                );

            } finally {
                datos.guardando = false;

                if (selector) {
                    selector.disabled = false;
                }

                if (botonRecargar) {
                    botonRecargar.disabled = false;
                }

                actualizarBotonGuardar();
            }
        }

        async function recargarRangos() {
            if (datos.guardando) {
                return;
            }

            const boton = $("boton-restablecer-rangos");

            if (boton) {
                boton.disabled = true;
            }

            try {
                await cargarRangos();

                mostrarMensaje(
                    "mensaje-rangos",
                    "Rangos recuperados desde el backend."
                );

            } catch (error) {
                mostrarMensaje(
                    "mensaje-rangos",
                    `No se pudieron recuperar los rangos: ${error.message}`,
                    true
                );

            } finally {
                if (boton) {
                    boton.disabled = false;
                }

                actualizarBotonGuardar();
            }
        }

        // ====================================================
        // 8. CÁLCULOS TERMODINÁMICOS
        // ====================================================

        function leerNumero(id) {
            const campo = $(id);

            if (!campo || campo.value.trim() === "") {
                throw new Error(
                    "Complete todos los campos de la calculadora."
                );
            }

            const numero = Number(campo.value);

            if (!Number.isFinite(numero)) {
                throw new Error(
                    "Introduzca valores numéricos válidos."
                );
            }

            return numero;
        }

        function limpiarResultados() {
            escribir("resultado-rocio", "—");
            escribir("resultado-humedad-absoluta", "—");
            escribir("resultado-presion-vapor", "—");
            escribir("resultado-tasa-termica", "—");
        }

        function formatearResultado(valor, unidad) {
            if (
                valor === null ||
                !Number.isFinite(valor)
            ) {
                return "No definido";
            }

            return `${valor.toFixed(2)} ${unidad}`;
        }

        function calcularTermodinamica() {
            try {
                const T = leerNumero("calc-temperatura");
                const HR = leerNumero("calc-humedad");

                const temperaturaAnterior = leerNumero(
                    "calc-temperatura-anterior"
                );

                const minutos = leerNumero("calc-intervalo");

                // Rango operativo del DHT22.
                if (
                    T < -40 ||
                    T > 80 ||
                    temperaturaAnterior < -40 ||
                    temperaturaAnterior > 80
                ) {
                    throw new Error(
                        "La temperatura debe estar entre -40 °C y 80 °C."
                    );
                }

                if (HR < 0 || HR > 100) {
                    throw new Error(
                        "La humedad relativa debe estar entre 0 y 100 %."
                    );
                }

                if (minutos <= 0) {
                    throw new Error(
                        "El intervalo debe ser mayor que cero."
                    );
                }

                // --------------------------------------------
                // Presión de saturación (hPa)
                // Aproximación de Magnus-Tetens
                // --------------------------------------------

                const presionSaturacion =
                    6.112 * Math.exp(
                        (17.67 * T) / (T + 243.5)
                    );

                // --------------------------------------------
                // Presión parcial del vapor (hPa y kPa)
                // --------------------------------------------

                const presionVaporHpa =
                    (HR / 100) * presionSaturacion;

                const presionVaporKpa =
                    presionVaporHpa / 10;

                // --------------------------------------------
                // Punto de rocío (°C)
                // --------------------------------------------

                let puntoRocio = null;

                if (HR > 0) {
                    const gamma =
                        Math.log(HR / 100) +
                        (17.62 * T) / (243.12 + T);

                    puntoRocio =
                        (243.12 * gamma) /
                        (17.62 - gamma);
                }

                // --------------------------------------------
                // Humedad absoluta (g/m³)
                // --------------------------------------------

                const humedadAbsoluta =
                    (216.7 * presionVaporHpa) /
                    (T + 273.15);

                // --------------------------------------------
                // Tasa media de variación térmica (°C/min)
                // --------------------------------------------

                const tasaTermica =
                    (T - temperaturaAnterior) / minutos;

                // --------------------------------------------
                // Mostrar resultados
                // --------------------------------------------

                escribir(
                    "resultado-rocio",
                    formatearResultado(puntoRocio, "°C")
                );

                escribir(
                    "resultado-humedad-absoluta",
                    formatearResultado(
                        humedadAbsoluta,
                        "g/m³"
                    )
                );

                escribir(
                    "resultado-presion-vapor",
                    formatearResultado(
                        presionVaporKpa,
                        "kPa"
                    )
                );

                escribir(
                    "resultado-tasa-termica",
                    formatearResultado(
                        tasaTermica,
                        "°C/min"
                    )
                );

                mostrarMensaje("mensaje-calculos", "");

            } catch (error) {
                limpiarResultados();

                mostrarMensaje(
                    "mensaje-calculos",
                    error.message,
                    true
                );
            }
        }

        // ====================================================
        // 9. USUARIOS
        // ====================================================

        function cargarUsuarios() {
            // No mostrar usuarios ficticios como reales.
            // Requiere endpoint autorizado en el backend.

            escribir("settings-total-usuarios", "—");

            escribir(
                "settings-usuarios-count",
                "Sin consulta"
            );

            crearTabla(
                "cuerpo-usuarios",
                [],
                () => []
            );

            mostrarMensaje(
                "mensaje-usuarios",
                "El listado de usuarios está pendiente de integración con un endpoint autorizado."
            );
        }

        // ====================================================
        // 10. INFORMACIÓN DEL SISTEMA
        // ====================================================

        function cargarSistema() {
            const registros = [
                ["Proyecto", "SMART CLASSROOM"],
                ["Institución", "Universidad de El Salvador"],
                ["Frontend", "HTML, CSS y JavaScript"],
                ["Backend", "Rust + Axum"],
                ["Base de datos", "PostgreSQL / Supabase"],
                ["Dirección API", API_URL],
                ["Microcontrolador", "ESP32"],
                ["Sensor ambiental", "DHT22"],
                [
                    "Variables medidas",
                    "Temperatura y humedad relativa"
                ],
                [
                    "Variables calculadas",
                    "Punto de rocío, humedad absoluta, presión parcial del vapor y tasa térmica"
                ],
                [
                    "Rangos ambientales",
                    "Consulta y actualización mediante API"
                ],
                [
                    "Cálculos termodinámicos",
                    "Realizados localmente en el navegador"
                ]
            ];

            crearTabla(
                "cuerpo-sistema",
                registros,
                (fila) => fila
            );

            mostrarMensaje("mensaje-sistema", "");
        }

        // ====================================================
        // 11. CAMPANA DE ALERTAS
        // ====================================================

        async function actualizarCampana() {
            const campana = document.querySelector(
                ".notification-button"
            );

            const contador = $("notification-count");

            if (!campana || !contador) {
                return;
            }

            campana.href = "alertas.html";
            campana.setAttribute(
                "aria-label",
                "Ver alertas ambientales"
            );

            try {
                const respuesta = await solicitar(
                    "/api/alertas"
                );

                const alertas = extraerLista(
                    respuesta,
                    "alertas"
                );

                const cantidad = alertas.filter((alerta) => {
                    const estado = normalizarTexto(
                        alerta.estado
                    );

                    return [
                        "activa",
                        "activo",
                        "pendiente"
                    ].includes(estado);
                }).length;

                contador.textContent =
                    cantidad > 99
                        ? "99+"
                        : String(cantidad);

                contador.hidden = cantidad === 0;

                campana.title =
                    `${cantidad} alertas activas`;

                campana.setAttribute(
                    "aria-label",
                    `Ver alertas ambientales: ${cantidad} activas`
                );

                registrarServicio("alertas", true);

            } catch (error) {
                contador.hidden = true;

                campana.title =
                    "No se pudo consultar el estado de las alertas";

                registrarServicio("alertas", false);

                console.warn(
                    "No se pudo actualizar la campana:",
                    error
                );
            }
        }

        // ====================================================
        // 12. CERRAR SESIÓN
        // ====================================================

        function crearBotonCerrarSesion() {
            const principal = $("main-content");

            if (
                !principal ||
                $("cerrar-sesion")
            ) {
                return;
            }

            const seccion = document.createElement("section");
            seccion.id = "seccion-cerrar-sesion";
            seccion.className = "settings-panel";

            const encabezado = document.createElement("div");
            encabezado.className = "settings-panel-heading";

            const izquierda = document.createElement("div");
            izquierda.className = "settings-heading-left";

            const icono = document.createElement("div");
            icono.className = "settings-section-icon";

            const dibujo = document.createElement("i");
            dibujo.setAttribute(
                "data-lucide",
                "log-out"
            );

            icono.appendChild(dibujo);

            const textos = document.createElement("div");

            const titulo = document.createElement("h2");
            titulo.id = "titulo-cerrar-sesion";
            titulo.textContent = "Sesión de usuario";

            const descripcion = document.createElement("p");
            descripcion.textContent =
                "Finaliza tu sesión en SMART CLASSROOM.";

            textos.append(titulo, descripcion);
            izquierda.append(icono, textos);
            encabezado.appendChild(izquierda);

            seccion.setAttribute(
                "aria-labelledby",
                "titulo-cerrar-sesion"
            );

            const acciones = document.createElement("div");
            acciones.className = "settings-actions";
            acciones.style.marginTop = "20px";

            const boton = document.createElement("button");
            boton.id = "cerrar-sesion";
            boton.type = "button";
            boton.className =
                "settings-button settings-button-primary";

            const iconoBoton = document.createElement("i");
            iconoBoton.setAttribute(
                "data-lucide",
                "log-out"
            );

            const textoBoton = document.createElement("span");
            textoBoton.textContent = "Cerrar sesión";

            boton.append(iconoBoton, textoBoton);
            acciones.appendChild(boton);

            seccion.append(encabezado, acciones);

            const sistema = $("seccion-sistema");

            if (sistema) {
                sistema.insertAdjacentElement(
                    "afterend",
                    seccion
                );
            } else {
                principal.appendChild(seccion);
            }

            boton.addEventListener("click", () => {
                const confirmar = window.confirm(
                    "¿Deseas cerrar sesión en SMART CLASSROOM?"
                );

                if (!confirmar) {
                    return;
                }

                sessionStorage.removeItem("sc_token");
                sessionStorage.removeItem("sc_user");

                // Se utiliza la misma carpeta /pages.
                // Verificar que el archivo se llame Login.html.
                window.location.replace("Login.html");
            });

            actualizarIconos();
        }

        // ====================================================
        // 13. TEXTOS DEL MÓDULO
        // ====================================================

        function actualizarTextos() {
            const aviso = document.querySelector(
                ".settings-notice span"
            );

            if (aviso) {
                aviso.textContent =
                    "Las aulas, dispositivos y rangos se consultan " +
                    "mediante la API de SMART CLASSROOM. " +
                    "Los cambios de rangos se envían al backend. " +
                    "Los cálculos termodinámicos utilizan " +
                    "valores introducidos manualmente.";
            }

            const etiquetaRangos = document.querySelector(
                "#seccion-rangos .settings-demo-tag"
            );

            if (etiquetaRangos) {
                etiquetaRangos.textContent =
                    "CONFIGURACIÓN API";
            }

            const etiquetaFormulas = document.querySelector(
                "#seccion-formulas .settings-demo-tag"
            );

            if (etiquetaFormulas) {
                etiquetaFormulas.textContent =
                    "CÁLCULO LOCAL";
            }

            const etiquetaSistema = document.querySelector(
                "#seccion-sistema .settings-demo-tag"
            );

            if (etiquetaSistema) {
                etiquetaSistema.textContent =
                    "INFORMACIÓN TÉCNICA";
            }

            const ayudaRangos = document.querySelector(
                "#seccion-rangos .settings-helper"
            );

            if (ayudaRangos) {
                ayudaRangos.textContent =
                    "Los rangos se consultan y actualizan " +
                    "mediante la API. Su aplicación a las alertas " +
                    "depende de la lógica implementada en el backend.";
            }

            const botonRecargar =
                $("boton-restablecer-rangos");

            if (botonRecargar) {
                const texto = Array.from(
                    botonRecargar.childNodes
                ).find(
                    (nodo) => nodo.nodeType === Node.TEXT_NODE
                );

                if (texto) {
                    texto.textContent = " Recargar rangos";
                } else {
                    botonRecargar.append(
                        document.createTextNode(" Recargar rangos")
                    );
                }
            }

            const textoPresion = document.querySelector(
                "#resultado-presion-vapor + small"
            );

            if (textoPresion) {
                textoPresion.textContent =
                    "kPa · Presión parcial del vapor";
            }

            const descripcionUsuarios = document.querySelector(
                "#seccion-usuarios .settings-heading-left p"
            );

            if (descripcionUsuarios) {
                descripcionUsuarios.textContent =
                    "Consulta de usuarios pendiente de integración autorizada.";
            }

            const descripcionAulas = document.querySelector(
                "#seccion-aulas .settings-heading-left p"
            );

            if (descripcionAulas) {
                descripcionAulas.textContent =
                    "Aulas consultadas desde el backend.";
            }

            const descripcionDispositivos =
                document.querySelector(
                    "#seccion-dispositivos .settings-heading-left p"
                );

            if (descripcionDispositivos) {
                descripcionDispositivos.textContent =
                    "Dispositivos registrados en el sistema.";
            }
        }

        // ====================================================
        // 14. NAVEGACIÓN INTERNA
        // ====================================================

        function configurarNavegacion() {
            const pestañas = document.querySelectorAll(
                ".settings-tab"
            );

            function activarPestaña(hash) {
                pestañas.forEach((pestaña) => {
                    const activa =
                        pestaña.getAttribute("href") === hash;

                    pestaña.classList.toggle(
                        "active",
                        activa
                    );

                    if (activa) {
                        pestaña.setAttribute(
                            "aria-current",
                            "location"
                        );
                    } else {
                        pestaña.removeAttribute(
                            "aria-current"
                        );
                    }
                });
            }

            pestañas.forEach((pestaña) => {
                pestaña.addEventListener("click", () => {
                    activarPestaña(
                        pestaña.getAttribute("href")
                    );
                });
            });

            window.addEventListener("hashchange", () => {
                activarPestaña(window.location.hash);
            });

            if (window.location.hash) {
                activarPestaña(window.location.hash);
            }
        }

        // ====================================================
        // 15. EVENTOS
        // ====================================================

        function configurarEventos() {
            $("form-rangos")?.addEventListener(
                "submit",
                async (evento) => {
                    evento.preventDefault();
                    await guardarRangos();
                }
            );

            $("boton-restablecer-rangos")
                ?.addEventListener(
                    "click",
                    async () => {
                        await recargarRangos();
                    }
                );

            $("form-termodinamica")
                ?.addEventListener(
                    "submit",
                    (evento) => {
                        evento.preventDefault();
                        calcularTermodinamica();
                    }
                );
        }

        // ====================================================
        // 16. INICIALIZACIÓN
        // ====================================================

        async function iniciar() {
            crearSelectorAulas();
            crearBotonCerrarSesion();

            actualizarTextos();
            configurarNavegacion();
            configurarEventos();

            cargarUsuarios();
            cargarSistema();

            escribir(
                "settings-total-variables",
                "6"
            );

            // La calculadora funciona sin conexión.
            calcularTermodinamica();

            actualizarIconos();

            // Consultas independientes:
            // el fallo de una no impide cargar las demás.

            await Promise.allSettled([
                cargarAulas(),
                cargarTipos(),
                cargarRangos(),
                actualizarCampana()
            ]);

            // Dispositivos después de aulas para mostrar
            // correctamente el nombre de cada aula.
            await cargarDispositivos();

            mostrarRangos();
            actualizarConexion();

            // Actualización periódica de alertas.
            window.setInterval(
                actualizarCampana,
                INTERVALO_ALERTAS
            );

            console.info(
                "SMART CLASSROOM: Configuración inicializada."
            );

            console.info(
                "SMART CLASSROOM: API:",
                API_URL
            );
        }

        iniciar().catch((error) => {
            console.error(
                "Error al inicializar Configuración:",
                error
            );
        });

    });

})();
