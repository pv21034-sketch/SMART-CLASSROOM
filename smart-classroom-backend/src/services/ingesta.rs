//! SMART CLASSROOM — Servicio de Ingesta
//!
//! Procesa los datos ambientales enviados por el ESP32.
//!
//! Flujo:
//! 1. Validar el JSON recibido.
//! 2. Buscar el dispositivo y comprobar que esté activo.
//! 3. Obtener el aula asignada al dispositivo.
//! 4. Guardar una medición por cada sensor activo.
//! 5. Comparar las mediciones con sus rangos.
//! 6. Registrar las alertas correspondientes.
//! 7. Calcular y guardar el índice de confort.
//! 8. Actualizar la última conexión del dispositivo.
//! 9. Confirmar la transacción.
//!
//! La selección del aula se administra desde el frontend
//! mediante la asignación del dispositivo.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::{ApiError, ApiResult};
use crate::schemas::ingesta::NuevaMedicion;
use crate::services::confort::{self, DatosAmbientales};

// ============================================================
// 1. LÍMITES DE VALIDACIÓN
// ============================================================

/// Límites operativos preliminares de las lecturas.
///
/// No representan rangos de confort.
/// Deben revisarse según las especificaciones y
/// la calibración de los sensores utilizados.
const LIMITES_FISICOS: [(&str, f64, f64); 4] = [
    ("temperatura", -40.0, 85.0),
    ("humedad", 0.0, 100.0),
    ("iluminacion", 0.0, 100_000.0),
    ("ruido", 0.0, 140.0),
];

// ============================================================
// 2. ESTRUCTURAS DE RESPUESTA
// ============================================================

/// Información de una variable fuera de rango.
#[derive(Debug, Clone, Serialize)]
pub struct AlertaGenerada {
    pub tipo_sensor: String,
    pub unidad: String,

    /// "por_debajo" o "por_encima".
    pub tipo: String,

    pub valor: f64,
    pub valor_minimo: f64,
    pub valor_maximo: f64,
    pub mensaje: String,

    /// Indica si se insertó una alerta nueva.
    pub nueva: bool,
}

/// Resultado del procesamiento de una lectura ESP32.
#[derive(Debug, Clone, Serialize)]
pub struct ResultadoIngesta {
    pub aula_id: Uuid,
    pub aula_codigo: String,
    pub dispositivo: String,
    pub medido_en: DateTime<Utc>,
    pub valores: BTreeMap<String, f64>,
    pub omitidas: Vec<String>,
    pub alertas: Vec<AlertaGenerada>,

    /// Índice de confort en escala 0–100.
    pub confort: Option<f64>,
    pub estado_confort: Option<&'static str>,

    /// NORMAL o ALERTA.
    pub estado: &'static str,
}

// ============================================================
// 3. RECOLECCIÓN Y VALIDACIÓN
// ============================================================

/// Valida las variables recibidas en el JSON.
///
/// Solo devuelve las variables presentes.
fn recolectar(datos: &NuevaMedicion) -> ApiResult<Vec<(&'static str, f64)>> {
    let valores = [
        datos.temperatura,
        datos.humedad,
        datos.iluminacion,
        datos.ruido,
    ];

    let mut lecturas = Vec::new();

    for ((nombre, minimo, maximo), valor) in LIMITES_FISICOS.iter().zip(valores) {
        let Some(valor) = valor else {
            continue;
        };

        if !valor.is_finite() {
            return Err(ApiError::BadRequest(format!(
                "'{nombre}' debe ser un número válido"
            )));
        }

        if valor < *minimo || valor > *maximo {
            return Err(ApiError::BadRequest(format!(
                "'{nombre}' ({valor}) está fuera de los límites \
                  permitidos [{minimo}, {maximo}]"
            )));
        }

        lecturas.push((*nombre, valor));
    }

    Ok(lecturas)
}

// ============================================================
// 4. CÁLCULO DEL CONFORT
// ============================================================

/// Calcula el índice de confort en escala 0–100.
///
/// Solo devuelve un resultado cuando se han
/// guardado las cuatro variables ambientales.
fn calcular_confort(valores: &BTreeMap<String, f64>) -> Option<f64> {
    let datos = DatosAmbientales {
        temperatura: *valores.get("temperatura")?,
        humedad: *valores.get("humedad")?,
        iluminacion: *valores.get("iluminacion")?,
        ruido: *valores.get("ruido")?,
    };

    confort::calcular_indice_confort_porcentaje(&datos)
        .ok()
        .map(|indice| (indice * 10.0).round() / 10.0)
}

// ============================================================
// 5. PROCESAMIENTO PRINCIPAL
// ============================================================

/// Procesa una lectura del ESP32.
///
/// La operación utiliza una transacción para
/// mantener consistencia entre mediciones,
/// alertas, confort y última conexión.
pub async fn procesar(pool: &PgPool, datos: NuevaMedicion) -> ApiResult<ResultadoIngesta> {
    // --------------------------------------------------------
    // 5.1 VALIDAR IDENTIFICADOR Y LECTURAS
    // --------------------------------------------------------

    let identificador = datos.dispositivo_id.trim().to_string();

    if identificador.is_empty() {
        return Err(ApiError::BadRequest("dispositivo_id es obligatorio".into()));
    }

    let lecturas = recolectar(&datos)?;

    if lecturas.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe enviar al menos una medición: \
              temperatura, humedad, iluminacion o ruido"
                .into(),
        ));
    }

    // --------------------------------------------------------
    // 5.2 INICIAR TRANSACCIÓN
    // --------------------------------------------------------

    let mut tx = pool.begin().await?;

    // --------------------------------------------------------
    // 5.3 IDENTIFICAR DISPOSITIVO Y AULA
    // --------------------------------------------------------

    // FOR UPDATE bloquea la fila del dispositivo
    // mientras se procesa la lectura.
    //
    // Esto permite coordinar la ingesta con una
    // reasignación de aula que también actualice
    // la fila de dispositivos.
    let dispositivo: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT d.id, d.aula_id, d.estado, a.codigo
                FROM dispositivos d
                JOIN aulas a ON a.id = d.aula_id
               WHERE d.identificador = $1
               FOR UPDATE OF d",
    )
    .bind(&identificador)
    .fetch_optional(&mut *tx)
    .await?;

    let (dispositivo_id, aula_id, estado_dispositivo, aula_codigo) =
        dispositivo.ok_or_else(|| {
            ApiError::NotFound(format!("Dispositivo '{identificador}' no registrado"))
        })?;

    if estado_dispositivo != "activo" {
        return Err(ApiError::Forbidden(format!(
            "El dispositivo '{identificador}' está \
              en estado '{estado_dispositivo}'"
        )));
    }

    // --------------------------------------------------------
    // 5.4 PREPARAR RESULTADOS
    // --------------------------------------------------------

    let mut valores: BTreeMap<String, f64> = BTreeMap::new();

    let mut omitidas: Vec<String> = Vec::new();

    let mut alertas: Vec<AlertaGenerada> = Vec::new();

    let mut medido_en: Option<DateTime<Utc>> = None;

    // --------------------------------------------------------
    // 5.5 PROCESAR CADA VARIABLE
    // --------------------------------------------------------

    for (tipo, valor) in &lecturas {
        // Buscar el sensor activo correspondiente
        // al dispositivo y al tipo de variable.
        let sensor: Option<(Uuid, Uuid, String)> = sqlx::query_as(
            "SELECT s.id, ts.id, ts.unidad
                    FROM sensores s
                    JOIN tipos_sensor ts
                      ON ts.id = s.tipo_sensor_id
                   WHERE s.dispositivo_id = $1
                     AND ts.nombre = $2
                     AND s.estado = 'activo'",
        )
        .bind(dispositivo_id)
        .bind(*tipo)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((sensor_id, tipo_sensor_id, unidad)) = sensor else {
            tracing::warn!(
                "Dispositivo '{}' sin sensor activo \
                  para '{}': lectura omitida",
                identificador,
                tipo
            );

            omitidas.push(tipo.to_string());
            continue;
        };

        // ----------------------------------------------------
        // GUARDAR MEDICIÓN
        // ----------------------------------------------------

        let (medicion_id, fecha_medicion): (Uuid, DateTime<Utc>) = sqlx::query_as(
            "INSERT INTO mediciones (sensor_id, valor)
              VALUES ($1, $2)
              RETURNING id, medido_en",
        )
        .bind(sensor_id)
        .bind(*valor)
        .fetch_one(&mut *tx)
        .await?;

        if medido_en.is_none() {
            medido_en = Some(fecha_medicion);
        }

        valores.insert(tipo.to_string(), *valor);

        // ----------------------------------------------------
        // CONSULTAR RANGO CONFIGURADO
        // ----------------------------------------------------

        let rango: Option<(Uuid, f64, f64)> = sqlx::query_as(
            "SELECT id, valor_minimo, valor_maximo
                    FROM rangos_sensor
                   WHERE aula_id = $1
                     AND tipo_sensor_id = $2
                     AND activo = TRUE",
        )
        .bind(aula_id)
        .bind(tipo_sensor_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((rango_id, minimo, maximo)) = rango else {
            continue;
        };

        // ----------------------------------------------------
        // EVALUAR MEDICIÓN
        // ----------------------------------------------------

        let desviacion = if *valor < minimo {
            Some(("por_debajo", "por debajo del mínimo", minimo))
        } else if *valor > maximo {
            Some(("por_encima", "por encima del máximo", maximo))
        } else {
            None
        };

        let Some((tipo_alerta, descripcion, limite)) = desviacion else {
            continue;
        };

        let mensaje = format!(
            "{tipo}: {valor:.1} {unidad}, \
              {descripcion} permitido \
              ({limite:.1} {unidad})"
        );

        // ----------------------------------------------------
        // REGISTRAR ALERTA
        // ----------------------------------------------------

        // PostgreSQL puede completar los límites
        // históricos mediante el trigger definido
        // en el esquema original.
        //
        // Si existe una alerta activa del mismo
        // rango y tipo, no se duplica.
        let insertadas = sqlx::query(
            "INSERT INTO alertas (
                  medicion_id,
                  rango_sensor_id,
                  tipo,
                  mensaje,
                  valor_minimo_aplicado,
                  valor_maximo_aplicado
              )
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING",
        )
        .bind(medicion_id)
        .bind(rango_id)
        .bind(tipo_alerta)
        .bind(&mensaje)
        .bind(minimo)
        .bind(maximo)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        let nueva = insertadas > 0;

        alertas.push(AlertaGenerada {
            tipo_sensor: tipo.to_string(),
            unidad,
            tipo: tipo_alerta.to_string(),
            valor: *valor,
            valor_minimo: minimo,
            valor_maximo: maximo,
            mensaje,
            nueva,
        });
    }

    // --------------------------------------------------------
    // 5.6 VERIFICAR QUE SE GUARDÓ ALGUNA MEDICIÓN
    // --------------------------------------------------------

    let Some(medido_en) = medido_en else {
        // Sin commit, la transacción se revierte.
        return Err(ApiError::BadRequest(format!(
            "El dispositivo '{identificador}' \
              no tiene sensores activos para \
              las variables enviadas"
        )));
    };

    // --------------------------------------------------------
    // 5.7 ACTUALIZAR ÚLTIMA CONEXIÓN
    // --------------------------------------------------------

    sqlx::query(
        "UPDATE dispositivos
             SET ultima_conexion = NOW()
           WHERE id = $1",
    )
    .bind(dispositivo_id)
    .execute(&mut *tx)
    .await?;

    // --------------------------------------------------------
    // 5.8 CALCULAR Y GUARDAR CONFORT
    // --------------------------------------------------------

    // Solo se calcula cuando las cuatro variables
    // se guardaron durante esta misma ingesta.
    let confort_valor = calcular_confort(&valores);

    if let Some(indice) = confort_valor {
        sqlx::query(
            "INSERT INTO indices_confort (aula_id, valor)
              VALUES ($1, $2)",
        )
        .bind(aula_id)
        .bind(indice)
        .execute(&mut *tx)
        .await?;
    }

    // --------------------------------------------------------
    // 5.9 CONFIRMAR TRANSACCIÓN
    // --------------------------------------------------------

    tx.commit().await?;

    // --------------------------------------------------------
    // 5.10 PREPARAR RESPUESTA
    // --------------------------------------------------------

    let estado = if alertas.is_empty() {
        "NORMAL"
    } else {
        "ALERTA"
    };

    let estado_confort = confort_valor.map(confort::obtener_estado_confort_porcentaje);

    Ok(ResultadoIngesta {
        aula_id,
        aula_codigo,
        dispositivo: identificador,
        medido_en,
        valores,
        omitidas,
        alertas,
        confort: confort_valor,
        estado_confort,
        estado,
    })
}

// ============================================================
// 6. PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calcula_confort_con_cuatro_variables() {
        let mut valores = BTreeMap::new();

        valores.insert("temperatura".to_string(), 26.0);
        valores.insert("humedad".to_string(), 50.0);
        valores.insert("iluminacion".to_string(), 400.0);
        valores.insert("ruido".to_string(), 40.0);

        let resultado = calcular_confort(&valores);

        assert_eq!(resultado, Some(100.0));
    }

    #[test]
    fn no_calcula_confort_si_falta_una_variable() {
        let mut valores = BTreeMap::new();

        valores.insert("temperatura".to_string(), 26.0);
        valores.insert("humedad".to_string(), 50.0);
        valores.insert("iluminacion".to_string(), 400.0);

        let resultado = calcular_confort(&valores);

        assert_eq!(resultado, None);
    }

    #[test]
    fn rechaza_valores_no_finitos_en_confort() {
        let mut valores = BTreeMap::new();

        valores.insert("temperatura".to_string(), f64::NAN);
        valores.insert("humedad".to_string(), 50.0);
        valores.insert("iluminacion".to_string(), 400.0);
        valores.insert("ruido".to_string(), 40.0);

        assert_eq!(calcular_confort(&valores), None);
    }
}
