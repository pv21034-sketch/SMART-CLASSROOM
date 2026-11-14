
//! SMART CLASSROOM
//! Calculos termodinamicos a partir de
//! temperatura y humedad relativa.
//!
//! Modelo:
//! - Presion de vapor mediante Magnus.
//! - Punto de rocio mediante Magnus.
//! - Humedad absoluta mediante gas ideal.
//!
//! Las magnitudes son estimaciones derivadas
//! de las mediciones del sensor DHT22.

#[derive(Debug, Clone, Copy)]
pub struct ResultadoTermodinamico {
    pub punto_rocio_c: f64,
    pub humedad_absoluta_g_m3: f64,
    pub presion_vapor_kpa: f64,
}

/// Calcula las propiedades del aire humedo.
///
/// temperatura: grados Celsius.
/// humedad_relativa: porcentaje de 0 a 100.
pub fn calcular(temperatura: f64, humedad_relativa: f64) -> Result<ResultadoTermodinamico, String> {
    if !temperatura.is_finite() || !(-40.0..=85.0).contains(&temperatura) {
        return Err("Temperatura fuera del rango valido".into());
    }

    if !humedad_relativa.is_finite() || !(0.0..=100.0).contains(&humedad_relativa) {
        return Err("Humedad relativa fuera del rango valido".into());
    }

    // Presion de saturacion (kPa).
    // Aproximacion de Magnus sobre agua liquida.
    let presion_saturacion = 0.61094 * ((17.625 * temperatura) / (temperatura + 243.04)).exp();

    // Presion parcial del vapor de agua (kPa).
    let presion_vapor = (humedad_relativa / 100.0) * presion_saturacion;

    // Punto de rocio (°C).
    // Para HR = 0, el punto de rocio no es finito.
    // Se rechaza ese caso en lugar de guardar
    // un valor fisicamente indefinido.
    if humedad_relativa == 0.0 {
        return Err("No se puede calcular un punto de rocio finito con HR = 0 %".into());
    }

    let gamma = (humedad_relativa / 100.0).ln() + (17.625 * temperatura) / (243.04 + temperatura);

    let punto_rocio = 243.04 * gamma / (17.625 - gamma);

    // Humedad absoluta (g/m3).
    // e expresada en hPa: e_kPa * 10.
    let humedad_absoluta = 216.7 * (presion_vapor * 10.0) / (temperatura + 273.15);

    if !punto_rocio.is_finite() || !humedad_absoluta.is_finite() || !presion_vapor.is_finite() {
        return Err("Resultado termodinamico no finito".into());
    }

    Ok(ResultadoTermodinamico {
        punto_rocio_c: punto_rocio,
        humedad_absoluta_g_m3: humedad_absoluta,
        presion_vapor_kpa: presion_vapor,
    })
}

/// Calcula la variacion de temperatura en °C/min.
///
/// Retorna None si no hay intervalo valido.
pub fn calcular_variacion_termica(
    temperatura_actual: f64,
    temperatura_anterior: f64,
    segundos_transcurridos: f64,
) -> Option<f64> {
    if !temperatura_actual.is_finite()
        || !temperatura_anterior.is_finite()
        || !segundos_transcurridos.is_finite()
        || segundos_transcurridos <= 0.0
    {
        return None;
    }

    let variacion = (temperatura_actual - temperatura_anterior) / (segundos_transcurridos / 60.0);

    variacion.is_finite().then_some(variacion)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calcula_propiedades_validas() {
        let r = calcular(26.0, 50.0).unwrap();

        assert!(r.punto_rocio_c > 14.0);
        assert!(r.punto_rocio_c < 16.0);

        assert!(r.humedad_absoluta_g_m3 > 11.0);
        assert!(r.humedad_absoluta_g_m3 < 13.0);

        assert!(r.presion_vapor_kpa > 1.6);
        assert!(r.presion_vapor_kpa < 1.8);
    }

    #[test]
    fn rechaza_humedad_invalida() {
        assert!(calcular(26.0, 120.0).is_err());
        assert!(calcular(26.0, 0.0).is_err());
    }

    #[test]
    fn calcula_variacion_correctamente() {
        let resultado = calcular_variacion_termica(28.0, 27.0, 120.0);

        assert_eq!(resultado, Some(0.5));
    }

    #[test]
    fn rechaza_intervalo_invalido() {
        assert_eq!(calcular_variacion_termica(28.0, 27.0, 0.0), None);
    }
}
