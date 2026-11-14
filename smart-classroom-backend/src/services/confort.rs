
//! SMART CLASSROOM
//! Servicio de Confort Termico Ambiental
//!
//! Variables utilizadas:
//! - Temperatura ambiental (°C).
//! - Humedad relativa (%).
//!
//! Modelo de normalizacion propio del proyecto.
//!
//! El indice final se expresa entre 0 y 100.
//!
//! IMPORTANTE:
//! Este indicador no sustituye una evaluacion
//! normativa completa del confort termico.

use serde::{Deserialize, Serialize};

// ============================================================
// 1. ESTRUCTURA DE DATOS
// ============================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DatosAmbientales {
    /// Temperatura ambiental en grados Celsius.
    pub temperatura: f64,

    /// Humedad relativa en porcentaje.
    pub humedad: f64,
}

impl DatosAmbientales {
    /// Verifica que los datos sean validos.
    pub fn validar(&self) -> Result<(), String> {
        if !self.temperatura.is_finite() {
            return Err("La temperatura debe ser un numero finito".into());
        }

        if !(-40.0..=85.0).contains(&self.temperatura) {
            return Err("La temperatura debe estar entre -40 y 85 °C".into());
        }

        if !self.humedad.is_finite() {
            return Err("La humedad relativa debe ser un numero finito".into());
        }

        if !(0.0..=100.0).contains(&self.humedad) {
            return Err("La humedad relativa debe estar entre 0 y 100 %".into());
        }

        Ok(())
    }
}

// ============================================================
// 2. NORMALIZACION DE TEMPERATURA
// ============================================================

/// Modelo triangular de temperatura.
///
/// 21 °C -> indice 0.
/// 26 °C -> indice 1.
/// 31 °C -> indice 0.
///
/// Valores fuera del intervalo -> indice 0.
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

// ============================================================
// 3. NORMALIZACION DE HUMEDAD RELATIVA
// ============================================================

/// Modelo de humedad relativa.
///
/// HR <= 20 % -> 0.
/// 20 % < HR < 40 % -> crecimiento lineal.
/// 40 % <= HR <= 60 % -> 1.
/// 60 % < HR < 90 % -> descenso lineal.
/// HR >= 90 % -> 0.
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

// ============================================================
// 4. INDICE DE CONFORT TERMICO
// ============================================================

/// Calcula el indice termico normalizado.
///
/// Formula:
///
/// I_termico = I_temperatura * I_humedad
///
/// Resultado entre 0 y 1.
pub fn calcular_indice_termico(datos: &DatosAmbientales) -> Result<f64, String> {
    datos.validar()?;

    let indice_temperatura = calcular_indice_temperatura(datos.temperatura);

    let indice_humedad = calcular_indice_humedad(datos.humedad);

    let indice_termico = indice_temperatura * indice_humedad;

    Ok(indice_termico.clamp(0.0, 1.0))
}

// ============================================================
// 5. INDICE GENERAL DE CONFORT
// ============================================================

/// Ahora el confort general utiliza solamente
/// temperatura y humedad relativa.
///
/// Resultado entre 0 y 1.
pub fn calcular_indice_confort(datos: &DatosAmbientales) -> Result<f64, String> {
    calcular_indice_termico(datos)
}

/// Convierte el indice a una escala de 0 a 100.
///
/// Compatible con la tabla indices_confort.
pub fn calcular_indice_confort_porcentaje(datos: &DatosAmbientales) -> Result<f64, String> {
    let indice = calcular_indice_confort(datos)?;

    let porcentaje = indice * 100.0;

    Ok(porcentaje.clamp(0.0, 100.0))
}

// ============================================================
// 6. INTERPRETACION DEL CONFORT
// ============================================================

/// Clasificacion propia de SMART CLASSROOM.
///
/// Indice normalizado entre 0 y 1.
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

/// Interpreta el indice en escala 0 a 100.
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
        }
    }

    #[test]
    fn calcula_confort_termico_correctamente() {
        let datos = datos_referencia();

        assert_eq!(calcular_indice_termico(&datos).unwrap(), 1.0);
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
    fn calcula_confort_intermedio() {
        let datos = DatosAmbientales {
            temperatura: 28.5,
            humedad: 50.0,
        };

        let resultado = calcular_indice_confort_porcentaje(&datos).unwrap();

        assert!((resultado - 50.0).abs() < 1e-10);
    }

    #[test]
    fn rechaza_humedad_invalida() {
        let datos = DatosAmbientales {
            temperatura: 26.0,
            humedad: 120.0,
        };

        assert!(calcular_indice_confort(&datos).is_err());
    }

    #[test]
    fn rechaza_temperatura_invalida() {
        let datos = DatosAmbientales {
            temperatura: 100.0,
            humedad: 50.0,
        };

        assert!(calcular_indice_confort(&datos).is_err());
    }

    #[test]
    fn rechaza_valores_no_finitos() {
        let datos = DatosAmbientales {
            temperatura: f64::NAN,
            humedad: 50.0,
        };

        assert!(calcular_indice_confort(&datos).is_err());
    }

    #[test]
    fn interpreta_estado_correctamente() {
        assert_eq!(obtener_estado_confort(0.85), "Muy confortable");

        assert_eq!(obtener_estado_confort_porcentaje(65.0), "Confortable");

        assert_eq!(obtener_estado_confort(f64::NAN), "Índice inválido");
    }
}
