-- SMART CLASSROOM - Esquema PostgreSQL propuesto
-- Usa UUID como llave primaria y relaciones mediante llaves foraneas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_usuario VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(30) NOT NULL
        CHECK (rol IN ('administrador', 'estudiante', 'observador')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE aulas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    ubicacion VARCHAR(150),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispositivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_id UUID NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    identificador VARCHAR(100) NOT NULL UNIQUE,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'mantenimiento')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_dispositivo_aula
        FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT
);

CREATE TABLE tipos_sensor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(50) NOT NULL UNIQUE,
    unidad VARCHAR(20) NOT NULL,
    descripcion VARCHAR(255)
);

CREATE TABLE sensores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id UUID NOT NULL,
    tipo_sensor_id UUID NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    pin_gpio SMALLINT,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'mantenimiento')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_sensor_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sensor_tipo
        FOREIGN KEY (tipo_sensor_id) REFERENCES tipos_sensor(id) ON DELETE RESTRICT,
    CONSTRAINT chk_pin_gpio CHECK (pin_gpio IS NULL OR pin_gpio >= 0),
    CONSTRAINT uq_sensor_nombre_dispositivo UNIQUE (dispositivo_id, nombre)
);

CREATE TABLE mediciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id UUID NOT NULL,
    valor NUMERIC(12,4) NOT NULL,
    medido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_medicion_sensor
        FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE RESTRICT
);

CREATE TABLE rangos_sensor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_id UUID NOT NULL,
    tipo_sensor_id UUID NOT NULL,
    valor_minimo NUMERIC(12,4) NOT NULL,
    valor_maximo NUMERIC(12,4) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_rango_aula
        FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rango_tipo_sensor
        FOREIGN KEY (tipo_sensor_id) REFERENCES tipos_sensor(id) ON DELETE RESTRICT,
    CONSTRAINT chk_rango_valido CHECK (valor_minimo < valor_maximo),
    CONSTRAINT uq_rango_aula_tipo UNIQUE (aula_id, tipo_sensor_id)
);

CREATE TABLE alertas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicion_id UUID NOT NULL,
    rango_sensor_id UUID NOT NULL,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('por_debajo', 'por_encima')),
    mensaje VARCHAR(255),
    estado VARCHAR(20) NOT NULL DEFAULT 'activa'
        CHECK (estado IN ('activa', 'revisada', 'resuelta')),
    generada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resuelta_en TIMESTAMPTZ,
    CONSTRAINT fk_alerta_medicion
        FOREIGN KEY (medicion_id) REFERENCES mediciones(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alerta_rango
        FOREIGN KEY (rango_sensor_id) REFERENCES rangos_sensor(id) ON DELETE RESTRICT,
    CONSTRAINT uq_alerta_medicion_rango UNIQUE (medicion_id, rango_sensor_id)
);

-- Indices utiles para consultas historicas y dashboard
CREATE INDEX idx_dispositivos_aula ON dispositivos(aula_id);
CREATE INDEX idx_sensores_dispositivo ON sensores(dispositivo_id);
CREATE INDEX idx_sensores_tipo ON sensores(tipo_sensor_id);
CREATE INDEX idx_mediciones_sensor_fecha ON mediciones(sensor_id, medido_en DESC);
CREATE INDEX idx_rangos_aula_tipo ON rangos_sensor(aula_id, tipo_sensor_id);
CREATE INDEX idx_alertas_estado_fecha ON alertas(estado, generada_en DESC);