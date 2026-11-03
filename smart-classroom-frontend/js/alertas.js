// Alertas - Smart Classroom
// Las consultas al backend se hacen con las funciones comunes de js/api.js:
//   obtenerAlertas(filtros)  -> pendiente de definir en api.js
//   atenderAlerta(id)        -> pendiente de definir en api.js
//
// Formato de respuesta que se ESPERA (por confirmar con backend):
//   obtenerAlertas -> { datos: [ { id, variable, valor, unidad, fecha_hora, descripcion, estado } ] }
//   atenderAlerta  -> { exito: true }   (solo si el backend confirma la operación)
//
// Estados que se ESPERAN (por confirmar con backend): "activa" y "atendida".

// Elementos de la página
const formFiltros = document.getElementById("form-filtros");
const filtroEstado = document.getElementById("filtro-estado");
const botonBuscar = document.getElementById("boton-buscar");

const mensaje = document.getElementById("mensaje");
const tabla = document.getElementById("tabla-alertas");
const tablaCuerpo = document.getElementById("tabla-cuerpo");

// Nombres para mostrar (los valores internos son los acordados en la guía)
const NOMBRES_VARIABLES = {
    temperatura: "Temperatura",
    humedad: "Humedad",
    iluminacion: "Iluminación",
    ruido: "Ruido",
    confort: "Confort"
};

const NOMBRES_ESTADOS = {
    activa: "Activa",
    atendida: "Atendida"
};

// ---------- Mensajes ----------

function mostrarMensaje(texto) {
    mensaje.textContent = texto;
    mensaje.hidden = false;
}

function ocultarMensaje() {
    mensaje.textContent = "";
    mensaje.hidden = true;
}

function limpiarResultados() {
    tablaCuerpo.textContent = "";
    tabla.hidden = true;
}

function funcionDisponible(nombre) {
    return typeof window[nombre] === "function";
}

// ---------- Tabla ----------

function crearCelda(texto) {
    const celda = document.createElement("td");
    // textContent evita insertar HTML venido del servidor
    celda.textContent = texto ?? "—";
    return celda;
}

function traducir(nombres, valor) {
    if (typeof valor === "string" && Object.hasOwn(nombres, valor)) {
        return nombres[valor];
    }
    return valor;
}

function formatearFecha(valor) {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) {
        return "—";
    }
    return fecha.toLocaleString("es-SV");
}

function formatearValor(alerta) {
    if (alerta.valor === null || alerta.valor === undefined) {
        return "—";
    }
    return alerta.unidad ? `${alerta.valor} ${alerta.unidad}` : String(alerta.valor);
}

function crearCeldaAccion(alerta) {
    const celda = document.createElement("td");

    // Solo se puede atender una alerta que sigue activa
    if (alerta.estado === "activa" && alerta.id !== null && alerta.id !== undefined) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "boton boton--atender";
        boton.textContent = "Marcar como atendida";
        boton.addEventListener("click", () => marcarComoAtendida(alerta.id, boton));
        celda.appendChild(boton);
    } else {
        celda.textContent = "—";
    }

    return celda;
}

function mostrarTabla(alertas) {
    tablaCuerpo.textContent = "";

    alertas.forEach((alerta) => {
        const fila = document.createElement("tr");
        fila.appendChild(crearCelda(traducir(NOMBRES_VARIABLES, alerta.variable)));
        fila.appendChild(crearCelda(formatearValor(alerta)));
        fila.appendChild(crearCelda(formatearFecha(alerta.fecha_hora)));
        fila.appendChild(crearCelda(alerta.descripcion));
        fila.appendChild(crearCelda(traducir(NOMBRES_ESTADOS, alerta.estado)));
        fila.appendChild(crearCeldaAccion(alerta));
        tablaCuerpo.appendChild(fila);
    });

    tabla.hidden = false;
}

// ---------- Consulta ----------

function obtenerFiltros() {
    return {
        estado: filtroEstado.value
    };
}

async function buscarAlertas() {
    ocultarMensaje();
    limpiarResultados();

    if (!funcionDisponible("obtenerAlertas")) {
        mostrarMensaje("La consulta de alertas todavía no está conectada al backend.");
        return;
    }

    botonBuscar.disabled = true;
    mostrarMensaje("Cargando alertas...");

    try {
        const respuesta = await obtenerAlertas(obtenerFiltros());
        const alertas = Array.isArray(respuesta?.datos) ? respuesta.datos : [];

        if (alertas.length === 0) {
            mostrarMensaje("No se encontraron alertas con el estado seleccionado.");
            return;
        }

        ocultarMensaje();
        mostrarTabla(alertas);
    } catch (error) {
        console.error("Error al consultar alertas:", error);
        mostrarMensaje("No se pudo conectar con el servidor. Intente de nuevo más tarde.");
    } finally {
        botonBuscar.disabled = false;
    }
}

// ---------- Atender alerta ----------

async function marcarComoAtendida(id, boton) {
    if (!funcionDisponible("atenderAlerta")) {
        mostrarMensaje("La operación para atender alertas todavía no está conectada al backend.");
        return;
    }

    boton.disabled = true;

    try {
        const respuesta = await atenderAlerta(id);

        // Solo se da por atendida si el backend lo confirma
        if (respuesta?.exito !== true) {
            mostrarMensaje("El servidor no confirmó que la alerta fuera atendida. No se realizó ningún cambio.");
            return;
        }

        // Se vuelve a consultar para mostrar el estado real guardado en el servidor
        await buscarAlertas();
        mostrarMensaje("La alerta fue marcada como atendida.");
    } catch (error) {
        console.error("Error al atender la alerta:", error);
        mostrarMensaje("No se pudo atender la alerta. Intente de nuevo más tarde.");
    } finally {
        boton.disabled = false;
    }
}

// ---------- Eventos ----------

formFiltros.addEventListener("submit", (evento) => {
    evento.preventDefault();
    buscarAlertas();
});

buscarAlertas();