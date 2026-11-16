
"use strict";

/* ============================================================
   SMART CLASSROOM — CENTRO DE ALERTAS
   Universidad de El Salvador

   Backend: Rust + Axum
   Base de datos: PostgreSQL / Supabase

   Endpoints:
   GET /api/aulas
   GET /api/alertas
   PUT /api/alertas/{id}/estado

   Sin registros simulados.
   ============================================================ */

(() => {
    document.addEventListener("DOMContentLoaded", () => {

        // ====================================================
        // 1. CONFIGURACIÓN
        // ====================================================

        const API_URL = String(
            window.SMART_CLASSROOM_CONFIG?.API_URL ||
            "https://smart-classroom-hitb.onrender.com"
        ).replace(/\/+$/, "");

        const POR_PAGINA = 10;
        const ZONA_HORARIA = "America/El_Salvador";

        const $ = id => document.getElementById(id);

        const estado = {
            aulas: [],
            alertas: [],
            filtradas: [],
            pagina: 1,
            guardando: null,
            cargando: false,
            error: false,
            numeroConsulta: 0
        };

        const nombresVariables = {
            temperatura: "Temperatura",
            humedad: "Humedad relativa"
        };

        // ====================================================
        // 2. COMUNICACIÓN CON EL BACKEND
        // ====================================================

        async function peticion(ruta, opciones = {}) {
            const token = sessionStorage.getItem("sc_token");

            const headers = {
                Accept: "application/json",
                ...(opciones.body !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(token
                    ? { Authorization: `Bearer ${token}` }
                    : {}),
                ...(opciones.headers || {})
            };

            const respuesta = await fetch(API_URL + ruta, {
                ...opciones,
                headers
            });

            const texto = await respuesta.text();

            let datos = null;

            if (texto) {
                try {
                    datos = JSON.parse(texto);
                } catch {
                    datos = texto;
                }
            }

            if (!respuesta.ok) {
                const detalle =
                    typeof datos === "string"
                        ? datos
                        : datos?.mensaje ||
                          datos?.message ||
                          datos?.error ||
                          `Error HTTP ${respuesta.status}`;

                throw new Error(String(detalle));
            }

            return datos;
        }

        function lista(respuesta, clave) {
            if (Array.isArray(respuesta)) {
                return respuesta;
            }

            if (Array.isArray(respuesta?.[clave])) {
                return respuesta[clave];
            }

            if (Array.isArray(respuesta?.datos)) {
                return respuesta.datos;
            }

            if (Array.isArray(respuesta?.data)) {
                return respuesta.data;
            }

            throw new Error(
                "El servidor no devolvió una lista válida."
            );
        }

        // ====================================================
        // 3. UTILIDADES
        // ====================================================

        function escribir(id, valor) {
            const elemento = $(id);

            if (elemento) {
                elemento.textContent = String(valor);
            }
        }

        function mensaje(texto, esError = false) {
            const elemento = $("mensaje");

            if (!elemento) return;

            elemento.textContent = texto;
            elemento.hidden = !texto;
            elemento.classList.toggle("error", esError);
        }

        function aviso(texto) {
            escribir("alerts-notice-text", texto);
        }

        // Los indicadores globales de conexión
        // pertenecen a layout.js.

        function iconos() {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        function fechaValida(valor) {
            if (!valor) return null;

            const fecha = new Date(valor);

            return Number.isFinite(fecha.getTime())
                ? fecha
                : null;
        }

        function fechaLocal(valor) {
            const fecha = fechaValida(valor);

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
                partes.find(
                    parte => parte.type === tipo
                )?.value || "";

            return [
                obtener("year"),
                obtener("month"),
                obtener("day")
            ].join("-");
        }

        function formatearFecha(valor) {
            const fecha = fechaValida(valor);

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

        function normalizarTexto(valor) {
            return String(valor ?? "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
        }

        function normalizarVariable(valor) {
            const texto = normalizarTexto(valor);

            if (texto.includes("temperatura")) {
                return "temperatura";
            }

            if (texto.includes("humedad")) {
                return "humedad";
            }

            return texto;
        }

        function normalizarEstado(valor) {
            const texto = normalizarTexto(valor);

            if (
                ["activa", "activo", "pendiente"]
                    .includes(texto)
            ) {
                return "activa";
            }

            if (
                ["atendida", "atendido", "resuelta", "resuelto"]
                    .includes(texto)
            ) {
                return "atendida";
            }

            return texto || "desconocido";
        }

        function nombreAula(id) {
            const aula = estado.aulas.find(
                item => String(item.id) === String(id)
            );

            if (!aula) {
                return id || "Aula no disponible";
            }

            const codigo = aula.codigo || "";
            const nombre = aula.nombre || "";

            if (
                codigo &&
                nombre &&
                codigo !== nombre
            ) {
                return `${codigo} · ${nombre}`;
            }

            return codigo || nombre || String(id);
        }

        // ====================================================
        // 4. CARGAR AULAS
        // ====================================================

        async function cargarAulas() {
            const respuesta = await peticion("/api/aulas");

            estado.aulas = lista(respuesta, "aulas");

            const selector = $("filtro-aula");

            if (!selector) return;

            const anterior = selector.value;

            selector.replaceChildren();

            const todas = document.createElement("option");
            todas.value = "";
            todas.textContent = "Todas las aulas";
            selector.appendChild(todas);

            for (const aula of estado.aulas) {
                const opcion = document.createElement("option");

                opcion.value = String(aula.id);
                opcion.textContent = nombreAula(aula.id);

                selector.appendChild(opcion);
            }

            if (
                estado.aulas.some(
                    aula => String(aula.id) === anterior
                )
            ) {
                selector.value = anterior;
            }
        }

        // ====================================================
        // 5. NORMALIZACIÓN DE ALERTAS
        // ====================================================

        function normalizarAlerta(registro) {
            const medicion =
                registro.medicion &&
                typeof registro.medicion === "object"
                    ? registro.medicion
                    : {};

            const aula =
                registro.aula &&
                typeof registro.aula === "object"
                    ? registro.aula
                    : {};

            const sensor =
                registro.sensor &&
                typeof registro.sensor === "object"
                    ? registro.sensor
                    : {};

            const variable = normalizarVariable(
                registro.tipo_sensor ??
                registro.variable ??
                registro.nombre_tipo_sensor ??
                sensor.tipo_sensor ??
                medicion.tipo_sensor ??
                ""
            );

            const valorCrudo =
                registro.valor ??
                registro.valor_medido ??
                medicion.valor ??
                null;

            const valor =
                valorCrudo === null || valorCrudo === ""
                    ? null
                    : Number(valorCrudo);

            const aulaId =
                registro.aula_id ??
                aula.id ??
                medicion.aula_id ??
                null;

            const nombre =
                registro.aula_nombre ??
                registro.aula_codigo ??
                aula.codigo ??
                aula.nombre ??
                nombreAula(aulaId);

            return {
                id: registro.id,

                aula_id: aulaId === null
                    ? null
                    : String(aulaId),

                aula: String(nombre),

                variable,

                valor: Number.isFinite(valor)
                    ? valor
                    : null,

                unidad:
                    registro.unidad ??
                    medicion.unidad ??
                    (variable === "temperatura"
                        ? "°C"
                        : variable === "humedad"
                            ? "%"
                            : ""),

                fecha_hora:
                    registro.fecha_hora ??
                    registro.creada_en ??
                    registro.creado_en ??
                    registro.generada_en ??
                    registro.medido_en ??
                    medicion.medido_en ??
                    null,

                descripcion: String(
                    registro.mensaje ??
                    registro.descripcion ??
                    "Alerta ambiental registrada."
                ),

                tipo: String(registro.tipo ?? ""),

                estado: normalizarEstado(registro.estado)
            };
        }

        // ====================================================
        // 6. CONSULTAR ALERTAS REALES
        // ====================================================

        function actualizarBotonConsulta() {
            const boton = $("boton-buscar");

            if (boton) {
                boton.disabled =
                    estado.cargando ||
                    estado.guardando !== null;
            }
        }

        async function cargarAlertas() {
            const consulta = ++estado.numeroConsulta;

            estado.cargando = true;
            estado.error = false;

            actualizarBotonConsulta();

            aviso(
                "Consultando alertas registradas en PostgreSQL..."
            );

            try {
                const respuesta = await peticion("/api/alertas");

                if (consulta !== estado.numeroConsulta) {
                    return false;
                }

                estado.alertas = lista(respuesta, "alertas")
                    .map(normalizarAlerta)
                    .filter(alerta => alerta.id != null)
                    .sort(
                        (a, b) =>
                            (fechaValida(b.fecha_hora)?.getTime() || 0) -
                            (fechaValida(a.fecha_hora)?.getTime() || 0)
                    );

                estado.pagina = Math.max(1, estado.pagina);

                aplicarFiltros();

                aviso(
                    `Se consultaron ${estado.alertas.length} alertas reales del backend.`
                );

                return true;

            } catch (error) {
                if (consulta !== estado.numeroConsulta) {
                    return false;
                }

                estado.error = true;
                estado.alertas = [];
                estado.filtradas = [];

                aplicarFiltros();

                aviso(
                    "No se pudieron consultar las alertas."
                );

                mensaje(
                    "Error al consultar /api/alertas: " +
                    error.message,
                    true
                );

                console.error(
                    "SMART CLASSROOM - Error en alertas:",
                    error
                );

                return false;

            } finally {
                if (consulta === estado.numeroConsulta) {
                    estado.cargando = false;
                    actualizarBotonConsulta();
                }
            }
        }

        // ====================================================
        // 7. VALIDACIÓN Y FILTROS
        // ====================================================

        function filtrosValidos() {
            const inicio = $("fecha-inicial")?.value || "";
            const fin = $("fecha-final")?.value || "";

            if (inicio && fin && inicio > fin) {
                mensaje(
                    "La fecha inicial no puede ser posterior a la final.",
                    true
                );
                return false;
            }

            return true;
        }

        function aplicarFiltros() {
            if (!filtrosValidos()) return;

            const filtroEstado =
                $("filtro-estado")?.value || "";

            const filtroAula =
                $("filtro-aula")?.value || "";

            const filtroVariable =
                $("filtro-variable")?.value || "";

            const inicio =
                $("fecha-inicial")?.value || "";

            const fin =
                $("fecha-final")?.value || "";

            const busqueda = normalizarTexto(
                $("alerts-search")?.value
            );

            estado.filtradas = estado.alertas.filter(
                alerta => {

                    if (
                        filtroEstado &&
                        alerta.estado !== filtroEstado
                    ) {
                        return false;
                    }

                    if (
                        filtroAula &&
                        alerta.aula_id !== filtroAula
                    ) {
                        return false;
                    }

                    if (
                        filtroVariable &&
                        alerta.variable !== filtroVariable
                    ) {
                        return false;
                    }

                    const fecha = fechaLocal(
                        alerta.fecha_hora
                    );

                    if (inicio && fecha < inicio) {
                        return false;
                    }

                    if (fin && fecha > fin) {
                        return false;
                    }

                    if (busqueda) {
                        const contenido = normalizarTexto([
                            alerta.aula,
                            alerta.variable,
                            nombresVariables[alerta.variable] || "",
                            alerta.valor ?? "",
                            alerta.unidad,
                            alerta.descripcion,
                            alerta.estado,
                            alerta.tipo,
                            formatearFecha(alerta.fecha_hora)
                        ].join(" "));

                        if (!contenido.includes(busqueda)) {
                            return false;
                        }
                    }

                    return true;
                }
            );

            const paginas = Math.max(
                1,
                Math.ceil(
                    estado.filtradas.length / POR_PAGINA
                )
            );

            estado.pagina = Math.max(
                1,
                Math.min(estado.pagina, paginas)
            );

            actualizarIndicadores();
            mostrarTabla();
            actualizarPaginacion();
        }

        // ====================================================
        // 8. CONTADORES
        // ====================================================

        function actualizarIndicadores() {
            const activas = estado.filtradas.filter(
                alerta => alerta.estado === "activa"
            );

            const atendidas = estado.filtradas.filter(
                alerta => alerta.estado === "atendida"
            );

            const aulasAfectadas = new Set(
                activas
                    .map(alerta => alerta.aula_id)
                    .filter(Boolean)
            );

            escribir(
                "alerts-total",
                estado.filtradas.length
            );

            escribir(
                "alerts-active",
                activas.length
            );

            escribir(
                "alerts-attended",
                atendidas.length
            );

            escribir(
                "alerts-classrooms",
                aulasAfectadas.size
            );

            escribir(
                "alerts-results-description",
                `${estado.filtradas.length} alertas encontradas.`
            );

            escribir(
                "alerts-table-counter",
                `${estado.filtradas.length} alertas`
            );

            // El contador de la barra superior puede
            // ser compartido con layout.js.
            // No lo sobrescribimos desde este módulo.
        }

        // ====================================================
        // 9. CREACIÓN SEGURA DE CELDAS
        // ====================================================

        function celda(texto, clase = "") {
            const elemento = document.createElement("td");

            elemento.textContent = String(texto ?? "—");

            if (clase) {
                elemento.className = clase;
            }

            return elemento;
        }

        function celdaVariable(alerta) {
            const td = document.createElement("td");
            const contenedor = document.createElement("span");
            const punto = document.createElement("span");
            const texto = document.createElement("span");

            contenedor.className = "alerts-variable";
            punto.className = "alerts-variable-dot";

            if (alerta.variable === "humedad") {
                punto.classList.add("humidity");
            }

            texto.textContent =
                nombresVariables[alerta.variable] ||
                alerta.variable ||
                "No identificada";

            contenedor.append(punto, texto);
            td.appendChild(contenedor);

            return td;
        }

        function celdaEstado(alerta) {
            const td = document.createElement("td");
            const etiqueta = document.createElement("span");
            const punto = document.createElement("span");
            const texto = document.createElement("span");

            etiqueta.className = "alerts-status";
            punto.className = "alerts-status-dot";

            if (alerta.estado === "activa") {
                etiqueta.classList.add("active");
            } else if (alerta.estado === "atendida") {
                etiqueta.classList.add("attended");
            }

            texto.textContent =
                alerta.estado === "activa"
                    ? "Activa"
                    : alerta.estado === "atendida"
                        ? "Atendida"
                        : alerta.estado;

            etiqueta.append(punto, texto);
            td.appendChild(etiqueta);

            return td;
        }

        function celdaAccion(alerta) {
            const td = document.createElement("td");

            if (alerta.estado !== "activa") {
                const texto = document.createElement("span");

                texto.className = "alerts-action-done";
                texto.textContent = "Sin acciones";

                td.appendChild(texto);
                return td;
            }

            const boton = document.createElement("button");

            boton.type = "button";
            boton.className =
                "alerts-button alerts-attend-button";

            boton.textContent =
                estado.guardando === alerta.id
                    ? "Guardando..."
                    : "Marcar atendida";

            boton.disabled =
                estado.guardando !== null ||
                estado.cargando;

            boton.addEventListener("click", () => {
                marcarAtendida(alerta.id);
            });

            td.appendChild(boton);
            return td;
        }

        // ====================================================
        // 10. TABLA DE ALERTAS
        // ====================================================

        function mostrarTabla() {
            const cuerpo = $("tabla-cuerpo");
            const tabla = $("tabla-alertas");
            const vacio = $("alerts-empty");

            if (!cuerpo || !tabla || !vacio) {
                return;
            }

            cuerpo.replaceChildren();

            if (estado.filtradas.length === 0) {
                tabla.hidden = true;
                vacio.hidden = false;
                return;
            }

            tabla.hidden = false;
            vacio.hidden = true;

            const inicio =
                (estado.pagina - 1) * POR_PAGINA;

            const registros = estado.filtradas.slice(
                inicio,
                inicio + POR_PAGINA
            );

            const fragmento =
                document.createDocumentFragment();

            for (const alerta of registros) {
                const fila = document.createElement("tr");

                fila.appendChild(
                    celdaVariable(alerta)
                );

                fila.appendChild(
                    celda(
                        alerta.valor === null
                            ? "—"
                            : `${alerta.valor.toFixed(1)} ${alerta.unidad}`,
                        "alerts-value"
                    )
                );

                fila.appendChild(
                    celda(alerta.aula)
                );

                fila.appendChild(
                    celda(
                        formatearFecha(alerta.fecha_hora),
                        "alerts-date"
                    )
                );

                fila.appendChild(
                    celda(
                        alerta.descripcion,
                        "alerts-description"
                    )
                );

                fila.appendChild(
                    celdaEstado(alerta)
                );

                fila.appendChild(
                    celdaAccion(alerta)
                );

                fragmento.appendChild(fila);
            }

            cuerpo.appendChild(fragmento);
        }

        // ====================================================
        // 11. MARCAR ALERTA COMO ATENDIDA
        // ====================================================

        async function marcarAtendida(id) {
            if (
                estado.guardando !== null ||
                estado.cargando
            ) {
                return;
            }

            const alerta = estado.alertas.find(
                item => item.id === id
            );

            if (!alerta || alerta.estado !== "activa") {
                mensaje(
                    "La alerta no está activa.",
                    true
                );
                return;
            }

            estado.guardando = id;
            actualizarBotonConsulta();
            mostrarTabla();
            mensaje("");

            let cambioAceptado = false;

            try {
                await peticion(
                    `/api/alertas/${encodeURIComponent(id)}/estado`,
                    {
                        method: "PUT",
                        body: JSON.stringify({
                            estado: "atendida"
                        })
                    }
                );

                cambioAceptado = true;

                // Se vuelve a consultar PostgreSQL para
                // comprobar que el estado fue actualizado.
                const actualizado = await cargarAlertas();

                if (!actualizado) {
                    mensaje(
                        "El servidor aceptó el cambio, pero no fue posible " +
                        "verificarlo mediante una nueva consulta. " +
                        "Recarga la página para comprobar su estado.",
                        true
                    );
                    return;
                }

                const comprobacion = estado.alertas.find(
                    item => item.id === id
                );

                if (comprobacion?.estado === "atendida") {
                    mensaje(
                        "La alerta fue marcada como atendida " +
                        "y el cambio se verificó en PostgreSQL."
                    );
                } else {
                    mensaje(
                        "El cambio no aparece confirmado " +
                        "en la nueva consulta del backend.",
                        true
                    );
                }

            } catch (error) {
                mensaje(
                    cambioAceptado
                        ? "El servidor aceptó el cambio, pero ocurrió " +
                          "un error al verificarlo: " + error.message
                        : "No se pudo marcar la alerta como atendida: " +
                          error.message,
                    true
                );

                console.error(
                    "SMART CLASSROOM - Actualizar alerta:",
                    error
                );

            } finally {
                estado.guardando = null;
                actualizarBotonConsulta();
                mostrarTabla();
            }
        }

        // ====================================================
        // 12. PAGINACIÓN
        // ====================================================

        function actualizarPaginacion() {
            const total = estado.filtradas.length;

            const paginas = Math.max(
                1,
                Math.ceil(total / POR_PAGINA)
            );

            estado.pagina = Math.max(
                1,
                Math.min(estado.pagina, paginas)
            );

            const inicio =
                total === 0
                    ? 0
                    : (estado.pagina - 1) * POR_PAGINA + 1;

            const fin = Math.min(
                estado.pagina * POR_PAGINA,
                total
            );

            escribir(
                "texto-pagina",
                `Página ${estado.pagina} de ${paginas}`
            );

            escribir(
                "alerts-page-summary",
                `Mostrando ${inicio}–${fin} de ${total} alertas`
            );

            const anterior = $("boton-anterior");
            const siguiente = $("boton-siguiente");

            if (anterior) {
                anterior.disabled =
                    estado.pagina <= 1;
            }

            if (siguiente) {
                siguiente.disabled =
                    estado.pagina >= paginas;
            }

            const paginacion = $("paginacion");

            if (paginacion) {
                paginacion.hidden = total === 0;
            }
        }

        // ====================================================
        // 13. EVENTOS
        // ====================================================

        $("form-filtros")?.addEventListener(
            "submit",
            evento => {
                evento.preventDefault();

                if (!filtrosValidos()) return;

                mensaje("");
                estado.pagina = 1;
                aplicarFiltros();
            }
        );

        $("boton-limpiar")?.addEventListener(
            "click",
            () => {
                $("form-filtros")?.reset();

                const busqueda = $("alerts-search");

                if (busqueda) {
                    busqueda.value = "";
                }

                estado.pagina = 1;

                mensaje("");
                aplicarFiltros();
            }
        );

        $("alerts-search")?.addEventListener(
            "input",
            () => {
                estado.pagina = 1;
                aplicarFiltros();
            }
        );

        $("boton-anterior")?.addEventListener(
            "click",
            () => {
                if (estado.pagina <= 1) return;

                estado.pagina--;
                mostrarTabla();
                actualizarPaginacion();
            }
        );

        $("boton-siguiente")?.addEventListener(
            "click",
            () => {
                const paginas = Math.max(
                    1,
                    Math.ceil(
                        estado.filtradas.length / POR_PAGINA
                    )
                );

                if (estado.pagina >= paginas) return;

                estado.pagina++;
                mostrarTabla();
                actualizarPaginacion();
            }
        );

        // ====================================================
        // 14. INICIALIZACIÓN
        // ====================================================

        async function iniciar() {
            mensaje("");

            // Las alertas deben poder cargarse incluso
            // si falla la consulta independiente de aulas.
            const resultados = await Promise.allSettled([
                cargarAulas(),
                cargarAlertas()
            ]);

            const resultadoAulas = resultados[0];

            if (resultadoAulas.status === "rejected") {
                console.warn(
                    "SMART CLASSROOM - No se pudieron cargar aulas:",
                    resultadoAulas.reason
                );

                // Conservar las opciones existentes del HTML
                // para permitir filtrar por las aulas conocidas.
            }

            iconos();

            console.log(
                "SMART CLASSROOM: Centro de Alertas inicializado."
            );
        }

        iniciar();
    });
})();
