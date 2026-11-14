
 // ============================================================
 // SMART CLASSROOM — SERVICIO DE INGESTA
 // ============================================================
 //
 // Recibe temperatura y humedad relativa del ESP32.
 //
 // Funciones:
 // 1. Validar las lecturas.
 // 2. Identificar dispositivo y aula.
 // 3. Verificar sensores activos.
 // 4. Guardar las mediciones con su aula de origen.
 // 5. Evaluar rangos y generar alertas.
 // 6. Calcular y guardar el indice de confort.
 // 7. Calcular y guardar resultados termodinamicos.
 // 8. Calcular variacion termica por aula.
 // 9. Actualizar la ultima conexion.
 // 10. Confirmar la transaccion.
 //
 // Todas las escrituras se realizan dentro de una
 // unica transaccion PostgreSQL.
 // ============================================================

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::{ApiError, ApiResult};
use crate::schemas::ingesta::NuevaMedicion;

use crate::services::confort::{
    calcular_indice_confort_porcentaje,
    obtener_estado_confort_porcentaje,
    DatosAmbientales,
};

use crate::services::termodinamica::{
    calcular,
    calcular_variacion_termica,
};

// ============================================================
// 1. LIMITES DE VALIDACION
// ============================================================

const TEMP_MIN: f64 = -40.0;
const TEMP_MAX: f64 = 85.0;

const HUM_MIN: f64 = 0.0;
const HUM_MAX: f64 = 100.0;

// ============================================================
// 2. ESTRUCTURAS DE RESPUESTA
// ============================================================

#[derive(Debug, Clone, Serialize)]
pub struct AlertaGenerada {
    pub tipo_sensor: String,
    pub unidad: String,
    pub tipo: String,
    pub valor: f64,
    pub valor_minimo: f64,
    pub valor_maximo: f64,
    pub mensaje: String,
    pub nueva: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TermodinamicaCalculada {
    pub punto_rocio_c: f64,
    pub humedad_absoluta_g_m3: f64,
    pub presion_vapor_kpa: f64,
    pub variacion_termica_c_min: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResultadoIngesta {
    pub aula_id: Uuid,
    pub aula_codigo: String,
    pub dispositivo: String,
    pub medido_en: DateTime<Utc>,

    pub valores: BTreeMap<String, f64>,
    pub omitidas: Vec<String>,
    pub alertas: Vec<AlertaGenerada>,

    pub confort: Option<f64>,
    pub estado_confort: Option<&'static str>,

    pub termodinamica: Option<TermodinamicaCalculada>,

    pub estado: &'static str,
}

// ============================================================
// 3. VALIDACION DE LECTURAS
// ============================================================

fn validar_lecturas(
    datos: &NuevaMedicion,
) -> ApiResult<Vec<(&'static str, f64)>> {
    let lecturas = [
        (
            "temperatura",
            datos.temperatura,
            TEMP_MIN,
            TEMP_MAX,
        ),
        (
            "humedad",
            datos.humedad,
            HUM_MIN,
            HUM_MAX,
        ),
    ];

    for (nombre, valor, minimo, maximo) in &lecturas {
        if !valor.is_finite() {
            return Err(ApiError::BadRequest(format!(
                "'{nombre}' debe ser un numero finito"
            )));
        }

        if *valor < *minimo || *valor > *maximo {
            return Err(ApiError::BadRequest(format!(
                "'{nombre}' ({valor}) fuera del rango \
                 permitido [{minimo}, {maximo}]"
            )));
        }
    }

    Ok(
        lecturas
            .into_iter()
            .map(|(nombre, valor, _, _)| (nombre, valor))
            .collect(),
    )
}

// ============================================================
// 4. PROCESAMIENTO PRINCIPAL
// ============================================================

pub async fn procesar(
    pool: &PgPool,
    datos: NuevaMedicion,
) -> ApiResult<ResultadoIngesta> {

    // --------------------------------------------------------
    // 4.1 VALIDAR IDENTIFICADOR Y LECTURAS
    // --------------------------------------------------------

    let identificador =
        datos.dispositivo_id.trim().to_string();

    if identificador.is_empty() {
        return Err(ApiError::BadRequest(
            "dispositivo_id es obligatorio".into(),
        ));
    }

    let lecturas = validar_lecturas(&datos)?;

    // Utilizar fecha historica cuando se proporcione.
    // En caso contrario, utilizar la fecha actual.
    //
    // Temperatura y humedad comparten la misma fecha.

    let fecha_objetivo =
        datos.medido_en.unwrap_or_else(Utc::now);

    // --------------------------------------------------------
    // 4.2 CALCULAR CONFORT AMBIENTAL
    // --------------------------------------------------------

    let ambientales = DatosAmbientales {
        temperatura: datos.temperatura,
        humedad: datos.humedad,
    };

    let confort =
        calcular_indice_confort_porcentaje(&ambientales)
            .map_err(ApiError::BadRequest)?;

    let estado_confort =
        obtener_estado_confort_porcentaje(confort);

    // --------------------------------------------------------
    // 4.3 CALCULAR RESULTADOS TERMODINAMICOS
    // --------------------------------------------------------

    let resultado_termodinamico =
        calcular(datos.temperatura, datos.humedad)
            .map_err(ApiError::BadRequest)?;

    // --------------------------------------------------------
    // 4.4 INICIAR TRANSACCION
    // --------------------------------------------------------

    let mut tx = pool.begin().await?;

    // --------------------------------------------------------
    // 4.5 IDENTIFICAR DISPOSITIVO Y AULA
    // --------------------------------------------------------

    // Bloquear la fila del dispositivo durante
    // esta transaccion para evitar conflictos.

    let dispositivo: Option<(
        Uuid,
        Uuid,
        String,
        String,
    )> = sqlx::query_as(
        "SELECT
            d.id,
            d.aula_id,
            d.estado,
            a.codigo
         FROM dispositivos d
         JOIN aulas a
           ON a.id = d.aula_id
         WHERE d.identificador = $1
         FOR UPDATE OF d",
    )
    .bind(&identificador)
    .fetch_optional(&mut *tx)
    .await?;

    let (
        dispositivo_id,
        aula_predeterminada_id,
        estado_dispositivo,
        aula_predeterminada_codigo,
    ) = dispositivo.ok_or_else(|| {
        ApiError::NotFound(format!(
            "Dispositivo '{identificador}' no registrado"
        ))
    })?;

    if estado_dispositivo != "activo" {
        return Err(ApiError::Forbidden(format!(
            "El dispositivo '{identificador}' \
             esta en estado '{estado_dispositivo}'"
        )));
    }

    // --------------------------------------------------------
    // 4.6 SELECCIONAR AULA DE LA MEDICION
    // --------------------------------------------------------

    // El mismo ESP32 puede utilizarse en:
    //
    // AULA-2B: lunes.
    // AULA-A6: miercoles.
    // AULA-PRUEBAS: pruebas de integracion.
    //
    // Si aula_codigo no se proporciona, se utiliza
    // el aula predeterminada del dispositivo.

    let (aula_id, aula_codigo) =
        if let Some(codigo) = datos.aula_codigo.as_deref() {

            let codigo = codigo.trim();

            if codigo != "AULA-2B"
                && codigo != "AULA-A6"
                && codigo != "AULA-PRUEBAS"
            {
                return Err(ApiError::BadRequest(format!(
                    "Aula '{codigo}' no permitida"
                )));
            }

            let aula: Option<(Uuid, String)> =
                sqlx::query_as(
                    "SELECT id, codigo
                     FROM aulas
                     WHERE codigo = $1",
                )
                .bind(codigo)
                .fetch_optional(&mut *tx)
                .await?;

            aula.ok_or_else(|| {
                ApiError::NotFound(format!(
                    "Aula '{codigo}' no registrada"
                ))
            })?
        } else {
            (
                aula_predeterminada_id,
                aula_predeterminada_codigo,
            )
        };

    // --------------------------------------------------------
    // 4.7 PREPARAR RESULTADOS
    // --------------------------------------------------------

    let mut valores = BTreeMap::new();
    let mut alertas = Vec::new();

    let medido_en = fecha_objetivo;

    let mut medicion_temperatura_id: Option<Uuid> = None;
    let mut medicion_humedad_id: Option<Uuid> = None;

    // --------------------------------------------------------
    // 4.8 VERIFICAR SENSORES ACTIVOS
    // --------------------------------------------------------

    let mut sensores = Vec::new();

    for (tipo, valor) in &lecturas {

        let sensor: Option<(Uuid, Uuid, String)> =
            sqlx::query_as(
                "SELECT
                    s.id,
                    ts.id,
                    ts.unidad
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

        let (
            sensor_id,
            tipo_sensor_id,
            unidad,
        ) = sensor.ok_or_else(|| {
            ApiError::BadRequest(format!(
                "El dispositivo '{identificador}' \
                 no tiene un sensor activo de '{tipo}'"
            ))
        })?;

        sensores.push((
            *tipo,
            *valor,
            sensor_id,
            tipo_sensor_id,
            unidad,
        ));
    }

    // --------------------------------------------------------
    // 4.9 EVITAR MEDICIONES DUPLICADAS
    // --------------------------------------------------------

    // Comprobar si existe una medicion del mismo
    // sensor con exactamente la misma fecha y hora.
    //
    // El bloqueo del dispositivo ayuda a serializar
    // las solicitudes que utilizan este dispositivo.

    for (_, _, sensor_id, _, _) in &sensores {

        let existe: bool = sqlx::query_scalar(
            "SELECT EXISTS (
                SELECT 1
                FROM mediciones
                WHERE sensor_id = $1
                  AND medido_en = $2
            )",
        )
        .bind(*sensor_id)
        .bind(medido_en)
        .fetch_one(&mut *tx)
        .await?;

        if existe {
            return Err(ApiError::BadRequest(format!(
                "Ya existe una medicion \
                 para este sensor en {medido_en}"
            )));
        }
    }

    // --------------------------------------------------------
    // 4.10 CONSULTAR TEMPERATURA ANTERIOR
    // --------------------------------------------------------

    let sensor_temperatura_id = sensores
        .iter()
        .find(|(tipo, _, _, _, _)| {
            *tipo == "temperatura"
        })
        .map(|(_, _, sensor_id, _, _)| *sensor_id)
        .ok_or_else(|| {
            ApiError::BadRequest(
                "No se encontro el sensor de temperatura".into(),
            )
        })?;

    // ========================================================
    // CORRECCION DE VARIACION TERMICA
    // ========================================================
    //
    // Buscar solamente temperaturas:
    //
    // 1. Del mismo sensor.
    // 2. De la misma aula.
    // 3. Anteriores a la medicion actual.
    // 4. Con una antiguedad maxima de 15 minutos.
    //
    // Si no existe una medicion anterior dentro
    // de ese intervalo, se retorna None.
    //
    // Esto evita comparar temperaturas de
    // jornadas separadas por varios dias.
    // ========================================================

    let temperatura_anterior:
        Option<(f64, DateTime<Utc>)> = sqlx::query_as(
            "SELECT valor, medido_en
             FROM mediciones
             WHERE sensor_id = $1
               AND medido_en < $2
               AND medido_en >=
                   $2 - INTERVAL '15 minutes'
               AND aula_id = $3
             ORDER BY medido_en DESC, id DESC
             LIMIT 1",
        )
        .bind(sensor_temperatura_id)
        .bind(medido_en)
        .bind(aula_id)
        .fetch_optional(&mut *tx)
        .await?;

    // --------------------------------------------------------
    // 4.11 GUARDAR MEDICIONES Y GENERAR ALERTAS
    // --------------------------------------------------------

    for (
        tipo,
        valor,
        sensor_id,
        tipo_sensor_id,
        unidad,
    ) in &sensores {

        // Guardar la medicion con su fecha y aula.

        let medicion_id: Uuid = sqlx::query_scalar(
            "INSERT INTO mediciones (
                sensor_id,
                valor,
                medido_en,
                aula_id
             )
             VALUES ($1, $2, $3, $4)
             RETURNING id",
        )
        .bind(*sensor_id)
        .bind(*valor)
        .bind(medido_en)
        .bind(aula_id)
        .fetch_one(&mut *tx)
        .await?;

        valores.insert(tipo.to_string(), *valor);

        // Identificar las mediciones de
        // temperatura y humedad relativa.

        match *tipo {
            "temperatura" => {
                medicion_temperatura_id =
                    Some(medicion_id);
            }

            "humedad" => {
                medicion_humedad_id =
                    Some(medicion_id);
            }

            _ => {}
        }

        // ----------------------------------------------------
        // CONSULTAR RANGO ACTIVO
        // ----------------------------------------------------

        let rango: Option<(Uuid, f64, f64)> =
            sqlx::query_as(
                "SELECT
                    id,
                    valor_minimo,
                    valor_maximo
                 FROM rangos_sensor
                 WHERE aula_id = $1
                   AND tipo_sensor_id = $2
                   AND activo = TRUE",
            )
            .bind(aula_id)
            .bind(*tipo_sensor_id)
            .fetch_optional(&mut *tx)
            .await?;

        let Some((rango_id, minimo, maximo)) = rango
        else {
            continue;
        };

        // Ignorar rangos invalidos.

        if !minimo.is_finite()
            || !maximo.is_finite()
            || minimo > maximo
        {
            continue;
        }

        // ----------------------------------------------------
        // EVALUAR DESVIACION
        // ----------------------------------------------------

        let desviacion = if *valor < minimo {
            Some((
                "por_debajo",
                "por debajo del minimo",
                minimo,
            ))
        } else if *valor > maximo {
            Some((
                "por_encima",
                "por encima del maximo",
                maximo,
            ))
        } else {
            None
        };

        let Some((
            tipo_alerta,
            descripcion,
            limite,
        )) = desviacion
        else {
            continue;
        };

        let mensaje = format!(
            "{tipo}: {valor:.1} {unidad}, \
             {descripcion} permitido \
             ({limite:.1} {unidad})"
        );

        // ----------------------------------------------------
        // GUARDAR ALERTA
        // CORRECCION: CONSERVAR LIMITES HISTORICOS
        // ----------------------------------------------------

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

        alertas.push(AlertaGenerada {
            tipo_sensor: tipo.to_string(),
            unidad: unidad.clone(),
            tipo: tipo_alerta.to_string(),
            valor: *valor,
            valor_minimo: minimo,
            valor_maximo: maximo,
            mensaje,
            nueva: insertadas > 0,
        });
    }

    // --------------------------------------------------------
    // 4.12 VERIFICAR MEDICIONES GUARDADAS
    // --------------------------------------------------------

    let temperatura_id =
        medicion_temperatura_id.ok_or_else(|| {
            ApiError::BadRequest(
                "No se guardo la temperatura".into(),
            )
        })?;

    let humedad_id =
        medicion_humedad_id.ok_or_else(|| {
            ApiError::BadRequest(
                "No se guardo la humedad relativa".into(),
            )
        })?;

    // --------------------------------------------------------
    // 4.13 CALCULAR VARIACION TERMICA
    // --------------------------------------------------------

    // Formula:
    //
    // Variacion = (T_actual - T_anterior)
    //             / tiempo_transcurrido_minutos
    //
    // Si no existe una temperatura anterior valida,
    // la variacion queda como None (NULL en PostgreSQL).

    let variacion_termica_c_min =
        temperatura_anterior.and_then(
            |(valor_anterior, fecha_anterior)| {

                let segundos = medido_en
                    .signed_duration_since(fecha_anterior)
                    .num_milliseconds() as f64
                    / 1000.0;

                calcular_variacion_termica(
                    datos.temperatura,
                    valor_anterior,
                    segundos,
                )
            },
        );

    // --------------------------------------------------------
    // 4.14 GUARDAR INDICE DE CONFORT
    // --------------------------------------------------------

    sqlx::query(
        "INSERT INTO indices_confort (
            aula_id,
            valor
         )
         VALUES ($1, $2)",
    )
    .bind(aula_id)
    .bind(confort)
    .execute(&mut *tx)
    .await?;

    // --------------------------------------------------------
    // 4.15 GUARDAR RESULTADOS TERMODINAMICOS
    // --------------------------------------------------------

    sqlx::query(
        "INSERT INTO resultados_termodinamicos (
            aula_id,
            medicion_temperatura_id,
            medicion_humedad_id,
            punto_rocio_c,
            humedad_absoluta_g_m3,
            presion_vapor_kpa,
            variacion_termica_c_min
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(aula_id)
    .bind(temperatura_id)
    .bind(humedad_id)
    .bind(resultado_termodinamico.punto_rocio_c)
    .bind(resultado_termodinamico.humedad_absoluta_g_m3)
    .bind(resultado_termodinamico.presion_vapor_kpa)
    .bind(variacion_termica_c_min)
    .execute(&mut *tx)
    .await?;

    // --------------------------------------------------------
    // 4.16 ACTUALIZAR ULTIMA CONEXION
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
    // 4.17 CONFIRMAR TRANSACCION
    // --------------------------------------------------------

    tx.commit().await?;

    // --------------------------------------------------------
    // 4.18 PREPARAR RESPUESTA
    // --------------------------------------------------------

    let estado = if alertas.is_empty() {
        "NORMAL"
    } else {
        "ALERTA"
    };

    Ok(ResultadoIngesta {
        aula_id,
        aula_codigo,
        dispositivo: identificador,
        medido_en,
        valores,
        omitidas: Vec::new(),
        alertas,
        confort: Some(confort),
        estado_confort: Some(estado_confort),
        termodinamica: Some(
            TermodinamicaCalculada {
                punto_rocio_c:
                    resultado_termodinamico.punto_rocio_c,

                humedad_absoluta_g_m3:
                    resultado_termodinamico
                        .humedad_absoluta_g_m3,

                presion_vapor_kpa:
                    resultado_termodinamico
                        .presion_vapor_kpa,

                variacion_termica_c_min,
            },
        ),
        estado,
    })
}

// ============================================================
// 5. PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn crear_datos(
        temperatura: f64,
        humedad: f64,
    ) -> NuevaMedicion {
        NuevaMedicion {
            dispositivo_id: "esp32-a101".to_string(),
            temperatura,
            humedad,
            medido_en: None,
            aula_codigo: None,
        }
    }

    #[test]
    fn acepta_temperatura_y_humedad_validas() {
        let datos = crear_datos(28.6, 64.2);

        let resultado = validar_lecturas(&datos);

        assert!(resultado.is_ok());
        assert_eq!(resultado.unwrap().len(), 2);
    }

    #[test]
    fn rechaza_humedad_fuera_de_rango() {
        let datos = crear_datos(28.6, 120.0);

        assert!(
            validar_lecturas(&datos).is_err()
        );
    }

    #[test]
    fn rechaza_temperatura_no_finita() {
        let datos = crear_datos(f64::NAN, 50.0);

        assert!(
            validar_lecturas(&datos).is_err()
        );
    }

    #[test]
    fn rechaza_temperatura_fuera_de_rango() {
        let datos = crear_datos(100.0, 50.0);

        assert!(
            validar_lecturas(&datos).is_err()
        );
    }

    #[test]
    fn calcula_confort_para_lectura_valida() {
        let datos = crear_datos(26.0, 50.0);

        let ambientales = DatosAmbientales {
            temperatura: datos.temperatura,
            humedad: datos.humedad,
        };

        let resultado =
            calcular_indice_confort_porcentaje(
                &ambientales,
            )
            .unwrap();

        assert_eq!(resultado, 100.0);
    }

    #[test]
    fn calcula_resultado_termodinamico() {
        let datos = crear_datos(28.6, 64.2);

        let resultado = calcular(
            datos.temperatura,
            datos.humedad,
        )
        .unwrap();

        assert!(
            resultado.punto_rocio_c.is_finite()
        );

        assert!(
            resultado.humedad_absoluta_g_m3.is_finite()
        );

        assert!(
            resultado.presion_vapor_kpa.is_finite()
        );
    }

    #[test]
    fn calcula_variacion_termica_correctamente() {
        let variacion =
            calcular_variacion_termica(
                28.0,
                26.0,
                120.0,
            );

        assert_eq!(variacion, Some(1.0));
    }
}
