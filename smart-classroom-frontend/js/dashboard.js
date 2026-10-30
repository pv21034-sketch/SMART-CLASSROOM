
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================

    const TEXTO_NO_DISPONIBLE = "No disponible";

    const VARIABLES = [
        {
            clave: "temperatura",
            idElemento: "valor-temperatura",
            unidad: "°C",
            decimales: 1
        },
        {
            clave: "humedad",
            idElemento: "valor-humedad",
            unidad: "%",
            decimales: 1
        },
        {
            clave: "iluminacion",
            idElemento: "valor-iluminacion",
            unidad: "lux",
            decimales: 0
        },
        {
            clave: "ruido",
            idElemento: "valor-ruido",
            unidad: "dB",
            decimales: 1
        },
        {
            clave: "confort",
            idElemento: "valor-confort",
            unidad: "",
            decimales: 2
        }
    ];

    // Equivalencias de nombres utilizados por el backend.
    const TIPOS_BACKEND = {
        temperatura: "temperatura",
        humedad: "humedad",
        luminosidad: "iluminacion",
        iluminacion: "iluminacion",
        ruido: "ruido",
        confort: "confort"
    };

    // ==========================================
    // ELEMENTOS HTML
    // ==========================================

    const selectorAula = document.getElementById("selector-aula");
    const botonActualizar = document.getElementById("boton-actualizar");
    const mensaje = document.getElementById("mensaje");
    const estadoAula = document.getElementById("estado-aula");
    const ultimaActualizacion = document.getElementById("ultima-actualizacion");

    // Comprobar que existan los elementos necesarios.
    if (
        !selectorAula ||
        !botonActualizar ||
        !mensaje ||
        !estadoAula ||
        !ultimaActualizacion
    ) {
        console.error("No se encontraron todos los elementos del Dashboard.");
        return;
    }

    let solicitudActual = 0;

    // ==========================================
    // UTILIDADES
    // ==========================================

    function funcionDisponible(nombre) {
        return typeof window[nombre] === "function";
    }

    function esNumeroValido(valor) {
        return typeof valor === "number" && Number.isFinite(valor);
    }

    function extraerLista(respuesta) {
        if (Array.isArray(respuesta)) {
            return respuesta;
        }

        if (Array.isArray(respuesta?.datos)) {
            return respuesta.datos;
        }

        return null;
    }

    function obtenerTiempo(fecha) {
        const tiempo = new Date(fecha).getTime();

        return Number.isFinite(tiempo) ? tiempo : null;
    }

    function formatearFecha(fecha) {
        const tiempo = obtenerTiempo(fecha);

        if (tiempo === null) {
            return null;
        }

        return new Date(tiempo).toLocaleString("es-SV");
    }

    // ==========================================
    // MENSAJES
    // ==========================================

    function mostrarMensaje(texto, tipo = "info") {
        mensaje.textContent = texto;
        mensaje.className = `mensaje mensaje--${tipo}`;
        mensaje.hidden = false;
    }

    function ocultarMensaje() {
        mensaje.textContent = "";
        mensaje.className = "mensaje";
        mensaje.hidden = true;
    }

    // ==========================================
    // LIMPIAR INFORMACIÓN
    // ==========================================

    function limpiarMediciones() {

        VARIABLES.forEach(variable => {
            const elemento = document.getElementById(variable.idElemento);

            if (elemento) {
                elemento.textContent = TEXTO_NO_DISPONIBLE;
            }
        });

        estadoAula.textContent = TEXTO_NO_DISPONIBLE;
        ultimaActualizacion.textContent = TEXTO_NO_DISPONIBLE;
    }

    // ==========================================
    // FORMATEAR Y MOSTRAR VALORES
    // ==========================================

    function mostrarValor(variable, valor) {

        const elemento = document.getElementById(variable.idElemento);

        if (!elemento) {
            return;
        }

        if (!esNumeroValido(valor)) {
            elemento.textContent = TEXTO_NO_DISPONIBLE;
            return;
        }

        const numero = valor.toFixed(variable.decimales);

        elemento.textContent = variable.unidad
            ? `${numero} ${variable.unidad}`
            : numero;
    }

    // ==========================================
    // PROCESAR MEDICIONES
    // ==========================================

    function procesarMediciones(mediciones, aulaId) {

        const resultado = {};

        VARIABLES.forEach(variable => {
            resultado[variable.clave] = null;
        });

        let ultimaFecha = null;
        let tiempoMayor = -Infinity;

        mediciones.forEach(medicion => {

            if (typeof medicion !== "object" || medicion === null) {
                return;
            }

            // Comprobar que la medición corresponda al aula.
            if (
                medicion.aula_id !== undefined &&
                String(medicion.aula_id) !== String(aulaId)
            ) {
                return;
            }

            // El backend actual utiliza "fecha".
            // El formato agrupado utiliza "fecha_hora".
            const fecha = medicion.fecha_hora ?? medicion.fecha;
            const tiempo = obtenerTiempo(fecha);

            if (tiempo === null) {
                return;
            }

            if (tiempo > tiempoMayor) {
                tiempoMayor = tiempo;
                ultimaFecha = fecha;
            }

            // FORMATO 1: mediciones individuales.
            // Ejemplo: { tipo: "temperatura", valor: 23.5 }

            if (
                typeof medicion.tipo === "string" &&
                medicion.valor !== undefined
            ) {

                const variable = TIPOS_BACKEND[medicion.tipo.toLowerCase()];

                if (!variable || !esNumeroValido(medicion.valor)) {
                    return;
                }

                const actual = resultado[variable];

                // Conservar la medición más reciente de cada variable.
                if (actual === null || tiempo > actual.tiempo) {
                    resultado[variable] = {
                        valor: medicion.valor,
                        tiempo
                    };
                }

                return;
            }

            // FORMATO 2: medición agrupada.
            // Ejemplo: { temperatura: 23.5, humedad: 55 }

            VARIABLES.forEach(variable => {

                const valor = medicion[variable.clave];

                if (!esNumeroValido(valor)) {
                    return;
                }

                const actual = resultado[variable.clave];

                if (actual === null || tiempo > actual.tiempo) {
                    resultado[variable.clave] = {
                        valor,
                        tiempo
                    };
                }

            });

        });

        return {
            valores: resultado,
            ultimaFecha
        };
    }

    // ==========================================
    // MOSTRAR INFORMACIÓN DEL AULA
    // ==========================================

    function mostrarMediciones(datos) {

        VARIABLES.forEach(variable => {

            const registro = datos.valores[variable.clave];

            mostrarValor(
                variable,
                registro !== null ? registro.valor : null
            );

        });

        // El estado no se inventa ni se calcula con umbrales
        // que todavía deben confirmarse con el equipo.
        estadoAula.textContent = TEXTO_NO_DISPONIBLE;

        // Última fecha de medición recibida.
        ultimaActualizacion.textContent =
            formatearFecha(datos.ultimaFecha) ?? TEXTO_NO_DISPONIBLE;
    }

    // ==========================================
    // CONSULTAR MEDICIONES
    // ==========================================

    async function cargarMediciones() {

        const aulaId = selectorAula.value;
        const solicitud = ++solicitudActual;

        ocultarMensaje();
        limpiarMediciones();

        if (!aulaId) {
            mostrarMensaje(
                "Seleccione un aula para consultar sus mediciones."
            );
            return;
        }

        if (!funcionDisponible("obtenerMediciones")) {
            mostrarMensaje(
                "La consulta de mediciones todavía no está conectada en api.js."
            );
            return;
        }

        botonActualizar.disabled = true;

        mostrarMensaje("Cargando mediciones...", "info");

        try {

            // Se reutiliza la función compartida de la API.
            const respuesta = await obtenerMediciones({
                aula: aulaId
            });

            // Ignorar respuestas anteriores.
            if (solicitud !== solicitudActual) {
                return;
            }

            const mediciones = extraerLista(respuesta);

            if (mediciones === null) {
                throw new Error("Formato de respuesta inesperado.");
            }

            // Procesar mediciones individuales o agrupadas.
            const datos = procesarMediciones(mediciones, aulaId);

            const hayDatos = Object.values(datos.valores).some(
                registro => registro !== null
            );

            if (!hayDatos) {

                mostrarMensaje(
                    "No hay mediciones disponibles para esta aula.",
                    "info"
                );

                return;
            }

            mostrarMediciones(datos);

            ocultarMensaje();

        } catch (error) {

            if (solicitud !== solicitudActual) {
                return;
            }

            console.error("Error al consultar mediciones:", error);

            mostrarMensaje(
                "No se pudieron obtener las mediciones. Revise la conexión con el servidor.",
                "error"
            );

        } finally {

            if (solicitud === solicitudActual) {
                botonActualizar.disabled = false;
            }

        }
    }

    // ==========================================
    // CARGAR AULAS
    // ==========================================

    async function cargarAulas() {

        limpiarMediciones();

        if (!funcionDisponible("obtenerAulas")) {

            mostrarMensaje(
                "La consulta de aulas todavía no está conectada en api.js.",
                "info"
            );

            return;
        }

        try {

            const respuesta = await obtenerAulas();
            const aulas = extraerLista(respuesta);

            if (aulas === null) {
                throw new Error("Formato de aulas inesperado.");
            }

            selectorAula.innerHTML =
                '<option value="">Seleccione un aula</option>';

            aulas.forEach(aula => {

                if (
                    aula?.id === undefined ||
                    aula?.id === null
                ) {
                    return;
                }

                const opcion = document.createElement("option");

                opcion.value = aula.id;
                opcion.textContent = aula.nombre ?? `Aula ${aula.id}`;

                selectorAula.appendChild(opcion);

            });

            if (selectorAula.options.length <= 1) {

                mostrarMensaje(
                    "No hay aulas disponibles.",
                    "info"
                );

            } else {

                mostrarMensaje(
                    "Seleccione un aula para consultar sus mediciones.",
                    "info"
                );

            }

        } catch (error) {

            console.error("Error al cargar aulas:", error);

            mostrarMensaje(
                "No se pudieron cargar las aulas. Revise la conexión con el servidor.",
                "error"
            );

        }

    }

    // ==========================================
    // EVENTOS
    // ==========================================

    selectorAula.addEventListener("change", cargarMediciones);

    botonActualizar.addEventListener("click", cargarMediciones);

    // ==========================================
    // INICIO
    // ==========================================

    cargarAulas();

});
