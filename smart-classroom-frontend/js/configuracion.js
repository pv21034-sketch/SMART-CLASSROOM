// Configuración - Smart Classroom
// Las consultas al backend se hacen con las funciones comunes de js/api.js:
//   obtenerRangos()                -> pendiente de definir en api.js
//   guardarRangos(rangos)          -> pendiente de definir en api.js
//   obtenerAulas()                 -> pendiente de definir en api.js (compartida con historial)
//   obtenerDispositivos()          -> pendiente de definir en api.js
//   obtenerUsuarios()              -> pendiente de definir en api.js
//   obtenerConfiguracionSistema()  -> pendiente de definir en api.js
//
// Formatos de respuesta que se ESPERAN (por confirmar con backend):
//   obtenerRangos   -> { datos: [ { variable, minimo, maximo, unidad } ] }
//   guardarRangos   -> { exito: true }   (solo si el backend confirma la operación)
//   obtenerAulas    -> [ { id, nombre } ]   (igual que en historial.js)
//   obtenerDispositivos         -> { datos: [ { id, nombre, aula, sensor, estado } ] }
//   obtenerUsuarios             -> { datos: [ { id, nombre, correo, rol } ] }
//   obtenerConfiguracionSistema -> { datos: [ { nombre, valor } ] }
//
// Por ahora aulas, dispositivos, usuarios y sistema son solo de consulta:
// las opciones de crear, editar o eliminar se agregarán cuando el backend
// defina qué operaciones permite.

// Variables que tienen rango (el confort es un índice calculado, no un sensor)
const VARIABLES_RANGO = ["temperatura", "humedad", "iluminacion", "ruido"];

const NOMBRES_VARIABLES = {
    temperatura: "Temperatura",
    humedad: "Humedad",
    iluminacion: "Iluminación",
    ruido: "Ruido"
};

// Elementos de la página: rangos
const formRangos = document.getElementById("form-rangos");
const botonGuardarRangos = document.getElementById("boton-guardar-rangos");
const mensajeRangos = document.getElementById("mensaje-rangos");

const camposRango = {};
VARIABLES_RANGO.forEach((variable) => {
    camposRango[variable] = {
        minimo: document.getElementById(`rango-${variable}-min`),
        maximo: document.getElementById(`rango-${variable}-max`),
        unidad: document.getElementById(`unidad-${variable}`)
    };
});

// ---------- Utilidades ----------

function mostrarMensaje(elemento, texto) {
    elemento.textContent = texto;
    elemento.hidden = false;
}

function ocultarMensaje(elemento) {
    elemento.textContent = "";
    elemento.hidden = true;
}

function funcionDisponible(nombre) {
    return typeof window[nombre] === "function";
}

// Acepta una lista directa o un objeto { datos: [...] }
function extraerLista(respuesta) {
    if (Array.isArray(respuesta)) {
        return respuesta;
    }
    return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

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

// ---------- Rangos de sensores ----------

function hayValor(valor) {
    return valor !== null && valor !== undefined && valor !== "" && !Number.isNaN(Number(valor));
}

async function cargarRangos() {
    if (!funcionDisponible("obtenerRangos")) {
        mostrarMensaje(mensajeRangos, "La consulta de rangos todavía no está conectada al backend.");
        return;
    }

    mostrarMensaje(mensajeRangos, "Cargando rangos...");

    try {
        const rangos = extraerLista(await obtenerRangos());
        let cargados = 0;

        rangos.forEach((rango) => {
            const campos = camposRango[rango.variable];
            if (!campos) {
                return;
            }

            if (hayValor(rango.minimo)) {
                campos.minimo.value = String(rango.minimo);
            }
            if (hayValor(rango.maximo)) {
                campos.maximo.value = String(rango.maximo);
            }
            if (rango.unidad) {
                campos.unidad.textContent = rango.unidad;
            }
            cargados++;
        });

        if (cargados === 0) {
            mostrarMensaje(mensajeRangos, "No hay rangos configurados todavía.");
            return;
        }

        ocultarMensaje(mensajeRangos);
    } catch (error) {
        console.error("Error al cargar los rangos:", error);
        mostrarMensaje(mensajeRangos, "No se pudo conectar con el servidor. Intente de nuevo más tarde.");
    }
}

// Devuelve la lista de rangos listos para enviar, o null si hay un error
function validarRangos() {
    const rangos = [];
    let error = "";

    VARIABLES_RANGO.forEach((variable) => {
        const { minimo, maximo } = camposRango[variable];
        minimo.removeAttribute("aria-invalid");
        maximo.removeAttribute("aria-invalid");

        if (error) {
            return;
        }

        const nombre = NOMBRES_VARIABLES[variable];

        if (!hayValor(minimo.value) || !hayValor(maximo.value)) {
            error = `Complete el valor mínimo y el máximo de ${nombre.toLowerCase()}.`;
            minimo.setAttribute("aria-invalid", "true");
            maximo.setAttribute("aria-invalid", "true");
            return;
        }

        if (Number(minimo.value) > Number(maximo.value)) {
            error = `En ${nombre.toLowerCase()}, el valor mínimo no puede ser mayor que el máximo.`;
            minimo.setAttribute("aria-invalid", "true");
            maximo.setAttribute("aria-invalid", "true");
            return;
        }

        rangos.push({
            variable: variable,
            minimo: Number(minimo.value),
            maximo: Number(maximo.value)
        });
    });

    if (error) {
        mostrarMensaje(mensajeRangos, error);
        return null;
    }

    return rangos;
}

async function guardarRangosFormulario() {
    ocultarMensaje(mensajeRangos);

    const rangos = validarRangos();
    if (rangos === null) {
        return;
    }

    if (!funcionDisponible("guardarRangos")) {
        mostrarMensaje(mensajeRangos, "El guardado de rangos todavía no está conectado al backend. Los cambios no se guardaron.");
        return;
    }

    botonGuardarRangos.disabled = true;
    mostrarMensaje(mensajeRangos, "Guardando rangos...");

    try {
        const respuesta = await guardarRangos(rangos);

        // Solo se dan por guardados si el backend lo confirma
        if (respuesta?.exito !== true) {
            mostrarMensaje(mensajeRangos, "El servidor no confirmó que los rangos se guardaran. Los cambios no se guardaron.");
            return;
        }

        mostrarMensaje(mensajeRangos, "Los rangos se guardaron correctamente.");
    } catch (error) {
        console.error("Error al guardar los rangos:", error);
        mostrarMensaje(mensajeRangos, "No se pudo conectar con el servidor. Los cambios no se guardaron.");
    } finally {
        botonGuardarRangos.disabled = false;
    }
}

// ---------- Listas de consulta (aulas, dispositivos, usuarios, sistema) ----------

// Carga una sección de solo consulta usando la función común de api.js.
//   seccion.funcion  : nombre de la función de api.js
//   seccion.columnas : funciones que reciben un elemento y devuelven el texto de cada celda
async function cargarLista(seccion) {
    const mensaje = document.getElementById(`mensaje-${seccion.nombre}`);
    const tabla = document.getElementById(`tabla-${seccion.nombre}`);
    const cuerpo = document.getElementById(`cuerpo-${seccion.nombre}`);

    ocultarMensaje(mensaje);
    cuerpo.textContent = "";
    tabla.hidden = true;

    if (!funcionDisponible(seccion.funcion)) {
        mostrarMensaje(mensaje, `La consulta de ${seccion.texto} todavía no está conectada al backend.`);
        return;
    }

    mostrarMensaje(mensaje, `Cargando ${seccion.texto}...`);

    try {
        const elementos = extraerLista(await window[seccion.funcion]());

        if (elementos.length === 0) {
            mostrarMensaje(mensaje, `No hay ${seccion.texto} registrados.`);
            return;
        }

        elementos.forEach((elemento) => {
            const fila = document.createElement("tr");
            seccion.columnas.forEach((columna) => {
                fila.appendChild(crearCelda(columna(elemento)));
            });
            cuerpo.appendChild(fila);
        });

        ocultarMensaje(mensaje);
        tabla.hidden = false;
    } catch (error) {
        console.error(`Error al cargar ${seccion.texto}:`, error);
        mostrarMensaje(mensaje, "No se pudo conectar con el servidor. Intente de nuevo más tarde.");
    }
}

const SECCIONES = [
    {
        nombre: "aulas",
        texto: "aulas",
        funcion: "obtenerAulas",
        columnas: [(aula) => aula.nombre]
    },
    {
        nombre: "dispositivos",
        texto: "dispositivos",
        funcion: "obtenerDispositivos",
        columnas: [
            (dispositivo) => dispositivo.nombre,
            (dispositivo) => dispositivo.aula,
            (dispositivo) => traducir(NOMBRES_VARIABLES, dispositivo.sensor),
            (dispositivo) => dispositivo.estado
        ]
    },
    {
        nombre: "usuarios",
        texto: "usuarios",
        funcion: "obtenerUsuarios",
        columnas: [
            (usuario) => usuario.nombre,
            (usuario) => usuario.correo,
            (usuario) => usuario.rol
        ]
    },
    {
        nombre: "sistema",
        texto: "parámetros del sistema",
        funcion: "obtenerConfiguracionSistema",
        columnas: [
            (parametro) => parametro.nombre,
            (parametro) => parametro.valor
        ]
    }
];

// ---------- Eventos ----------

formRangos.addEventListener("submit", (evento) => {
    evento.preventDefault();
    guardarRangosFormulario();
});

cargarRangos();
SECCIONES.forEach(cargarLista);