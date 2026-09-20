use crate::models::{Alerta, Medicion};

/// Verifica si una temperatura se encuentra fuera del rango permitido.
/// Si está fuera del rango, genera una alerta.
pub fn verificar_temperatura(
    medicion: &Medicion,
    minimo: f64,
    maximo: f64,
) -> Option<Alerta> {
    let temperatura = medicion.temperatura?;

    if minimo > maximo {
        return None;
    }

    if temperatura < minimo {
        Some(crear_alerta(
            medicion,
            "temperatura",
            format!(
                "La temperatura ({:.2} °C) está por debajo del mínimo permitido ({:.2} °C)",
                temperatura, minimo
            ),
            "media",
        ))
    } else if temperatura > maximo {
        Some(crear_alerta(
            medicion,
            "temperatura",
            format!(
                "La temperatura ({:.2} °C) está por encima del máximo permitido ({:.2} °C)",
                temperatura, maximo
            ),
            "media",
        ))
    } else {
        None
    }
}

/// Verifica si la humedad se encuentra fuera del rango permitido.
/// Si está fuera del rango, genera una alerta.
pub fn verificar_humedad(
    medicion: &Medicion,
    minimo: f64,
    maximo: f64,
) -> Option<Alerta> {
    let humedad = medicion.humedad?;

    if minimo > maximo {
        return None;
    }

    if humedad < minimo {
        Some(crear_alerta(
            medicion,
            "humedad",
            format!(
                "La humedad ({:.2} %) está por debajo del mínimo permitido ({:.2} %)",
                humedad, minimo
            ),
            "media",
        ))
    } else if humedad > maximo {
        Some(crear_alerta(
            medicion,
            "humedad",
            format!(
                "La humedad ({:.2} %) está por encima del máximo permitido ({:.2} %)",
                humedad, maximo
            ),
            "media",
        ))
    } else {
        None
    }
}

/// Verifica si la iluminación se encuentra fuera del rango permitido.
/// Si está fuera del rango, genera una alerta.
pub fn verificar_iluminacion(
    medicion: &Medicion,
    minimo: f64,
    maximo: f64,
) -> Option<Alerta> {
    let iluminacion = medicion.iluminacion?;

    if minimo > maximo {
        return None;
    }

    if iluminacion < minimo {
        Some(crear_alerta(
            medicion,
            "iluminacion",
            format!(
                "La iluminación ({:.2} lux) está por debajo del mínimo permitido ({:.2} lux)",
                iluminacion, minimo
            ),
            "media",
        ))
    } else if iluminacion > maximo {
        Some(crear_alerta(
            medicion,
            "iluminacion",
            format!(
                "La iluminación ({:.2} lux) está por encima del máximo permitido ({:.2} lux)",
                iluminacion, maximo
            ),
            "media",
        ))
    } else {
        None
    }
}

/// Verifica si el nivel de ruido se encuentra fuera del rango permitido.
/// Si está fuera del rango, genera una alerta.
pub fn verificar_ruido(
    medicion: &Medicion,
    minimo: f64,
    maximo: f64,
) -> Option<Alerta> {
    let ruido = medicion.ruido?;

    if minimo > maximo {
        return None;
    }

    if ruido < minimo {
        Some(crear_alerta(
            medicion,
            "ruido",
            format!(
                "El ruido ({:.2} dB) está por debajo del mínimo permitido ({:.2} dB)",
                ruido, minimo
            ),
            "media",
        ))
    } else if ruido > maximo {
        Some(crear_alerta(
            medicion,
            "ruido",
            format!(
                "El ruido ({:.2} dB) está por encima del máximo permitido ({:.2} dB)",
                ruido, maximo
            ),
            "media",
        ))
    } else {
        None
    }
}

/// Genera todas las alertas correspondientes a una medición
/// utilizando los rangos proporcionados para cada variable.
///
/// Los rangos se reciben como parámetros porque todavía deben
/// ser definidos por las reglas de negocio del proyecto.
pub fn generar_alertas(
    medicion: &Medicion,
    rango_temperatura: (f64, f64),
    rango_humedad: (f64, f64),
    rango_iluminacion: (f64, f64),
    rango_ruido: (f64, f64),
) -> Vec<Alerta> {
    let mut alertas = Vec::new();

    if let Some(alerta) = verificar_temperatura(
        medicion,
        rango_temperatura.0,
        rango_temperatura.1,
    ) {
        alertas.push(alerta);
    }

    if let Some(alerta) =
        verificar_humedad(medicion, rango_humedad.0, rango_humedad.1)
    {
        alertas.push(alerta);
    }

    if let Some(alerta) = verificar_iluminacion(
        medicion,
        rango_iluminacion.0,
        rango_iluminacion.1,
    ) {
        alertas.push(alerta);
    }

    if let Some(alerta) =
        verificar_ruido(medicion, rango_ruido.0, rango_ruido.1)
    {
        alertas.push(alerta);
    }

    alertas
}

/// Crea una alerta utilizando los datos de la medición.
fn crear_alerta(
    medicion: &Medicion,
    tipo: &str,
    mensaje: String,
    nivel: &str,
) -> Alerta {
    Alerta {
        id: 0,
        aula_id: medicion.aula_id,
        tipo: tipo.to_string(),
        mensaje,
        nivel: nivel.to_string(),
        activa: true,
        fecha_hora: medicion.fecha_hora.clone(),
    }
}