//! SMART CLASSROOM — Servicio de Alertas
//!
//! Evalúa las mediciones ambientales utilizando
//! los rangos configurados para cada aula.
//!
//! Compatible con los modelos:
//! - Medicion
//! - RangoSensor
//! - Alerta
//!
//! Cada alerta conserva una copia de los límites
//! aplicados en el momento de su generación.
//!
//! Este servicio genera alertas en memoria.
//! Su persistencia en PostgreSQL corresponde
//! al servicio de ingesta o a la capa de datos.

use crate::models::{Alerta, Medicion, RangoSensor};
use chrono::Utc;
use uuid::Uuid;

// ============================================================
// 1. VALIDACIÓN DEL RANGO
// ============================================================

/// Verifica que el rango esté activo y sea válido.
fn rango_valido(rango: &RangoSensor) -> bool {
    rango.activo && rango.limites_validos()
}

// ============================================================
// 2. EVALUACIÓN GENERAL
// ============================================================

/// Evalúa una medición contra un rango ambiental.
///
/// Devuelve:
/// - Some(Alerta) si está fuera del rango.
/// - None si está dentro del rango.
/// - None si el rango está inactivo o es inválido.
///
/// IMPORTANTE:
/// El código que llama a esta función debe
/// verificar previamente que:
/// 1. El rango corresponde al aula seleccionada.
/// 2. El tipo de sensor de la medición coincide
///    con el tipo de sensor del rango.
pub fn verificar_medicion(
    medicion: &Medicion,
    rango: &RangoSensor,
    nombre_variable: &str,
    unidad: &str,
) -> Option<Alerta> {
    if medicion.id.is_nil()
        || medicion.sensor_id.is_nil()
        || !medicion.valor.is_finite()
        || !rango_valido(rango)
    {
        return None;
    }

    let tipo = rango.evaluar_valor(medicion.valor)?;

    let mensaje = match tipo {
        "por_debajo" => format!(
            "La {} ({:.2} {}) está por debajo del mínimo permitido ({:.2} {})",
            nombre_variable, medicion.valor, unidad, rango.valor_minimo, unidad
        ),

        "por_encima" => format!(
            "La {} ({:.2} {}) está por encima del máximo permitido ({:.2} {})",
            nombre_variable, medicion.valor, unidad, rango.valor_maximo, unidad
        ),

        _ => return None,
    };

    Some(crear_alerta(medicion, rango, tipo, mensaje))
}

// ============================================================
// 3. EVALUACIÓN POR VARIABLE AMBIENTAL
// ============================================================

/// Verifica si la temperatura está fuera del rango.
///
/// El rango debe corresponder al tipo temperatura.
pub fn verificar_temperatura(medicion: &Medicion, rango: &RangoSensor) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "temperatura", "°C")
}

/// Verifica si la humedad está fuera del rango.
///
/// El rango debe corresponder al tipo humedad.
pub fn verificar_humedad(medicion: &Medicion, rango: &RangoSensor) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "humedad", "%")
}

/// Verifica si la iluminación está fuera del rango.
///
/// El rango debe corresponder al tipo iluminación.
pub fn verificar_iluminacion(medicion: &Medicion, rango: &RangoSensor) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "iluminación", "lux")
}

/// Verifica si el ruido está fuera del rango.
///
/// El rango debe corresponder al tipo ruido.
/// La unidad utilizada debe coincidir con la
/// calibración del sensor de sonido.
pub fn verificar_ruido(medicion: &Medicion, rango: &RangoSensor) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "nivel de ruido", "dB")
}

// ============================================================
// 4. GENERACIÓN DE ALERTAS
// ============================================================

/// Evalúa un conjunto de mediciones contra sus
/// respectivos rangos ambientales.
///
/// Cada elemento contiene:
/// - La medición.
/// - El rango aplicable.
/// - El nombre de la variable.
/// - La unidad de medida.
///
/// Las asociaciones entre sensores, tipos y aulas
/// deben validarse antes de llamar a esta función.
pub fn generar_alertas(datos: &[(&Medicion, &RangoSensor, &str, &str)]) -> Vec<Alerta> {
    datos
        .iter()
        .filter_map(|(medicion, rango, nombre, unidad)| {
            verificar_medicion(medicion, rango, nombre, unidad)
        })
        .collect()
}

// ============================================================
// 5. CREACIÓN DE ALERTAS
// ============================================================

/// Construye una alerta compatible con PostgreSQL.
///
/// Guarda los límites del rango como una copia
/// histórica de la configuración aplicada.
fn crear_alerta(medicion: &Medicion, rango: &RangoSensor, tipo: &str, mensaje: String) -> Alerta {
    Alerta {
        id: Uuid::new_v4(),

        medicion_id: medicion.id,

        rango_sensor_id: rango.id,

        tipo: tipo.to_string(),

        mensaje: Some(mensaje),

        estado: "activa".to_string(),

        valor_minimo_aplicado: rango.valor_minimo,

        valor_maximo_aplicado: rango.valor_maximo,

        generada_en: Utc::now(),

        resuelta_en: None,
    }
}

// ============================================================
// 6. PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn crear_medicion_prueba(valor: f64) -> Medicion {
        Medicion {
            id: Uuid::new_v4(),
            sensor_id: Uuid::new_v4(),
            valor,
            medido_en: Utc::now(),
        }
    }

    fn crear_rango_prueba(minimo: f64, maximo: f64, activo: bool) -> RangoSensor {
        RangoSensor {
            id: Uuid::new_v4(),
            aula_id: Uuid::new_v4(),
            tipo_sensor_id: Uuid::new_v4(),
            valor_minimo: minimo,
            valor_maximo: maximo,
            activo,
            creado_en: Utc::now(),
        }
    }

    #[test]
    fn genera_alerta_por_temperatura_alta() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let alerta = verificar_temperatura(&medicion, &rango).expect("Debe generar una alerta");

        assert_eq!(alerta.tipo, "por_encima");
        assert_eq!(alerta.estado, "activa");
        assert_eq!(alerta.medicion_id, medicion.id);
        assert_eq!(alerta.rango_sensor_id, rango.id);
        assert_eq!(alerta.valor_minimo_aplicado, 20.0);
        assert_eq!(alerta.valor_maximo_aplicado, 30.0);
    }

    #[test]
    fn genera_alerta_por_temperatura_baja() {
        let medicion = crear_medicion_prueba(15.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let alerta = verificar_temperatura(&medicion, &rango).expect("Debe generar una alerta");

        assert_eq!(alerta.tipo, "por_debajo");
    }

    #[test]
    fn no_genera_alerta_dentro_del_rango() {
        let medicion = crear_medicion_prueba(25.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let resultado = verificar_temperatura(&medicion, &rango);

        assert!(resultado.is_none());
    }

    #[test]
    fn no_genera_alerta_si_rango_inactivo() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(20.0, 30.0, false);

        let resultado = verificar_temperatura(&medicion, &rango);

        assert!(resultado.is_none());
    }

    #[test]
    fn no_genera_alerta_si_rango_invalido() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(30.0, 20.0, true);

        let resultado = verificar_temperatura(&medicion, &rango);

        assert!(resultado.is_none());
    }

    #[test]
    fn conserva_limites_historicos() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let alerta = verificar_temperatura(&medicion, &rango).expect("Debe generar una alerta");

        assert_eq!(alerta.valor_minimo_aplicado, 20.0);

        assert_eq!(alerta.valor_maximo_aplicado, 30.0);
    }

    #[test]
    fn genera_varias_alertas() {
        let temperatura = crear_medicion_prueba(35.0);
        let humedad = crear_medicion_prueba(80.0);

        let rango_temperatura = crear_rango_prueba(20.0, 30.0, true);

        let rango_humedad = crear_rango_prueba(40.0, 60.0, true);

        let datos = [
            (&temperatura, &rango_temperatura, "temperatura", "°C"),
            (&humedad, &rango_humedad, "humedad", "%"),
        ];

        let alertas = generar_alertas(&datos);

        assert_eq!(alertas.len(), 2);
    }
}
