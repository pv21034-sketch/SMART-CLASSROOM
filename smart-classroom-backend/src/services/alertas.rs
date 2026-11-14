
 //! SMART CLASSROOM — Servicio de Alertas
 //!
 //! Evalua las mediciones de temperatura y
 //! humedad relativa segun los rangos del aula.
 //!
 //! Este servicio genera alertas en memoria.
 //! La persistencia en PostgreSQL corresponde
 //! al servicio de ingesta.
 //!
 //! Los limites aplicados se conservan dentro
 //! del modelo Rust Alerta. Su persistencia
 //! historica requiere columnas compatibles
 //! en la base de datos.

use crate::models::{Alerta, Medicion, RangoSensor};
use chrono::Utc;
use uuid::Uuid;

// ============================================================
// 1. VALIDACION DEL RANGO
// ============================================================

/// Verifica que el rango este activo y sea valido.
fn rango_valido(rango: &RangoSensor) -> bool {
    rango.activo && rango.limites_validos()
}

// ============================================================
// 2. EVALUACION GENERAL
// ============================================================

/// Evalua una medicion contra un rango.
///
/// Devuelve Some(Alerta) cuando el valor
/// esta fuera de los limites permitidos.
///
/// IMPORTANTE:
/// El servicio que llama a esta funcion debe
/// comprobar que el rango corresponda al aula
/// y al tipo de sensor de la medicion.
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
            nombre_variable,
            medicion.valor,
            unidad,
            rango.valor_minimo,
            unidad
        ),

        "por_encima" => format!(
            "La {} ({:.2} {}) está por encima del máximo permitido ({:.2} {})",
            nombre_variable,
            medicion.valor,
            unidad,
            rango.valor_maximo,
            unidad
        ),

        _ => return None,
    };

    Some(crear_alerta(medicion, rango, tipo, mensaje))
}

// ============================================================
// 3. EVALUACION POR VARIABLE
// ============================================================

/// Evalua temperatura en grados Celsius.
///
/// El rango debe pertenecer al tipo temperatura.
pub fn verificar_temperatura(
    medicion: &Medicion,
    rango: &RangoSensor,
) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "temperatura", "°C")
}

/// Evalua humedad relativa en porcentaje.
///
/// El rango debe pertenecer al tipo humedad.
pub fn verificar_humedad(
    medicion: &Medicion,
    rango: &RangoSensor,
) -> Option<Alerta> {
    verificar_medicion(medicion, rango, "humedad relativa", "%")
}

// ============================================================
// 4. GENERACION DE ALERTAS
// ============================================================

/// Procesa un conjunto de mediciones.
///
/// Cada elemento contiene:
/// - Medicion.
/// - Rango.
/// - Nombre de la variable.
/// - Unidad.
///
/// Las asociaciones entre aula, sensor y rango
/// deben comprobarse previamente.
pub fn generar_alertas(
    datos: &[(&Medicion, &RangoSensor, &str, &str)],
) -> Vec<Alerta> {
    datos
        .iter()
        .filter_map(|(medicion, rango, nombre, unidad)| {
            verificar_medicion(medicion, rango, nombre, unidad)
        })
        .collect()
}

// ============================================================
// 5. CONSTRUCCION DE ALERTAS
// ============================================================

/// Construye una alerta en memoria.
///
/// Los limites se copian desde el rango
/// utilizado al momento de evaluarla.
fn crear_alerta(
    medicion: &Medicion,
    rango: &RangoSensor,
    tipo: &str,
    mensaje: String,
) -> Alerta {
    Alerta {
        id: Uuid::new_v4(),

        medicion_id: medicion.id,

        rango_sensor_id: rango.id,

        tipo: tipo.to_string(),

        mensaje: Some(mensaje),

        estado: "activa".to_string(),

        // Conservamos los limites historicos.
        valor_minimo_aplicado: Some(rango.valor_minimo),

        valor_maximo_aplicado: Some(rango.valor_maximo),

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

    fn crear_rango_prueba(
        minimo: f64,
        maximo: f64,
        activo: bool,
    ) -> RangoSensor {
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

        let alerta = verificar_temperatura(&medicion, &rango).unwrap();

        assert_eq!(alerta.tipo, "por_encima");
        assert_eq!(alerta.estado, "activa");
        assert_eq!(alerta.medicion_id, medicion.id);
        assert_eq!(alerta.rango_sensor_id, rango.id);
        assert_eq!(alerta.valor_minimo_aplicado, Some(20.0));
        assert_eq!(alerta.valor_maximo_aplicado, Some(30.0));
    }

    #[test]
    fn genera_alerta_por_temperatura_baja() {
        let medicion = crear_medicion_prueba(15.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let alerta = verificar_temperatura(&medicion, &rango).unwrap();

        assert_eq!(alerta.tipo, "por_debajo");
    }

    #[test]
    fn genera_alerta_por_humedad_alta() {
        let medicion = crear_medicion_prueba(85.0);
        let rango = crear_rango_prueba(40.0, 60.0, true);

        let alerta = verificar_humedad(&medicion, &rango).unwrap();

        assert_eq!(alerta.tipo, "por_encima");
        assert!(alerta.mensaje.unwrap().contains("humedad relativa"));
    }

    #[test]
    fn genera_alerta_por_humedad_baja() {
        let medicion = crear_medicion_prueba(25.0);
        let rango = crear_rango_prueba(40.0, 60.0, true);

        let alerta = verificar_humedad(&medicion, &rango).unwrap();

        assert_eq!(alerta.tipo, "por_debajo");
    }

    #[test]
    fn no_genera_alerta_dentro_del_rango() {
        let medicion = crear_medicion_prueba(25.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        assert!(verificar_temperatura(&medicion, &rango).is_none());
    }

    #[test]
    fn no_genera_alerta_si_rango_inactivo() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(20.0, 30.0, false);

        assert!(verificar_temperatura(&medicion, &rango).is_none());
    }

    #[test]
    fn no_genera_alerta_si_rango_invalido() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(30.0, 20.0, true);

        assert!(verificar_temperatura(&medicion, &rango).is_none());
    }

    #[test]
    fn conserva_limites_historicos() {
        let medicion = crear_medicion_prueba(35.0);
        let rango = crear_rango_prueba(20.0, 30.0, true);

        let alerta = verificar_temperatura(&medicion, &rango).unwrap();

        assert_eq!(alerta.valor_minimo_aplicado, Some(20.0));
        assert_eq!(alerta.valor_maximo_aplicado, Some(30.0));
    }

    #[test]
    fn genera_varias_alertas() {
        let temperatura = crear_medicion_prueba(35.0);
        let humedad = crear_medicion_prueba(80.0);

        let rango_temperatura = crear_rango_prueba(20.0, 30.0, true);
        let rango_humedad = crear_rango_prueba(40.0, 60.0, true);

        let datos = [
            (&temperatura, &rango_temperatura, "temperatura", "°C"),
            (&humedad, &rango_humedad, "humedad relativa", "%"),
        ];

        let alertas = generar_alertas(&datos);

        assert_eq!(alertas.len(), 2);
    }
}
