
 //! SMART CLASSROOM — Módulo de modelos
 //!
 //! Centraliza las entidades del sistema
 //! y permite utilizarlas desde otros módulos.

 // ============================================================
 // DECLARACIÓN DE MÓDULOS
 // ============================================================

 pub mod alerta;
 pub mod aula;
 pub mod dispositivo;
 pub mod indice_confort;
 pub mod medicion;
 pub mod rango_sensor;
 pub mod sensor;
 pub mod tipo_sensor;
 pub mod usuario;

 // ============================================================
 // REEXPORTACIÓN DE MODELOS UTILIZADOS
 // ============================================================

 pub use alerta::Alerta;
 pub use medicion::Medicion;
 pub use rango_sensor::RangoSensor;
