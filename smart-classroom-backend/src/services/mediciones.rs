//! SMART CLASSROOM — Servicio de Mediciones
//!
//! Funciones para validar, buscar, filtrar y calcular
//! estadísticas de mediciones ambientales.
//!
//! Compatible con PostgreSQL y el modelo Medicion:
//! id, sensor_id, valor, medido_en.
//!
//! Cada medición pertenece a un sensor específico.
//! El tipo de variable se obtiene mediante la relación
//! sensores -> tipos_sensor.

use crate::models::Medicion;
use uuid::Uuid;

// ============================================================
// 1. VALIDACIÓN DE MEDICIONES
// ============================================================

/// Valida los datos de una medición antes de procesarla.
///
/// La existencia del sensor debe verificarse también
/// en PostgreSQL mediante su clave foránea.
pub fn validar_medicion(medicion: &Medicion) -> Result<(), String> {
    if medicion.id.is_nil() {
        return Err("El identificador de la medición no es válido".to_string());
    }

    if medicion.sensor_id.is_nil() {
        return Err("El identificador del sensor no es válido".to_string());
    }

    if !medicion.valor.is_finite() {
        return Err("El valor de la medición debe ser un número finito".to_string());
    }

    Ok(())
}

// ============================================================
// 2. BÚSQUEDA DE MEDICIONES
// ============================================================

/// Busca una medición por su identificador UUID.
pub fn buscar_por_id(mediciones: &[Medicion], id: Uuid) -> Option<Medicion> {
    mediciones
        .iter()
        .find(|medicion| medicion.id == id)
        .cloned()
}

// ============================================================
// 3. FILTRADO DE MEDICIONES
// ============================================================

/// Obtiene todas las mediciones pertenecientes a un sensor.
pub fn filtrar_por_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| medicion.sensor_id == sensor_id)
        .cloned()
        .collect()
}

/// Obtiene las mediciones de varios sensores.
///
/// Es útil para consultar todas las variables
/// ambientales de un aula.
///
/// Los identificadores deben obtenerse previamente
/// de PostgreSQL verificando qué sensores pertenecen
/// al aula consultada.
pub fn filtrar_por_sensores(mediciones: &[Medicion], sensores_ids: &[Uuid]) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| sensores_ids.contains(&medicion.sensor_id))
        .cloned()
        .collect()
}

// ============================================================
// 4. ESTADÍSTICAS GENERALES
// ============================================================

/// Calcula el promedio de un conjunto de mediciones.
///
/// Devuelve None si no hay valores válidos.
pub fn calcular_promedio(mediciones: &[Medicion]) -> Option<f64> {
    let mut suma = 0.0;
    let mut cantidad = 0usize;

    for medicion in mediciones {
        if medicion.valor.is_finite() {
            suma += medicion.valor;
            cantidad += 1;
        }
    }

    if cantidad == 0 {
        return None;
    }

    let promedio = suma / cantidad as f64;

    if promedio.is_finite() {
        Some(promedio)
    } else {
        None
    }
}

/// Obtiene el valor máximo registrado.
pub fn calcular_maximo(mediciones: &[Medicion]) -> Option<f64> {
    mediciones
        .iter()
        .map(|medicion| medicion.valor)
        .filter(|valor| valor.is_finite())
        .reduce(f64::max)
}

/// Obtiene el valor mínimo registrado.
pub fn calcular_minimo(mediciones: &[Medicion]) -> Option<f64> {
    mediciones
        .iter()
        .map(|medicion| medicion.valor)
        .filter(|valor| valor.is_finite())
        .reduce(f64::min)
}

// ============================================================
// 5. ESTADÍSTICAS POR SENSOR
// ============================================================

/// Calcula el promedio de las mediciones de un sensor.
pub fn calcular_promedio_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_promedio(&filtradas)
}

/// Obtiene el valor máximo registrado por un sensor.
pub fn calcular_maximo_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_maximo(&filtradas)
}

/// Obtiene el valor mínimo registrado por un sensor.
pub fn calcular_minimo_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_minimo(&filtradas)
}

// ============================================================
// 6. ESTADÍSTICAS POR TIPO DE VARIABLE
// ============================================================

/// Calcula el promedio de temperatura.
///
/// Se debe proporcionar el UUID del sensor
/// que mide temperatura.
pub fn calcular_promedio_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Calcula el promedio de humedad.
pub fn calcular_promedio_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Calcula el promedio de iluminación.
pub fn calcular_promedio_iluminacion(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Calcula el promedio de ruido.
pub fn calcular_promedio_ruido(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Obtiene la temperatura máxima.
pub fn calcular_maximo_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Obtiene la humedad máxima.
pub fn calcular_maximo_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Obtiene la iluminación máxima.
pub fn calcular_maximo_iluminacion(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Obtiene el ruido máximo.
pub fn calcular_maximo_ruido(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Obtiene la temperatura mínima.
pub fn calcular_minimo_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

/// Obtiene la humedad mínima.
pub fn calcular_minimo_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

/// Obtiene la iluminación mínima.
pub fn calcular_minimo_iluminacion(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

/// Obtiene el ruido mínimo.
pub fn calcular_minimo_ruido(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

// ============================================================
// 7. PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn crear_medicion(sensor_id: Uuid, valor: f64) -> Medicion {
        Medicion {
            id: Uuid::new_v4(),
            sensor_id,
            valor,
            medido_en: Utc::now(),
        }
    }

    #[test]
    fn valida_medicion_correcta() {
        let sensor_id = Uuid::new_v4();
        let medicion = crear_medicion(sensor_id, 25.5);

        assert!(validar_medicion(&medicion).is_ok());
    }

    #[test]
    fn rechaza_sensor_invalido() {
        let medicion = crear_medicion(Uuid::nil(), 25.5);

        assert!(validar_medicion(&medicion).is_err());
    }

    #[test]
    fn rechaza_valores_no_finitos() {
        let sensor_id = Uuid::new_v4();

        let medicion = crear_medicion(sensor_id, f64::NAN);

        assert!(validar_medicion(&medicion).is_err());
    }

    #[test]
    fn filtra_mediciones_por_sensor() {
        let sensor_a = Uuid::new_v4();
        let sensor_b = Uuid::new_v4();

        let mediciones = vec![
            crear_medicion(sensor_a, 25.0),
            crear_medicion(sensor_b, 60.0),
            crear_medicion(sensor_a, 27.0),
        ];

        let resultado = filtrar_por_sensor(&mediciones, sensor_a);

        assert_eq!(resultado.len(), 2);
    }

    #[test]
    fn calcula_estadisticas_correctamente() {
        let sensor_id = Uuid::new_v4();

        let mediciones = vec![
            crear_medicion(sensor_id, 20.0),
            crear_medicion(sensor_id, 25.0),
            crear_medicion(sensor_id, 30.0),
        ];

        assert_eq!(calcular_promedio(&mediciones), Some(25.0));

        assert_eq!(calcular_maximo(&mediciones), Some(30.0));

        assert_eq!(calcular_minimo(&mediciones), Some(20.0));
    }

    #[test]
    fn retorna_none_sin_mediciones() {
        let mediciones: Vec<Medicion> = Vec::new();

        assert_eq!(calcular_promedio(&mediciones), None);

        assert_eq!(calcular_maximo(&mediciones), None);

        assert_eq!(calcular_minimo(&mediciones), None);
    }
}
