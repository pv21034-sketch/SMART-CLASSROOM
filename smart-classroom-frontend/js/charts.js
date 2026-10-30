
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // ELEMENTOS HTML
    // ==========================================

    const selectAula = document.getElementById("select-aula");
    const selectPeriodo = document.getElementById("select-periodo");
    const mensajeEstado = document.getElementById("mensaje-estado");
    const listaResumenes = document.getElementById("lista-resumenes");

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================

    const VARIABLES = [
        {
            clave: "temperatura",
            etiqueta: "Temperatura",
            unidad: "°C",
            decimales: 1
        },
        {
            clave: "humedad",
            etiqueta: "Humedad",
            unidad: "%",
            decimales: 1
        },
        {
            clave: "iluminacion",
            etiqueta: "Iluminación",
            unidad: "lux",
            decimales: 0
        },
        {
            clave: "ruido",
            etiqueta: "Ruido",
            unidad: "dB",
            decimales: 1
        },
        {
            clave: "confort",
            etiqueta: "Confort",
            unidad: "",
            decimales: 2
        }
    ];

    const PERIODOS = {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000
    };

    // Traducción de los tipos que actualmente devuelve el backend.
    const TIPOS_BACKEND = {
        temperatura: "temperatura",
        humedad: "humedad",
        luminosidad: "iluminacion",
        ruido: "ruido"
    };

    // ==========================================
    // VARIABLES DE CONTROL
    // ==========================================

    const graficas = {};
    let solicitudActual = 0;

    // ==========================================
    // MENSAJES
    // ==========================================

    function mostrarMensaje(texto, tipo = "info") {
        mensajeEstado.textContent = texto;
        mensajeEstado.className = `mensaje-estado mensaje-estado--${tipo}`;
        mensajeEstado.hidden = false;
    }

    function ocultarMensaje() {
        mensajeEstado.textContent = "";
        mensajeEstado.hidden = true;
        mensajeEstado.className = "mensaje-estado";
    }

    function mostrarResumenVacio(texto) {
        listaResumenes.textContent = "";

        const elemento = document.createElement("li");
        elemento.textContent = texto;

        listaResumenes.appendChild(elemento);
    }

    // ==========================================
    // VALIDACIONES
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

    // ==========================================
    // FECHAS Y VALORES
    // ==========================================

    function obtenerFecha(fecha) {
        const tiempo = new Date(fecha).getTime();

        return Number.isFinite(tiempo) ? tiempo : null;
    }

    function formatearFecha(tiempo) {
        return new Date(tiempo).toLocaleString("es-SV", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatearValor(valor, variable) {
        const numero = valor.toFixed(variable.decimales);

        return variable.unidad
            ? `${numero} ${variable.unidad}`
            : numero;
    }

    // ==========================================
    // INICIALIZACIÓN DE GRÁFICAS
    // ==========================================

    function inicializarGraficas() {

        if (typeof Chart === "undefined") {
            mostrarMensaje(
                "No se pudo cargar Chart.js. Revise su conexión a internet.",
                "error"
            );
            return false;
        }

        VARIABLES.forEach(variable => {

            const canvas = document.getElementById(
                `grafica-${variable.clave}`
            );

            if (!canvas) {
                console.error(
                    `No se encontró el canvas de ${variable.clave}`
                );
                return;
            }

            graficas[variable.clave] = new Chart(
                canvas.getContext("2d"),
                {
                    type: "line",

                    data: {
                        labels: [],

                        datasets: [{
                            label: variable.etiqueta,
                            data: [],
                            tension: 0.2,
                            spanGaps: false
                        }]
                    },

                    options: {
                        responsive: true,
                        maintainAspectRatio: true,

                        plugins: {
                            legend: {
                                display: false
                            }
                        },

                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: "Fecha y hora"
                                }
                            },

                            y: {
                                title: {
                                    display: true,
                                    text: variable.unidad ||
                                        "Índice de confort (0 a 1)"
                                }
                            }
                        }
                    }
                }
            );

        });

        return true;
    }

    // ==========================================
    // LIMPIAR GRÁFICAS
    // ==========================================

    function limpiarGraficas() {

        VARIABLES.forEach(variable => {

            const grafica = graficas[variable.clave];

            if (grafica) {
                grafica.data.labels = [];
                grafica.data.datasets[0].data = [];
                grafica.update();
            }

            const aviso = document.getElementById(
                `aviso-${variable.clave}`
            );

            if (aviso) {
                aviso.textContent = "";
                aviso.hidden = true;
            }

        });

    }

    // ==========================================
    // PROCESAR MEDICIONES DEL BACKEND
    // ==========================================

    function procesarMediciones(mediciones, aulaId, desde, hasta) {

        const puntos = {};

        VARIABLES.forEach(variable => {
            puntos[variable.clave] = [];
        });

        mediciones.forEach(medicion => {

            if (typeof medicion !== "object" || medicion === null) {
                return;
            }

            // Comprobar que corresponda al aula seleccionada.
            if (String(medicion.aula_id) !== String(aulaId)) {
                return;
            }

            // El backend actual utiliza "fecha".
            const tiempo = obtenerFecha(medicion.fecha);

            if (tiempo === null || tiempo < desde || tiempo > hasta) {
                return;
            }

            // Convertir el tipo recibido a la variable del frontend.
            const variable = TIPOS_BACKEND[medicion.tipo];

            // Se ignoran tipos que no corresponden a las gráficas.
            if (!variable) {
                return;
            }

            if (!esNumeroValido(medicion.valor)) {
                return;
            }

            puntos[variable].push({
                tiempo,
                valor: medicion.valor
            });

        });

        // Ordenar cada variable cronológicamente.
        Object.keys(puntos).forEach(variable => {
            puntos[variable].sort(
                (a, b) => a.tiempo - b.tiempo
            );
        });

        return puntos;
    }

    // ==========================================
    // MOSTRAR GRÁFICAS
    // ==========================================

    function mostrarGraficas(puntos) {

        VARIABLES.forEach(variable => {

            const registros = puntos[variable.clave];
            const grafica = graficas[variable.clave];

            const aviso = document.getElementById(
                `aviso-${variable.clave}`
            );

            if (!registros || registros.length === 0) {

                if (aviso) {
                    aviso.textContent =
                        `No hay datos de ${variable.etiqueta.toLowerCase()} en este período.`;

                    aviso.hidden = false;
                }

                return;
            }

            // No se inventan valores para completar puntos faltantes.
            if (grafica) {

                grafica.data.labels = registros.map(
                    registro => formatearFecha(registro.tiempo)
                );

                grafica.data.datasets[0].data = registros.map(
                    registro => registro.valor
                );

                grafica.update();
            }

            if (aviso) {
                aviso.textContent = "";
                aviso.hidden = true;
            }

        });

    }

    // ==========================================
    // RESÚMENES
    // ==========================================

    function mostrarResumenes(puntos) {

        listaResumenes.textContent = "";

        let cantidadResumida = 0;

        VARIABLES.forEach(variable => {

            const registros = puntos[variable.clave];

            if (!registros || registros.length === 0) {
                return;
            }

            const valores = registros.map(registro => registro.valor);

            const minimo = Math.min(...valores);
            const maximo = Math.max(...valores);

            const promedio = valores.reduce(
                (suma, valor) => suma + valor,
                0
            ) / valores.length;

            const elemento = document.createElement("li");

            elemento.textContent =
                `${variable.etiqueta}: ` +
                `mínimo ${formatearValor(minimo, variable)}, ` +
                `máximo ${formatearValor(maximo, variable)}, ` +
                `promedio ${formatearValor(promedio, variable)} ` +
                `(${valores.length} mediciones)`;

            listaResumenes.appendChild(elemento);

            cantidadResumida++;

        });

        if (cantidadResumida === 0) {
            mostrarResumenVacio(
                "No hay mediciones disponibles para elaborar los resúmenes."
            );
        }

    }

    // ==========================================
    // CARGAR MEDICIONES
    // ==========================================

    async function cargarDatos() {

        const aulaId = selectAula.value;
        const duracion = PERIODOS[selectPeriodo.value];

        const solicitud = ++solicitudActual;

        ocultarMensaje();
        limpiarGraficas();

        if (!aulaId) {
            mostrarMensaje(
                "Seleccione un aula para consultar sus gráficas."
            );

            mostrarResumenVacio(
                "Seleccione un aula y un período."
            );

            return;
        }

        if (duracion === undefined) {
            mostrarMensaje(
                "Seleccione un período válido."
            );

            mostrarResumenVacio(
                "Seleccione un período para consultar los resúmenes."
            );

            return;
        }

        if (!funcionDisponible("obtenerMediciones")) {
            mostrarMensaje(
                "La consulta de mediciones todavía no está conectada en api.js.",
                "info"
            );

            mostrarResumenVacio(
                "Las mediciones estarán disponibles cuando se conecte el backend."
            );

            return;
        }

        mostrarMensaje("Cargando mediciones...", "carga");

        try {

            // Obtener las mediciones mediante la función compartida.
            const respuesta = await obtenerMediciones();

            // Ignorar respuestas de consultas anteriores.
            if (solicitud !== solicitudActual) {
                return;
            }

            const mediciones = extraerLista(respuesta);

            if (mediciones === null) {
                throw new Error(
                    "El servidor devolvió un formato de mediciones inesperado."
                );
            }

            const hasta = Date.now();
            const desde = hasta - duracion;

            const puntos = procesarMediciones(
                mediciones,
                aulaId,
                desde,
                hasta
            );

            const hayDatos = VARIABLES.some(
                variable => puntos[variable.clave].length > 0
            );

            if (!hayDatos) {

                mostrarMensaje(
                    "No hay mediciones disponibles para el aula y período seleccionados."
                );

                mostrarGraficas(puntos);
                mostrarResumenes(puntos);

                return;
            }

            ocultarMensaje();

            mostrarGraficas(puntos);
            mostrarResumenes(puntos);

        } catch (error) {

            if (solicitud !== solicitudActual) {
                return;
            }

            console.error("Error al cargar las mediciones:", error);

            mostrarMensaje(
                "No se pudieron cargar las mediciones. Revise la conexión con el servidor.",
                "error"
            );

            mostrarResumenVacio(
                "No fue posible obtener los resúmenes."
            );

        }

    }

    // ==========================================
    // CARGAR AULAS
    // ==========================================

    async function cargarAulas() {

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
                throw new Error(
                    "El servidor devolvió un formato de aulas inesperado."
                );
            }

            // Evitar opciones duplicadas.
            selectAula.innerHTML =
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

                selectAula.appendChild(opcion);

            });

            if (aulas.length === 0) {
                mostrarMensaje(
                    "No hay aulas disponibles.",
                    "info"
                );
            } else {
                mostrarMensaje(
                    "Seleccione un aula y un período para consultar las gráficas.",
                    "info"
                );
            }

        } catch (error) {

            console.error("Error al cargar las aulas:", error);

            mostrarMensaje(
                "No se pudieron cargar las aulas. Revise la conexión con el servidor.",
                "error"
            );

        }

    }

    // ==========================================
    // EVENTOS
    // ==========================================

    selectAula.addEventListener("change", cargarDatos);
    selectPeriodo.addEventListener("change", cargarDatos);

    // ==========================================
    // INICIO
    // ==========================================

    const graficasInicializadas = inicializarGraficas();

    if (graficasInicializadas) {
        cargarAulas();
    }

});
