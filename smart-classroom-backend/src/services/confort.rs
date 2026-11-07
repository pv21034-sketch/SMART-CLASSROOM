//! SMART CLASSROOM — Servicio de Confort Ambiental
//!
//! Calcula los índices de confort térmico, visual
//! y acústico utilizando las mediciones ambientales.
//!
//! Los índices individuales se expresan entre 0 y 1.
//! El índice general se convierte a una escala de
//! 0 a 100 para almacenarlo en PostgreSQL.
//!
//! Las fórmulas y los límites corresponden al
//! modelo de normalización propio del proyecto.
//! No sustituyen una evaluación normativa completa.

use serde::{Deserialize, Serialize};

// ============================================================
// 1. DATOS AMBIENTALES
// ============================================================

/// Agrupa las cuatro variables ambientales necesarias
/// para calcular el confort de un aula.
///
/// Esta estructura no representa una tabla de PostgreSQL.
/// Se utiliza únicamente para realizar los cálculos.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DatosAmbientales {
    /// Temperatura ambiental en grados Celsius.
    pub temperatura: f64,

    /// Humedad relativa en porcentaje.
    pub humedad: f64,

    /// Iluminación ambiental en lux.
    pub iluminacion: f64,

    /// Nivel de ruido en la unidad utilizada
    /// por el sistema de medición.
    pub ruido: f64,
}

impl DatosAmbientales {
    /// Valida que las cuatro variables sean finitas.
    pub fn validar(&self) -> Result<(), String> {
        if !self.temperatura.is_finite() {
            return Err("La temperatura debe ser un número válido".to_string());
        }

        if !self.humedad.is_finite() {
            return Err("La humedad debe ser un número válido".to_string());
        }

        if !(0.0..=100.0).contains(&self.humedad) {
            return Err("La humedad relativa debe estar entre 0 y 100 %".to_string());
        }

        if !self.iluminacion.is_finite() || self.iluminacion < 0.0 {
            return Err("La iluminación debe ser un número finito no negativo".to_string());
        }

        if !self.ruido.is_finite() {
            return Err("El ruido debe ser un número válido".to_string());
        }

        Ok(())
    }
}

// ============================================================
// 2. ÍNDICE DE CONFORT TÉRMICO
// ============================================================

/// Calcula el índice térmico utilizando temperatura
/// y humedad relativa.
///
/// El resultado se encuentra entre 0 y 1.
pub fn calcular_indice_termico(datos: &DatosAmbientales) -> Result<f64, String> {
    datos.validar()?;

    let indice_temperatura = calcular_indice_temperatura(datos.temperatura);

    let indice_humedad = calcular_indice_humedad(datos.humedad);

    Ok(indice_temperatura * indice_humedad)
}

/// Normaliza la temperatura entre 0 y 1.
///
/// Referencias del modelo:
/// - 21 °C: límite inferior.
/// - 26 °C: punto central.
/// - 31 °C: límite superior.
fn calcular_indice_temperatura(temperatura: f64) -> f64 {
    let indice: f64 = if temperatura <= 21.0 {
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

/// Normaliza la humedad relativa entre 0 y 1.
///
/// El intervalo de referencia es 40–60 %.
fn calcular_indice_humedad(humedad: f64) -> f64 {
    let indice: f64 = if humedad <= 20.0 {
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

// ============================================================
// 3. ÍNDICE DE CONFORT VISUAL
// ============================================================

/// Calcula el índice visual a partir de la
/// iluminación ambiental medida en lux.
///
/// El intervalo central es de 300 a 500 lux.
pub fn calcular_indice_visual(datos: &DatosAmbientales) -> Result<f64, String> {
    datos.validar()?;

    let iluminacion = datos.iluminacion;

    let indice: f64 = if iluminacion <= 0.0 {
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

// ============================================================
// 4. ÍNDICE DE CONFORT ACÚSTICO
// ============================================================

/// Calcula el índice acústico a partir del nivel
/// de ruido ambiental.
///
/// La fórmula conserva los intervalos definidos
/// originalmente por el proyecto.
///
/// Para interpretarlo como nivel sonoro en dBA,
/// el sistema de adquisición debe proporcionar
/// mediciones calibradas en esa unidad.
pub fn calcular_indice_acustico(datos: &DatosAmbientales) -> Result<f64, String> {
    datos.validar()?;

    let ruido = datos.ruido;

    let indice: f64 = if ruido <= 40.0 {
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

// ============================================================
// 5. ÍNDICE GENERAL DE CONFORT
// ============================================================

/// Calcula el índice general de confort ambiental.
///
/// Promedia los índices térmico, visual y acústico
/// con la misma ponderación.
///
/// Resultado: escala de 0 a 1.
pub fn calcular_indice_confort(datos: &DatosAmbientales) -> Result<f64, String> {
    datos.validar()?;

    let indice_termico = calcular_indice_termico(datos)?;

    let indice_visual = calcular_indice_visual(datos)?;

    let indice_acustico = calcular_indice_acustico(datos)?;

    let indice_global: f64 = (indice_termico + indice_visual + indice_acustico) / 3.0;

    Ok(indice_global.clamp(0.0, 1.0))
}

/// Convierte el índice general a una escala
/// de 0 a 100, compatible con la tabla
/// `indices_confort` de PostgreSQL.
pub fn calcular_indice_confort_porcentaje(datos: &DatosAmbientales) -> Result<f64, String> {
    let indice = calcular_indice_confort(datos)?;

    Ok((indice * 100.0).clamp(0.0, 100.0))
}

// ============================================================
// 6. INTERPRETACIÓN DEL ÍNDICE
// ============================================================

/// Devuelve una categoría interpretativa
/// del índice general expresado entre 0 y 1.
///
/// Clasificación propia de SMART CLASSROOM.
pub fn obtener_estado_confort(indice: f64) -> &'static str {
    if !indice.is_finite() || !(0.0..=1.0).contains(&indice) {
        return "Índice inválido";
    }

    match indice {
        valor if valor >= 0.80 => "Muy confortable",
        valor if valor >= 0.60 => "Confortable",
        valor if valor >= 0.40 => "Aceptable",
        valor if valor >= 0.20 => "Poco confortable",
        _ => "Desfavorable",
    }
}

/// Interpreta un índice expresado entre 0 y 100.
pub fn obtener_estado_confort_porcentaje(indice: f64) -> &'static str {
    if !indice.is_finite() || !(0.0..=100.0).contains(&indice) {
        return "Índice inválido";
    }

    obtener_estado_confort(indice / 100.0)
}

// ============================================================
// 7. PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn datos_referencia() -> DatosAmbientales {
        DatosAmbientales {
            temperatura: 26.0,
            humedad: 50.0,
            iluminacion: 400.0,
            ruido: 40.0,
        }
    }

    #[test]
    fn calcula_confort_termico_correctamente() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_termico(&datos).unwrap(), 1.0);
    }

    #[test]
    fn calcula_confort_visual_correctamente() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_visual(&datos).unwrap(), 1.0);
    }

    #[test]
    fn calcula_confort_acustico_correctamente() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_acustico(&datos).unwrap(), 1.0);
    }

    #[test]
    fn calcula_indice_general_correctamente() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_confort(&datos).unwrap(), 1.0);
    }

    #[test]
    fn convierte_indice_a_porcentaje() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_confort_porcentaje(&datos).unwrap(), 100.0);
    }

    #[test]
    fn rechaza_humedad_invalida() {
        let mut datos = datos_referencia();
        datos.humedad = 120.0;

        assert!(calcular_indice_confort(&datos).is_err());
    }

    #[test]
    fn rechaza_valores_no_finitos() {
        let mut datos = datos_referencia();
        datos.temperatura = f64::NAN;

        assert!(calcular_indice_confort(&datos).is_err());
    }

    #[test]
    fn interpreta_estado_correctamente() {
        assert_eq!(obtener_estado_confort(0.85), "Muy confortable");

        assert_eq!(obtener_estado_confort_porcentaje(65.0), "Confortable");

        assert_eq!(obtener_estado_confort(f64::NAN), "Índice inválido");
    }
}
