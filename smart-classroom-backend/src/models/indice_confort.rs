//! SMART CLASSROOM — Modelo IndiceConfort
//!
//! Representa el índice de confort ambiental
//! calculado para un aula.
//!
//! Corresponde a la tabla `indices_confort`
//! definida en PostgreSQL.
//!
//! Los registros forman parte del historial:
//! únicamente se permite INSERT.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE ÍNDICE DE CONFORT
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct IndiceConfort {
    /// Identificador único del registro.
    pub id: Uuid,

    /// Identificador del aula evaluada.
    pub aula_id: Uuid,

    /// Índice de confort ambiental.
    ///
    /// PostgreSQL permite valores entre 0 y 100.
    pub valor: f64,

    /// Fecha y hora del cálculo.
    pub calculado_en: DateTime<Utc>,
}

// ============================================================
// VALIDACIONES
// ============================================================

impl IndiceConfort {
    /// Comprueba que el índice sea un número
    /// finito comprendido entre 0 y 100.
    pub fn valor_valido(valor: f64) -> bool {
        valor.is_finite() && (0.0..=100.0).contains(&valor)
    }

    /// Determina si el valor almacenado es válido.
    pub fn es_valido(&self) -> bool {
        Self::valor_valido(self.valor)
    }
}

// ============================================================
// PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::IndiceConfort;

    #[test]
    fn acepta_valores_dentro_del_rango() {
        assert!(IndiceConfort::valor_valido(0.0));
        assert!(IndiceConfort::valor_valido(75.5));
        assert!(IndiceConfort::valor_valido(100.0));
    }

    #[test]
    fn rechaza_valores_fuera_del_rango() {
        assert!(!IndiceConfort::valor_valido(-1.0));
        assert!(!IndiceConfort::valor_valido(100.1));
    }

    #[test]
    fn rechaza_valores_no_finitos() {
        assert!(!IndiceConfort::valor_valido(f64::NAN));
        assert!(!IndiceConfort::valor_valido(f64::INFINITY));
        assert!(!IndiceConfort::valor_valido(f64::NEG_INFINITY));
    }
}
