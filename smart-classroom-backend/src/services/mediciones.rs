
//! SMART CLASSROOM — Servicio de Mediciones
//!
//! Gestiona la validacion, busqueda, filtrado
//! y calculo de estadisticas ambientales.
//!
//! Variables monitoreadas:
//! - Temperatura (grados Celsius).
//! - Humedad relativa (porcentaje).
//!
//! Compatible con el modelo Medicion:
//! id, sensor_id, valor, medido_en.
//!
//! Cada medicion pertenece a un sensor.
//! El tipo de variable se obtiene mediante
//! la relacion sensores -> tipos_sensor.

use crate::models::Medicion;
use uuid::Uuid;

// ============================================================
// 1. VALIDACION DE MEDICIONES
// ============================================================

/// Valida la estructura basica de una medicion.
///
/// La existencia del sensor se comprueba
/// en PostgreSQL mediante la clave foranea.
///
/// Los rangos fisicos de temperatura y humedad
/// se validan en el servicio de ingesta.
pub fn validar_medicion(medicion: &Medicion) -> Result<(), String> {
    if medicion.id.is_nil() {
        return Err("El identificador de la medicion no es valido".into());
    }

    if medicion.sensor_id.is_nil() {
        return Err("El identificador del sensor no es valido".into());
    }

    if !medicion.valor.is_finite() {
        return Err("El valor de la medicion debe ser finito".into());
    }

    Ok(())
}

// ============================================================
// 2. BUSQUEDA DE MEDICIONES
// ============================================================

/// Busca una medicion mediante su UUID.
pub fn buscar_por_id(mediciones: &[Medicion], id: Uuid) -> Option<Medicion> {
    mediciones
        .iter()
        .find(|medicion| medicion.id == id)
        .cloned()
}

// ============================================================
// 3. FILTRADO DE MEDICIONES
// ============================================================

/// Filtra las mediciones de un sensor.
pub fn filtrar_por_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| medicion.sensor_id == sensor_id)
        .cloned()
        .collect()
}

/// Filtra mediciones de varios sensores.
///
/// Los sensores deben pertenecer al aula
/// correspondiente.
pub fn filtrar_por_sensores(mediciones: &[Medicion], sensores_ids: &[Uuid]) -> Vec<Medicion> {
    mediciones
        .iter()
        .filter(|medicion| sensores_ids.contains(&medicion.sensor_id))
        .cloned()
        .collect()
}

// ============================================================
// 4. ESTADISTICAS GENERALES
// ============================================================

/// Calcula el promedio de valores finitos.
///
/// Devuelve None cuando no existen
/// mediciones validas.
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

/// Calcula el valor maximo.
pub fn calcular_maximo(mediciones: &[Medicion]) -> Option<f64> {
    mediciones
        .iter()
        .map(|medicion| medicion.valor)
        .filter(|valor| valor.is_finite())
        .reduce(f64::max)
}

/// Calcula el valor minimo.
pub fn calcular_minimo(mediciones: &[Medicion]) -> Option<f64> {
    mediciones
        .iter()
        .map(|medicion| medicion.valor)
        .filter(|valor| valor.is_finite())
        .reduce(f64::min)
}

// ============================================================
// 5. ESTADISTICAS POR SENSOR
// ============================================================

/// Calcula el promedio de un sensor.
pub fn calcular_promedio_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_promedio(&filtradas)
}

/// Calcula el maximo de un sensor.
pub fn calcular_maximo_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_maximo(&filtradas)
}

/// Calcula el minimo de un sensor.
pub fn calcular_minimo_sensor(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    let filtradas = filtrar_por_sensor(mediciones, sensor_id);

    calcular_minimo(&filtradas)
}

// ============================================================
// 6. ESTADISTICAS DE TEMPERATURA
// ============================================================

/// Calcula la temperatura promedio (°C).
pub fn calcular_promedio_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Calcula la temperatura maxima (°C).
pub fn calcular_maximo_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Calcula la temperatura minima (°C).
pub fn calcular_minimo_temperatura(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

// ============================================================
// 7. ESTADISTICAS DE HUMEDAD RELATIVA
// ============================================================

/// Calcula la humedad relativa promedio (%).
pub fn calcular_promedio_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_promedio_sensor(mediciones, sensor_id)
}

/// Calcula la humedad relativa maxima (%).
pub fn calcular_maximo_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_maximo_sensor(mediciones, sensor_id)
}

/// Calcula la humedad relativa minima (%).
pub fn calcular_minimo_humedad(mediciones: &[Medicion], sensor_id: Uuid) -> Option<f64> {
    calcular_minimo_sensor(mediciones, sensor_id)
}

// ============================================================
// 8. PRUEBAS UNITARIAS
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

    #[test]
    fn calcula_estadisticas_temperatura() {
        let sensor_id = Uuid::new_v4();

        let mediciones = vec![
            crear_medicion(sensor_id, 24.0),
            crear_medicion(sensor_id, 26.0),
            crear_medicion(sensor_id, 28.0),
        ];

        assert_eq!(
            calcular_promedio_temperatura(&mediciones, sensor_id),
            Some(26.0)
        );

        assert_eq!(
            calcular_maximo_temperatura(&mediciones, sensor_id),
            Some(28.0)
        );

        assert_eq!(
            calcular_minimo_temperatura(&mediciones, sensor_id),
            Some(24.0)
        );
    }

    #[test]
    fn calcula_estadisticas_humedad() {
        let sensor_id = Uuid::new_v4();

        let mediciones = vec![
            crear_medicion(sensor_id, 40.0),
            crear_medicion(sensor_id, 50.0),
            crear_medicion(sensor_id, 60.0),
        ];

        assert_eq!(
            calcular_promedio_humedad(&mediciones, sensor_id),
            Some(50.0)
        );

        assert_eq!(calcular_maximo_humedad(&mediciones, sensor_id), Some(60.0));

        assert_eq!(calcular_minimo_humedad(&mediciones, sensor_id), Some(40.0));
    }
}
