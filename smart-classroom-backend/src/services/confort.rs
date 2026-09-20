use crate::models::Medicion;

/// Calcula el índice de confort térmico a partir de la temperatura
/// y la humedad relativa de una medición.
///
/// El resultado se expresa en una escala de 0 a 1, donde 1 representa
/// las condiciones de referencia definidas para el modelo del proyecto.
/// Este cálculo constituye una normalización simplificada y no sustituye
/// una evaluación normativa completa del confort térmico.
pub fn calcular_indice_termico(medicion: &Medicion) -> Result<f64, String> {
    let temperatura = medicion.temperatura.ok_or_else(|| {
        "La temperatura es necesaria para calcular el confort térmico".to_string()
    })?;

    let humedad = medicion
        .humedad
        .ok_or_else(|| "La humedad es necesaria para calcular el confort térmico".to_string())?;

    if !temperatura.is_finite() {
        return Err("La temperatura debe ser un número válido".to_string());
    }

    if !humedad.is_finite() {
        return Err("La humedad debe ser un número válido".to_string());
    }

    let indice_temperatura = calcular_indice_temperatura(temperatura);
    let indice_humedad = calcular_indice_humedad(humedad);

    Ok(indice_temperatura * indice_humedad)
}

/// Normaliza la temperatura en una escala de 0 a 1.
///
/// Se utiliza 26 °C como punto central de referencia para la
/// normalización propuesta por el proyecto, considerando el contexto
/// climático cálido en el que se desarrollará el sistema.
///
/// Los valores de 21 °C y 31 °C delimitan el intervalo utilizado
/// por el modelo. Estos límites son parámetros de normalización del
/// proyecto y no representan por sí mismos límites normativos.
fn calcular_indice_temperatura(temperatura: f64) -> f64 {
    let indice = if temperatura <= 21.0 {
        0.0
    } else if temperatura < 26.0 {
        (temperatura - 21.0) / 5.0
    } else if temperatura < 31.0 {
        (31.0 - temperatura) / 5.0
    } else {
        0.0
    };

    indice.clamp(0.0, 1.0)
}

/// Normaliza la humedad relativa en una escala de 0 a 1.
///
/// El modelo utiliza 40 % a 60 % de humedad relativa como intervalo
/// central de referencia. Los valores comprendidos entre 20 % y 40 %
/// y entre 60 % y 90 % reciben una penalización progresiva.
///
/// Los límites utilizados son parámetros de normalización definidos
/// para el modelo del proyecto y no constituyen una clasificación
/// normativa independiente.
fn calcular_indice_humedad(humedad: f64) -> f64 {
    let indice = if humedad <= 20.0 {
        0.0
    } else if humedad < 40.0 {
        (humedad - 20.0) / 20.0
    } else if humedad <= 60.0 {
        1.0
    } else if humedad < 90.0 {
        (90.0 - humedad) / 30.0
    } else {
        0.0
    };

    indice.clamp(0.0, 1.0)
}

/// Calcula el índice de confort visual utilizando la iluminación
/// medida en lux.
///
/// El modelo utiliza 300 a 500 lux como intervalo central de referencia
/// para las condiciones de iluminación del aula. Fuera de este intervalo
/// se aplica una penalización progresiva hasta alcanzar un índice de 0.
///
/// La función representa una normalización simplificada de la iluminación
/// y no evalúa otros factores como uniformidad, deslumbramiento o
/// distribución espacial de la luz.
pub fn calcular_indice_visual(medicion: &Medicion) -> Result<f64, String> {
    let iluminacion = medicion
        .iluminacion
        .ok_or_else(|| "La iluminación es necesaria para calcular el confort visual".to_string())?;

    if !iluminacion.is_finite() {
        return Err("La iluminación debe ser un número válido".to_string());
    }

    let indice = if iluminacion <= 0.0 {
        0.0
    } else if iluminacion < 300.0 {
        iluminacion / 300.0
    } else if iluminacion <= 500.0 {
        1.0
    } else if iluminacion < 1000.0 {
        (1000.0 - iluminacion) / 500.0
    } else {
        0.0
    };

    Ok(indice.clamp(0.0, 1.0))
}

/// Calcula el índice de confort acústico utilizando el nivel
/// sonoro equivalente ponderado A (dBA).
///
/// El índice disminuye conforme aumenta el nivel sonoro. Los valores
/// utilizados representan parámetros de normalización del proyecto
/// para el funcionamiento habitual del aula y no corresponden a un
/// único límite normativo de ruido para todas las situaciones.
pub fn calcular_indice_acustico(medicion: &Medicion) -> Result<f64, String> {
    let ruido = medicion
        .ruido
        .ok_or_else(|| "El ruido es necesario para calcular el confort acústico".to_string())?;

    if !ruido.is_finite() {
        return Err("El ruido debe ser un número válido".to_string());
    }

    let indice = if ruido <= 40.0 {
        1.0
    } else if ruido <= 50.0 {
        1.0 - ((ruido - 40.0) / 100.0)
    } else if ruido <= 60.0 {
        0.9 - ((ruido - 50.0) * 0.02)
    } else if ruido <= 65.0 {
        0.7 - ((ruido - 60.0) * 0.08)
    } else if ruido < 70.0 {
        0.3 - ((ruido - 65.0) * 0.06)
    } else {
        0.0
    };

    Ok(indice.clamp(0.0, 1.0))
}

/// Calcula el índice general de confort del aula.
///
/// El índice general se obtiene mediante el promedio aritmético de los
/// índices térmico, visual y acústico. Se utilizan pesos iguales debido
/// a que el proyecto no dispone de datos de percepción de los usuarios
/// que permitan justificar una ponderación diferente.
///
/// El resultado se encuentra en una escala de 0 a 1.
pub fn calcular_indice_confort(medicion: &Medicion) -> Result<f64, String> {
    let indice_termico = calcular_indice_termico(medicion)?;
    let indice_visual = calcular_indice_visual(medicion)?;
    let indice_acustico = calcular_indice_acustico(medicion)?;

    let indice_global = (indice_termico + indice_visual + indice_acustico) / 3.0;

    Ok(indice_global.clamp(0.0, 1.0))
}

/// Obtiene el estado interpretativo correspondiente al índice general
/// de confort.
///
/// Las categorías son una clasificación propia del proyecto utilizada
/// para facilitar la interpretación del valor numérico en la aplicación.
pub fn obtener_estado_confort(indice: f64) -> &'static str {
    match indice {
        indice if indice >= 0.80 => "Muy confortable",
        indice if indice >= 0.60 => "Confortable",
        indice if indice >= 0.40 => "Aceptable",
        indice if indice >= 0.20 => "Poco confortable",
        _ => "Desfavorable",
    }
}