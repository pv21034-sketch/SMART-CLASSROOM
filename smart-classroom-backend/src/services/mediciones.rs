use crate::models::Medicion;

/// Valida los datos de una medición antes de procesarlos.
pub fn validar_medicion(medicion: &Medicion) -> Result<(), String> {
    if medicion.aula_id <= 0 {
        return Err("El ID del aula debe ser válido".to_string());
    }

    if let Some(sensor_id) = medicion.sensor_id {
        if sensor_id <= 0 {
            return Err("El ID del sensor debe ser válido".to_string());
        }
    }

    if let Some(temperatura) = medicion.temperatura {
        if !temperatura.is_finite() {
            return Err("La temperatura debe ser un número válido".to_string());
        }
    }

    if let Some(humedad) = medicion.humedad {
        if !humedad.is_finite() {
            return Err("La humedad debe ser un número válido".to_string());
        }
    }

    if let Some(iluminacion) = medicion.iluminacion {
        if !iluminacion.is_finite() {
            return Err("La iluminación debe ser un número válido".to_string());
        }
    }

    if let Some(ruido) = medicion.ruido {
        if !ruido.is_finite() {
            return Err("El ruido debe ser un número válido".to_string());
        }
    }

    if let Some(confort) = medicion.confort {
        if !confort.is_finite() {
            return Err("El índice de confort debe ser un número válido".to_string());
        }
    }

    Ok(())
}

/// Busca una medición utilizando su identificador.
pub fn buscar_por_id(mediciones: &[Medicion], id: i32) -> Option<Medicion> {
    mediciones
        .iter()
        .find(|medicion| medicion.id == id)
        .cloned()
}

/// Obtiene todas las mediciones pertenecientes a un aula.
pub fn filtrar_por_aula(mediciones: &[Medicion], aula_id: i32) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| medicion.aula_id == aula_id)
        .cloned()
        .collect()
}

/// Obtiene todas las mediciones pertenecientes a un sensor.
pub fn filtrar_por_sensor(mediciones: &[Medicion], sensor_id: i32) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| medicion.sensor_id == Some(sensor_id))
        .cloned()
        .collect()
}

/// Calcula el promedio de temperatura de un conjunto de mediciones.
pub fn calcular_promedio_temperatura(mediciones: &[Medicion]) -> Option<f64> {
    calcular_promedio(mediciones.iter().filter_map(|medicion| medicion.temperatura))
}

/// Calcula el promedio de humedad de un conjunto de mediciones.
pub fn calcular_promedio_humedad(mediciones: &[Medicion]) -> Option<f64> {
    calcular_promedio(mediciones.iter().filter_map(|medicion| medicion.humedad))
}

/// Calcula el promedio de iluminación de un conjunto de mediciones.
pub fn calcular_promedio_iluminacion(mediciones: &[Medicion]) -> Option<f64> {
    calcular_promedio(mediciones.iter().filter_map(|medicion| medicion.iluminacion))
}

/// Calcula el promedio de ruido de un conjunto de mediciones.
pub fn calcular_promedio_ruido(mediciones: &[Medicion]) -> Option<f64> {
    calcular_promedio(mediciones.iter().filter_map(|medicion| medicion.ruido))
}

/// Calcula el promedio de un conjunto de valores.
fn calcular_promedio<I>(valores: I) -> Option<f64>
where
    I: Iterator<Item = f64>,
{
    let valores: Vec<f64> = valores.collect();

    if valores.is_empty() {
        return None;
    }

    let suma: f64 = valores.iter().sum();

    Some(suma / valores.len() as f64)
}

/// Obtiene la temperatura máxima registrada.
pub fn calcular_maximo_temperatura(mediciones: &[Medicion]) -> Option<f64> {
    calcular_maximo(mediciones.iter().filter_map(|medicion| medicion.temperatura))
}

/// Obtiene la humedad máxima registrada.
pub fn calcular_maximo_humedad(mediciones: &[Medicion]) -> Option<f64> {
    calcular_maximo(mediciones.iter().filter_map(|medicion| medicion.humedad))
}

/// Obtiene la iluminación máxima registrada.
pub fn calcular_maximo_iluminacion(mediciones: &[Medicion]) -> Option<f64> {
    calcular_maximo(mediciones.iter().filter_map(|medicion| medicion.iluminacion))
}

/// Obtiene el nivel de ruido máximo registrado.
pub fn calcular_maximo_ruido(mediciones: &[Medicion]) -> Option<f64> {
    calcular_maximo(mediciones.iter().filter_map(|medicion| medicion.ruido))
}

/// Obtiene el valor máximo de un conjunto de valores.
fn calcular_maximo<I>(valores: I) -> Option<f64>
where
    I: Iterator<Item = f64>,
{
    valores.reduce(f64::max)
}

/// Obtiene la temperatura mínima registrada.
pub fn calcular_minimo_temperatura(mediciones: &[Medicion]) -> Option<f64> {
    calcular_minimo(mediciones.iter().filter_map(|medicion| medicion.temperatura))
}

/// Obtiene la humedad mínima registrada.
pub fn calcular_minimo_humedad(mediciones: &[Medicion]) -> Option<f64> {
    calcular_minimo(mediciones.iter().filter_map(|medicion| medicion.humedad))
}

/// Obtiene la iluminación mínima registrada.
pub fn calcular_minimo_iluminacion(mediciones: &[Medicion]) -> Option<f64> {
    calcular_minimo(mediciones.iter().filter_map(|medicion| medicion.iluminacion))
}

/// Obtiene el nivel de ruido mínimo registrado.
pub fn calcular_minimo_ruido(mediciones: &[Medicion]) -> Option<f64> {
    calcular_minimo(mediciones.iter().filter_map(|medicion| medicion.ruido))
}

/// Obtiene el valor mínimo de un conjunto de valores.
fn calcular_minimo<I>(valores: I) -> Option<f64>
where
    I: Iterator<Item = f64>,
{
    valores.reduce(f64::min)
}