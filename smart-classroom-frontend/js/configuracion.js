
/* ============================================================
   SMART CLASSROOM - CONFIGURACIÓN
   Universidad de El Salvador

   Integración:
   - Aulas reales
   - Dispositivos reales
   - Rangos ambientales por aula
   - Cálculos termodinámicos
   - Campana con alertas activas
   - Botón Cerrar sesión

   Backend: Rust + Axum
   Base de datos: PostgreSQL / Supabase
   ============================================================ */

(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const API = (
            window.SMART_CLASSROOM_CONFIG?.API_URL ||
            "http://localhost:3000"
        ).replace(/\/$/, "");

        const $ = id => document.getElementById(id);

        const datos = {
            aulas: [],
            dispositivos: [],
            rangos: [],
            tipos: [],
            aulaId: "",
            tiposValidos: false,
            rangosValidos: false,
            guardando: false
        };

        // ====================================================
        // 1. COMUNICACIÓN CON EL BACKEND
        // ====================================================

        async function solicitar(ruta, opciones = {}) {
            const token = sessionStorage.getItem("sc_token");

            const respuesta = await fetch(API + ruta, {
                ...opciones,
                headers: {
                    Accept: "application/json",
                    ...(opciones.body !== undefined
                        ? {"Content-Type": "application/json"}
                        : {}),
                    ...(token
                        ? {Authorization: `Bearer ${token}`}
                        : {}),
                    ...(opciones.headers || {})
                }
            });

            const texto = await respuesta.text();
            let resultado = null;

            if (texto) {
                try {
                    resultado = JSON.parse(texto);
                } catch {
                    resultado = texto;
                }
            }

            if (!respuesta.ok) {
                throw new Error(
                    typeof resultado === "string"
                        ? resultado
                        : resultado?.message ||
                          resultado?.error ||
                          `HTTP ${respuesta.status}`
                );
            }

            return resultado;
        }

        function lista(respuesta, propiedad) {
            if (Array.isArray(respuesta)) return respuesta;

            if (Array.isArray(respuesta?.[propiedad])) {
                return respuesta[propiedad];
            }

            if (Array.isArray(respuesta?.data)) {
                return respuesta.data;
            }

            throw new Error(
                "La API no devolvió una lista válida."
            );
        }

        // ====================================================
        // 2. UTILIDADES
        // ====================================================

        function escribir(id, valor) {
            const elemento = $(id);
            if (elemento) {
                elemento.textContent = String(valor);
            }
        }

        function mensaje(id, texto, error = false) {
            const elemento = $(id);
            if (!elemento) return;

            elemento.textContent = texto;
            elemento.hidden = !texto;
            elemento.classList.toggle("error", error);
        }

        function crearTabla(id, registros, columnas) {
            const cuerpo = $(id);
            if (!cuerpo) return;

            cuerpo.replaceChildren();

            const tabla = cuerpo.closest("table");
            if (tabla) tabla.hidden = false;

            for (const registro of registros) {
                const fila = document.createElement("tr");

                for (const valor of columnas(registro)) {
                    const celda = document.createElement("td");
                    celda.textContent = String(valor ?? "—");
                    fila.appendChild(celda);
                }

                cuerpo.appendChild(fila);
            }
        }

        function conexion(activa) {
            escribir(
                "connection-status",
                activa ? "API conectada" : "API desconectada"
            );

            escribir(
                "sidebar-status-text",
                activa ? "Backend conectado" : "Backend desconectado"
            );

            const punto = $("sidebar-status-dot");

            if (punto) {
                punto.style.backgroundColor =
                    activa ? "#22c55e" : "#ef4444";
            }
        }

        function nombreAula(id) {
            const aula = datos.aulas.find(a => a.id === id);
            return aula?.nombre || "Aula no identificada";
        }

        function actualizarIconos() {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        // ====================================================
        // 3. AULAS
        // ====================================================

        async function cargarAulas() {
            datos.aulas = lista(
                await solicitar("/api/aulas"),
                "aulas"
            );

            escribir("settings-total-aulas", datos.aulas.length);

            escribir(
                "settings-aulas-count",
                `${datos.aulas.length} aulas`
            );

            crearTabla(
                "cuerpo-aulas",
                datos.aulas,
                aula => [
                    `${aula.codigo} · ${aula.nombre}`
                ]
            );

            mensaje(
                "mensaje-aulas",
                datos.aulas.length
                    ? ""
                    : "No hay aulas registradas."
            );

            const selector = $("selector-aula-rangos");
            if (!selector) return;

            selector.replaceChildren();

            const inicial = document.createElement("option");
            inicial.value = "";
            inicial.textContent = "Seleccione un aula";
            selector.appendChild(inicial);

            for (const aula of datos.aulas) {
                const opcion = document.createElement("option");
                opcion.value = aula.id;
                opcion.textContent =
                    `${aula.codigo} · ${aula.nombre}`;
                selector.appendChild(opcion);
            }

            if (datos.aulas.some(a => a.id === datos.aulaId)) {
                selector.value = datos.aulaId;
            }
        }

        function crearSelectorAulas() {
            const formulario = $("form-rangos");
            if (!formulario || $("selector-aula-rangos")) return;

            const contenedor = document.createElement("div");
            contenedor.className = "settings-field";
            contenedor.style.marginBottom = "22px";

            const etiqueta = document.createElement("label");
            etiqueta.htmlFor = "selector-aula-rangos";
            etiqueta.textContent =
                "Seleccione el aula que desea configurar";

            const selector = document.createElement("select");
            selector.id = "selector-aula-rangos";
            selector.name = "aula_id";
            selector.required = true;

            selector.style.cssText = `
                display: block;
                width: 100%;
                margin-top: 10px;
                padding: 12px;
                border: 1px solid #41454d;
                border-radius: 8px;
                background: #202329;
                color: #ffffff;
                font: inherit;
            `;

            contenedor.append(etiqueta, selector);
            formulario.prepend(contenedor);

            selector.addEventListener("change", () => {
                datos.aulaId = selector.value;
                mostrarRangos();
            });
        }

        // ====================================================
        // 4. DISPOSITIVOS
        // ====================================================

        async function cargarDispositivos() {
            datos.dispositivos = lista(
                await solicitar("/api/dispositivos"),
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
                dispositivo => [
                    `${dispositivo.nombre} (${dispositivo.identificador})`,
                    nombreAula(dispositivo.aula_id),
                    "ESP32",
                    dispositivo.estado
                ]
            );

            const cuerpo = $("cuerpo-dispositivos");

            cuerpo?.querySelectorAll("tr").forEach(fila => {
                const celda = fila.cells[3];
                if (!celda) return;

                const valor = celda.textContent.trim();

                const etiqueta = document.createElement("span");
                etiqueta.className = "settings-device-status";

                etiqueta.classList.add(
                    valor === "activo"
                        ? "ready"
                        : valor === "mantenimiento"
                            ? "pending"
                            : "offline"
                );

                const punto = document.createElement("span");
                punto.className = "settings-device-dot";

                const texto = document.createElement("span");
                texto.textContent = valor;

                etiqueta.append(punto, texto);
                celda.replaceChildren(etiqueta);
            });

            mensaje(
                "mensaje-dispositivos",
                datos.dispositivos.length
                    ? ""
                    : "No hay dispositivos registrados."
            );
        }

        // ====================================================
        // 5. RANGOS AMBIENTALES
        // ====================================================

        function variableSensor(tipo) {
            const nombre = String(tipo?.nombre || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            if (nombre.includes("temperatura")) {
                return "temperatura";
            }

            if (nombre.includes("humedad")) {
                return "humedad";
            }

            return null;
        }

        function buscarRango(variable) {
            return datos.rangos.find(rango => {
                if (rango.aula_id !== datos.aulaId) return false;
                if (!rango.activo) return false;

                const tipo = datos.tipos.find(
                    t => t.id === rango.tipo_sensor_id
                );

                return variableSensor(tipo) === variable;
            });
        }

        async function cargarTipos() {
            datos.tiposValidos = false;

            try {
                datos.tipos = lista(
                    await solicitar("/api/tipos-sensor"),
                    "tipos_sensor"
                );

                datos.tiposValidos = true;
            } catch (error) {
                datos.tipos = [];
                console.warn("Tipos de sensor:", error);
            }
        }

        async function cargarRangos() {
            datos.rangosValidos = false;

            datos.rangos = lista(
                await solicitar("/api/rangos"),
                "rangos"
            );

            datos.rangosValidos = true;
            mostrarRangos();
        }

        function escribirRango(variable, rango) {
            const minimo = $(`rango-${variable}-min`);
            const maximo = $(`rango-${variable}-max`);

            if (minimo) {
                minimo.value = rango
                    ? String(rango.valor_minimo)
                    : "";
            }

            if (maximo) {
                maximo.value = rango
                    ? String(rango.valor_maximo)
                    : "";
            }
        }

        function mostrarRangos() {
            const temperatura = buscarRango("temperatura");
            const humedad = buscarRango("humedad");

            escribirRango("temperatura", temperatura);
            escribirRango("humedad", humedad);

            const permitido = Boolean(
                datos.aulaId &&
                datos.tiposValidos &&
                datos.rangosValidos &&
                temperatura &&
                humedad &&
                !datos.guardando
            );

            const boton = $("boton-guardar-rangos");
            if (boton) boton.disabled = !permitido;

            if (!datos.aulaId) {
                mensaje(
                    "mensaje-rangos",
                    "Seleccione un aula para consultar sus rangos."
                );
            } else if (!datos.tiposValidos) {
                mensaje(
                    "mensaje-rangos",
                    "No se pudieron identificar los tipos de sensor.",
                    true
                );
            } else if (!temperatura || !humedad) {
                mensaje(
                    "mensaje-rangos",
                    "Esta aula no tiene ambos rangos activos de temperatura y humedad."
                );
            } else {
                mensaje("mensaje-rangos", "");
            }
        }

        function leerRango(variable) {
            const minTexto = $(`rango-${variable}-min`)?.value.trim();
            const maxTexto = $(`rango-${variable}-max`)?.value.trim();

            if (!minTexto || !maxTexto) {
                throw new Error(
                    `Complete los límites de ${variable}.`
                );
            }

            const minimo = Number(minTexto);
            const maximo = Number(maxTexto);

            if (
                !Number.isFinite(minimo) ||
                !Number.isFinite(maximo) ||
                minimo >= maximo
            ) {
                throw new Error(
                    `El mínimo de ${variable} debe ser menor que el máximo.`
                );
            }

            if (variable === "temperatura" && minimo < -273.15) {
                throw new Error(
                    "La temperatura no puede ser inferior al cero absoluto."
                );
            }

            if (
                variable === "humedad" &&
                (minimo < 0 || maximo > 100)
            ) {
                throw new Error(
                    "La humedad relativa debe estar entre 0 y 100 %."
                );
            }

            return {
                valor_minimo: minimo,
                valor_maximo: maximo
            };
        }

        async function guardarRangos() {
            if (datos.guardando) return;

            const temperatura = buscarRango("temperatura");
            const humedad = buscarRango("humedad");

            if (!temperatura || !humedad) {
                mensaje(
                    "mensaje-rangos",
                    "Seleccione un aula con ambos rangos configurados.",
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
                mensaje("mensaje-rangos", error.message, true);
                return;
            }

            datos.guardando = true;
            mostrarRangos();

            try {
                await solicitar(`/api/rangos/${temperatura.id}`, {
                    method: "PUT",
                    body: JSON.stringify(nuevosTemperatura)
                });

                await solicitar(`/api/rangos/${humedad.id}`, {
                    method: "PUT",
                    body: JSON.stringify(nuevosHumedad)
                });

                await cargarRangos();

                mensaje(
                    "mensaje-rangos",
                    "Rangos guardados en PostgreSQL correctamente."
                );
            } catch (error) {
                mensaje(
                    "mensaje-rangos",
                    "No se completó el guardado: " +
                    error.message +
                    ". Recargue para verificar los valores.",
                    true
                );
            } finally {
                datos.guardando = false;

                const boton = $("boton-guardar-rangos");
                if (boton) {
                    boton.disabled = !Boolean(
                        buscarRango("temperatura") &&
                        buscarRango("humedad") &&
                        datos.tiposValidos
                    );
                }
            }
        }

        // ====================================================
        // 6. CÁLCULOS TERMODINÁMICOS
        // ====================================================

        function calcularTermodinamica() {
            const leer = id => {
                const campo = $(id);

                if (!campo || campo.value.trim() === "") {
                    throw new Error("Complete todos los campos.");
                }

                const numero = Number(campo.value);

                if (!Number.isFinite(numero)) {
                    throw new Error("Introduzca valores numéricos válidos.");
                }

                return numero;
            };

            try {
                const T = leer("calc-temperatura");
                const HR = leer("calc-humedad");
                const Tanterior = leer("calc-temperatura-anterior");
                const minutos = leer("calc-intervalo");

                if (T < -40 || T > 80 ||
                    Tanterior < -40 || Tanterior > 80) {
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

                // Presión de saturación, hPa.
                const es = 6.112 * Math.exp(
                    (17.67 * T) / (T + 243.5)
                );

                // Presión parcial de vapor, hPa.
                const e = (HR / 100) * es;

                // Punto de rocío, °C.
                let rocio = null;

                if (HR > 0) {
                    const gamma =
                        Math.log(HR / 100) +
                        (17.62 * T) / (243.12 + T);

                    rocio = (243.12 * gamma) / (17.62 - gamma);
                }

                // Humedad absoluta, g/m³.
                const absoluta = (216.7 * e) / (T + 273.15);

                // Presión parcial, kPa.
                const presionKpa = e / 10;

                // Variación térmica, °C/min.
                const tasa = (T - Tanterior) / minutos;

                const formato = (valor, unidad) =>
                    valor === null || !Number.isFinite(valor)
                        ? "No definido"
                        : `${valor.toFixed(2)} ${unidad}`;

                escribir(
                    "resultado-rocio",
                    formato(rocio, "°C")
                );

                escribir(
                    "resultado-humedad-absoluta",
                    formato(absoluta, "g/m³")
                );

                escribir(
                    "resultado-presion-vapor",
                    formato(presionKpa, "kPa")
                );

                escribir(
                    "resultado-tasa-termica",
                    formato(tasa, "°C/min")
                );

                mensaje("mensaje-calculos", "");
            } catch (error) {
                mensaje("mensaje-calculos", error.message, true);
            }
        }

        // ====================================================
        // 7. USUARIOS Y SISTEMA
        // ====================================================

        function cargarUsuarios() {
            escribir("settings-total-usuarios", "—");
            escribir("settings-usuarios-count", "Sin consulta");

            crearTabla("cuerpo-usuarios", [], () => []);

            mensaje(
                "mensaje-usuarios",
                "Listado de usuarios pendiente de integrar con un endpoint autorizado."
            );
        }

        function cargarSistema() {
            const registros = [
                ["Proyecto", "SMART CLASSROOM"],
                ["Institución", "Universidad de El Salvador"],
                ["Frontend", "HTML, CSS y JavaScript"],
                ["Backend", "Rust + Axum"],
                ["Base de datos", "PostgreSQL / Supabase"],
                ["Dirección API", API],
                ["Microcontrolador", "ESP32"],
                ["Sensor", "DHT22"],
                ["Variables medidas", "Temperatura y humedad"],
                ["Variables calculadas", "4"],
                ["Rangos", "Configuración por aula"]
            ];

            crearTabla(
                "cuerpo-sistema",
                registros,
                fila => fila
            );
        }

        // ====================================================
        // 8. CAMPANA DE ALERTAS REALES
        // ====================================================

        async function actualizarCampana() {
            const campana = document.querySelector(
                ".notification-button"
            );

            const contador = $("notification-count");

            if (!campana || !contador) return;

            campana.href = "alertas.html";
            campana.setAttribute(
                "aria-label",
                "Ver alertas ambientales"
            );

            try {
                const respuesta = await solicitar("/api/alertas");
                const alertas = lista(respuesta, "alertas");

                const activas = alertas.filter(alerta => {
                    const estado = String(alerta.estado || "")
                        .toLowerCase()
                        .trim();

                    return [
                        "activa",
                        "activo",
                        "pendiente"
                    ].includes(estado);
                });

                const cantidad = activas.length;

                contador.textContent =
                    cantidad > 99 ? "99+" : String(cantidad);

                contador.hidden = cantidad === 0;

                campana.title =
                    `${cantidad} alertas activas`;

            } catch (error) {
                console.error(
                    "No se pudieron consultar las alertas:",
                    error
                );

                contador.hidden = true;
                campana.title =
                    "No se pudo consultar el estado de las alertas";
            }
        }

        // ====================================================
        // 9. BOTÓN CERRAR SESIÓN AL FINAL
        // ====================================================

        function crearBotonCerrarSesion() {
            const principal = $("main-content");

            if (!principal || $("cerrar-sesion")) return;

            const seccion = document.createElement("section");
            seccion.id = "seccion-cerrar-sesion";
            seccion.className = "settings-panel";

            seccion.style.cssText = `
                margin-top: 26px;
                margin-bottom: 28px;
            `;

            const encabezado = document.createElement("div");
            encabezado.className = "settings-panel-heading";

            const izquierda = document.createElement("div");
            izquierda.className = "settings-heading-left";

            const icono = document.createElement("div");
            icono.className = "settings-section-icon";

            const dibujo = document.createElement("i");
            dibujo.setAttribute("data-lucide", "log-out");
            icono.appendChild(dibujo);

            const textos = document.createElement("div");

            const titulo = document.createElement("h2");
            titulo.textContent = "Sesión de usuario";

            const descripcion = document.createElement("p");
            descripcion.textContent =
                "Finaliza tu sesión en SMART CLASSROOM.";

            textos.append(titulo, descripcion);
            izquierda.append(icono, textos);
            encabezado.appendChild(izquierda);

            const acciones = document.createElement("div");
            acciones.style.cssText = `
                display: flex;
                justify-content: flex-end;
                margin-top: 20px;
            `;

            const boton = document.createElement("button");
            boton.id = "cerrar-sesion";
            boton.type = "button";
            boton.className =
                "settings-button settings-button-primary";

            boton.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                min-width: 190px;
                padding: 13px 22px;
                border-radius: 10px;
                background: #dba33b;
                color: #171717;
                border: 1px solid #e5b75c;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            `;

            const iconoBoton = document.createElement("i");
            iconoBoton.setAttribute("data-lucide", "log-out");

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

                if (!confirmar) return;

                sessionStorage.removeItem("sc_token");
                sessionStorage.removeItem("sc_user");

                // Login.html está en la carpeta principal del frontend.
                window.location.replace("../Login.html");
            });

            actualizarIconos();
        }

        // ====================================================
        // 10. TEXTOS Y NAVEGACIÓN
        // ====================================================

        function actualizarTextos() {
            const aviso = document.querySelector(
                ".settings-notice span"
            );

            if (aviso) {
                aviso.textContent =
                    "Las aulas, dispositivos y rangos se consultan " +
                    "mediante la API de SMART CLASSROOM. " +
                    "Los cálculos termodinámicos utilizan " +
                    "valores introducidos manualmente.";
            }

            document.querySelectorAll(
                ".settings-demo-tag"
            ).forEach(etiqueta => {
                etiqueta.textContent = "DATOS DEL SISTEMA";
            });

            document.querySelectorAll(
                ".settings-stat small"
            ).forEach(elemento => {
                if (
                    elemento.textContent.includes(
                        "demostración"
                    )
                ) {
                    elemento.textContent =
                        "Registros del sistema";
                }
            });

            const recargar = $("boton-restablecer-rangos");

            if (recargar) {
                const texto = recargar.querySelector("span");

                if (texto) {
                    texto.textContent = "Recargar rangos";
                }
            }
        }

        function configurarNavegacion() {
            const pestañas = document.querySelectorAll(
                ".settings-tab"
            );

            pestañas.forEach(pestaña => {
                pestaña.addEventListener("click", () => {
                    pestañas.forEach(elemento => {
                        elemento.classList.remove("active");
                    });

                    pestaña.classList.add("active");
                });
            });
        }

        // ====================================================
        // 11. EVENTOS
        // ====================================================

        function configurarEventos() {
            $("form-rangos")?.addEventListener(
                "submit",
                async evento => {
                    evento.preventDefault();
                    await guardarRangos();
                }
            );

            $("boton-restablecer-rangos")?.addEventListener(
                "click",
                async () => {
                    try {
                        await cargarRangos();

                        mensaje(
                            "mensaje-rangos",
                            "Rangos recuperados desde PostgreSQL."
                        );
                    } catch (error) {
                        mensaje(
                            "mensaje-rangos",
                            error.message,
                            true
                        );
                    }
                }
            );

            $("form-termodinamica")?.addEventListener(
                "submit",
                evento => {
                    evento.preventDefault();
                    calcularTermodinamica();
                }
            );
        }

        // ====================================================
        // 12. INICIALIZACIÓN
        // ====================================================

        async function iniciar() {
            conexion(false);

            crearSelectorAulas();
            crearBotonCerrarSesion();
            actualizarTextos();
            configurarNavegacion();
            configurarEventos();

            cargarUsuarios();
            cargarSistema();

            escribir("settings-total-variables", "6");

            // Funciones independientes del backend.
            calcularTermodinamica();

            // Consultar las alertas reales.
            await actualizarCampana();

            // Refrescar el contador cada 30 segundos.
            setInterval(actualizarCampana, 30000);

            let aulasCorrectas = false;
            let dispositivosCorrectos = false;
            let rangosCorrectos = false;

            try {
                await cargarAulas();
                aulasCorrectas = true;
            } catch (error) {
                console.error("Aulas:", error);
                mensaje("mensaje-aulas", error.message, true);
            }

            try {
                await cargarDispositivos();
                dispositivosCorrectos = true;
            } catch (error) {
                console.error("Dispositivos:", error);
                mensaje("mensaje-dispositivos", error.message, true);
            }

            await cargarTipos();

            try {
                await cargarRangos();
                rangosCorrectos = true;
            } catch (error) {
                console.error("Rangos:", error);
                mensaje("mensaje-rangos", error.message, true);
            }

            mostrarRangos();

            conexion(
                aulasCorrectas &&
                dispositivosCorrectos &&
                rangosCorrectos
            );

            actualizarIconos();

            console.log(
                "SMART CLASSROOM: Configuración inicializada."
            );
        }

        iniciar();
    });
})();
