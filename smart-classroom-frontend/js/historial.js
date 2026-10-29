// Historial de mediciones - Smart Classroom
// Las consultas al backend se hacen con las funciones comunes de js/api.js:
//   obtenerMediciones(filtros)  -> pendiente de definir en api.js
//   obtenerAulas()              -> pendiente de definir en api.js (opcional)


const LIMITE_POR_PAGINA = 10;

// Elementos de la página
const formFiltros = document.getElementById("form-filtros");
const filtroAula = document.getElementById("filtro-aula");
const filtroSensor = document.getElementById("filtro-sensor");
const filtroVariable = document.getElementById("filtro-variable");
const fechaInicial = document.getElementById("fecha-inicial");
const fechaFinal = document.getElementById("fecha-final");
const botonBuscar = document.getElementById("boton-buscar");

const mensaje = document.getElementById("mensaje");
const tabla = document.getElementById("tabla-mediciones");
const tablaCuerpo = document.getElementById("tabla-cuerpo");

const paginacion = document.getElementById("paginacion");
const botonAnterior = document.getElementById("boton-anterior");
const botonSiguiente = document.getElementById("boton-siguiente");
const textoPagina = document.getElementById("texto-pagina");

// Estado de la página
let paginaActual = 1;
let totalPaginas = 1;

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
  paginacion.hidden = true;
}

// ---------- Validaciones ----------

function fechasValidas() {
  if (fechaInicial.value && fechaFinal.value && fechaInicial.value > fechaFinal.value) {
    mostrarMensaje("La fecha inicial no puede ser posterior a la fecha final.");
    return false;
  }
  return true;
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

function formatearFecha(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return "—";
  }
  return fecha.toLocaleString("es-SV");
}

function formatearValor(medicion) {
  if (medicion.valor === null || medicion.valor === undefined) {
    return "—";
  }
  return medicion.unidad ? `${medicion.valor} ${medicion.unidad}` : String(medicion.valor);
}

function mostrarTabla(mediciones) {
  tablaCuerpo.textContent = "";

  mediciones.forEach((medicion) => {
    const fila = document.createElement("tr");
    fila.appendChild(crearCelda(formatearFecha(medicion.fecha_hora)));
    fila.appendChild(crearCelda(medicion.aula));
    fila.appendChild(crearCelda(medicion.sensor));
    fila.appendChild(crearCelda(medicion.variable));
    fila.appendChild(crearCelda(formatearValor(medicion)));
    fila.appendChild(crearCelda(medicion.estado));
    tablaCuerpo.appendChild(fila);
  });

  tabla.hidden = false;
}

// ---------- Paginación ----------

function actualizarPaginacion(total) {
  totalPaginas = Math.max(1, Math.ceil(total / LIMITE_POR_PAGINA));

  textoPagina.textContent = `Página ${paginaActual} de ${totalPaginas}`;
  botonAnterior.disabled = paginaActual <= 1;
  botonSiguiente.disabled = paginaActual >= totalPaginas;
  paginacion.hidden = totalPaginas <= 1;
}

// ---------- Consulta ----------

function obtenerFiltros() {
  return {
    aula: filtroAula.value,
    sensor: filtroSensor.value,
    variable: filtroVariable.value,
    fechaInicial: fechaInicial.value,
    fechaFinal: fechaFinal.value,
    pagina: paginaActual,
    limite: LIMITE_POR_PAGINA
  };
}

async function buscarMediciones() {
  ocultarMensaje();
  limpiarResultados();

  if (!fechasValidas()) {
    return;
  }

  if (!funcionDisponible("obtenerMediciones")) {
    mostrarMensaje("La consulta de mediciones todavía no está conectada al backend.");
    return;
  }

  botonBuscar.disabled = true;
  mostrarMensaje("Cargando mediciones...");

  try {
    const respuesta = await obtenerMediciones(obtenerFiltros());
    const mediciones = Array.isArray(respuesta?.datos) ? respuesta.datos : [];

    if (mediciones.length === 0) {
      mostrarMensaje("No se encontraron mediciones con los filtros seleccionados.");
      return;
    }

    ocultarMensaje();
    mostrarTabla(mediciones);
    actualizarPaginacion(Number(respuesta.total) || mediciones.length);
  } catch (error) {
    console.error("Error al consultar mediciones:", error);
    mostrarMensaje("No se pudo conectar con el servidor. Intente de nuevo más tarde.");
  } finally {
    botonBuscar.disabled = false;
  }
}

// ---------- Aulas ----------

async function cargarAulas() {
  // Si api.js aún no tiene esta función, el filtro queda solo con "Todas las aulas"
  if (!funcionDisponible("obtenerAulas")) {
    return;
  }

  try {
    const aulas = await obtenerAulas();

    if (!Array.isArray(aulas)) {
      return;
    }

    aulas.forEach((aula) => {
      const opcion = document.createElement("option");
      opcion.value = aula.id;
      opcion.textContent = aula.nombre;
      filtroAula.appendChild(opcion);
    });
  } catch (error) {
    console.error("Error al cargar las aulas:", error);
    mostrarMensaje("No se pudieron cargar las aulas.");
  }
}

// ---------- Eventos ----------

formFiltros.addEventListener("submit", (evento) => {
  evento.preventDefault();
  paginaActual = 1;
  buscarMediciones();
});

botonAnterior.addEventListener("click", () => {
  if (paginaActual > 1) {
    paginaActual--;
    buscarMediciones();
  }
});

botonSiguiente.addEventListener("click", () => {
  if (paginaActual < totalPaginas) {
    paginaActual++;
    buscarMediciones();
  }
});

cargarAulas();
