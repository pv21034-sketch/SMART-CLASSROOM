-- ============================================================
-- SMART CLASSROOM — Esquema PostgreSQL (version consolidada)
-- ------------------------------------------------------------
-- * Llaves primarias UUID y relaciones mediante llaves foraneas.
-- * Historial de solo insercion en mediciones e indices_confort.
-- * Las alertas guardan el rango que se aplico al generarse.
-- * Este mismo archivo funciona como migracion de sqlx y como
--   script independiente (psql -f) sobre una base vacia.
-- * NO crea ningun usuario: ver el comentario final.
-- ============================================================

-- gen_random_uuid() es nativa desde PostgreSQL 13; la extension se
-- conserva por compatibilidad con versiones anteriores.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- FUNCION COMUN: bloquear modificaciones en tablas de historial
-- ============================================================

CREATE OR REPLACE FUNCTION fn_bloquear_modificacion()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es historial de solo insercion: % no permitido',
        TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USUARIOS
-- ============================================================

CREATE TABLE usuarios (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_usuario VARCHAR(100) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    rol            VARCHAR(30)  NOT NULL
        CHECK (rol IN ('administrador', 'estudiante', 'observador')),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso  TIMESTAMPTZ,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_usuario_nombre_no_vacio CHECK (BTRIM(nombre_usuario) <> '')
);

-- Unicidad sin distinguir mayusculas: "Admin" y "admin" son el mismo usuario.
CREATE UNIQUE INDEX uq_usuarios_nombre_usuario ON usuarios (LOWER(nombre_usuario));

-- ============================================================
-- AULAS
-- ============================================================

CREATE TABLE aulas (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo    VARCHAR(30)  NOT NULL UNIQUE,
    nombre    VARCHAR(100) NOT NULL,
    ubicacion VARCHAR(150),
    creado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_aula_codigo_no_vacio CHECK (BTRIM(codigo) <> ''),
    CONSTRAINT chk_aula_nombre_no_vacio CHECK (BTRIM(nombre) <> '')
);

-- ============================================================
-- DISPOSITIVOS (ESP32 instalados en un aula)
-- ============================================================

CREATE TABLE dispositivos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_id         UUID         NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    -- Identificador que el ESP32 envia en cada medicion (dispositivo_id).
    identificador   VARCHAR(100) NOT NULL UNIQUE,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'mantenimiento')),
    -- Ultimo envio recibido; permite detectar dispositivos desconectados.
    ultima_conexion TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_dispositivo_aula
        FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT,
    CONSTRAINT chk_dispositivo_identificador_no_vacio CHECK (BTRIM(identificador) <> '')
);

-- ============================================================
-- TIPOS DE SENSOR
-- ============================================================

CREATE TABLE tipos_sensor (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(50) NOT NULL UNIQUE,
    unidad      VARCHAR(20) NOT NULL,
    descripcion VARCHAR(255)
);

-- Catalogo base: los cuatro tipos que envia el ESP32.
INSERT INTO tipos_sensor (nombre, unidad, descripcion) VALUES
    ('temperatura', '°C',  'Temperatura ambiente del aula'),
    ('humedad',     '%',   'Humedad relativa del aire'),
    ('iluminacion', 'lux', 'Nivel de iluminacion del aula'),
    ('ruido',       'dB',  'Nivel de ruido ambiental')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- SENSORES
-- ============================================================

CREATE TABLE sensores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id UUID         NOT NULL,
    tipo_sensor_id UUID         NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    pin_gpio       SMALLINT,
    estado         VARCHAR(20)  NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'mantenimiento')),
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_sensor_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sensor_tipo
        FOREIGN KEY (tipo_sensor_id) REFERENCES tipos_sensor(id) ON DELETE RESTRICT,
    -- Los GPIO del ESP32 van de 0 a 39.
    CONSTRAINT chk_pin_gpio CHECK (pin_gpio IS NULL OR pin_gpio BETWEEN 0 AND 39),
    CONSTRAINT uq_sensor_nombre_dispositivo UNIQUE (dispositivo_id, nombre),
    -- Un dispositivo tiene un sensor por tipo: el JSON del ESP32 trae un valor por
    -- tipo (temperatura, humedad...) y asi cada valor corresponde a un solo sensor.
    CONSTRAINT uq_sensor_tipo_dispositivo UNIQUE (dispositivo_id, tipo_sensor_id)
);

-- ============================================================
-- MEDICIONES (historial: solo INSERT)
-- ============================================================

CREATE TABLE mediciones (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id UUID             NOT NULL,
    -- DOUBLE PRECISION en lugar de NUMERIC: es el tipo natural de una lectura de
    -- sensor y se mapea directo a f64 en Rust.
    valor     DOUBLE PRECISION NOT NULL,
    -- clock_timestamp() = instante real de la insercion (NOW() es el inicio
    -- de la transaccion), asi el orden cronologico es exacto.
    medido_en TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_medicion_sensor
        FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE RESTRICT,
    -- Rechaza NaN e infinitos (en PostgreSQL NaN se ordena por encima de Infinity).
    CONSTRAINT chk_medicion_valor_finito
        CHECK (valor > '-Infinity'::float8 AND valor < 'Infinity'::float8)
);

CREATE TRIGGER trg_mediciones_solo_insert
    BEFORE UPDATE OR DELETE ON mediciones
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

CREATE TRIGGER trg_mediciones_no_truncate
    BEFORE TRUNCATE ON mediciones
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- ============================================================
-- RANGOS POR AULA Y TIPO DE SENSOR
-- ============================================================

CREATE TABLE rangos_sensor (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_id        UUID             NOT NULL,
    tipo_sensor_id UUID             NOT NULL,
    valor_minimo   DOUBLE PRECISION NOT NULL,
    valor_maximo   DOUBLE PRECISION NOT NULL,
    activo         BOOLEAN          NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_rango_aula
        FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rango_tipo_sensor
        FOREIGN KEY (tipo_sensor_id) REFERENCES tipos_sensor(id) ON DELETE RESTRICT,
    CONSTRAINT chk_rango_valido CHECK (valor_minimo < valor_maximo),
    CONSTRAINT uq_rango_aula_tipo UNIQUE (aula_id, tipo_sensor_id)
);

-- ============================================================
-- ALERTAS
-- ============================================================

CREATE TABLE alertas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicion_id           UUID             NOT NULL,
    rango_sensor_id       UUID             NOT NULL,
    tipo                  VARCHAR(20)      NOT NULL
        CHECK (tipo IN ('por_debajo', 'por_encima')),
    mensaje               VARCHAR(255),
    estado                VARCHAR(20)      NOT NULL DEFAULT 'activa'
        CHECK (estado IN ('activa', 'revisada', 'resuelta')),
    -- Rango vigente cuando se genero la alerta (snapshot historico).
    -- Si despues se edita rangos_sensor, estas columnas no cambian.
    -- Las rellena el trigger trg_alerta_snapshot_rango si no se envian.
    valor_minimo_aplicado DOUBLE PRECISION NOT NULL,
    valor_maximo_aplicado DOUBLE PRECISION NOT NULL,
    generada_en           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    resuelta_en           TIMESTAMPTZ,
    CONSTRAINT fk_alerta_medicion
        FOREIGN KEY (medicion_id) REFERENCES mediciones(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alerta_rango
        FOREIGN KEY (rango_sensor_id) REFERENCES rangos_sensor(id) ON DELETE RESTRICT,
    CONSTRAINT uq_alerta_medicion_rango UNIQUE (medicion_id, rango_sensor_id),
    CONSTRAINT chk_alerta_rango_aplicado CHECK (valor_minimo_aplicado < valor_maximo_aplicado),
    -- Coherencia: solo las alertas resueltas tienen fecha de resolucion.
    CONSTRAINT chk_alerta_resolucion CHECK (
        (estado = 'resuelta' AND resuelta_en IS NOT NULL AND resuelta_en >= generada_en)
        OR (estado <> 'resuelta' AND resuelta_en IS NULL)
    )
);

-- Una sola alerta activa por rango y tipo: mientras la condicion persiste no se
-- genera una alerta nueva con cada medicion (el ESP32 envia datos cada pocos segundos).
-- En el backend usar: INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX uq_alerta_activa_rango_tipo
    ON alertas (rango_sensor_id, tipo)
    WHERE estado = 'activa';

-- Rellena el snapshot del rango automaticamente al insertar la alerta.
CREATE OR REPLACE FUNCTION fn_alerta_snapshot_rango()
RETURNS trigger AS $$
DECLARE
    v_minimo DOUBLE PRECISION;
    v_maximo DOUBLE PRECISION;
BEGIN
    IF NEW.valor_minimo_aplicado IS NULL
       OR NEW.valor_maximo_aplicado IS NULL THEN
        SELECT valor_minimo, valor_maximo
        INTO v_minimo, v_maximo
        FROM rangos_sensor
        WHERE id = NEW.rango_sensor_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'No existe el rango_sensor_id % para la alerta',
                NEW.rango_sensor_id;
        END IF;

        IF NEW.valor_minimo_aplicado IS NULL THEN
            NEW.valor_minimo_aplicado := v_minimo;
        END IF;
        IF NEW.valor_maximo_aplicado IS NULL THEN
            NEW.valor_maximo_aplicado := v_maximo;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_alerta_snapshot_rango
    BEFORE INSERT ON alertas
    FOR EACH ROW EXECUTE FUNCTION fn_alerta_snapshot_rango();

-- ============================================================
-- INDICE DE CONFORT (calculado por el backend; historial: solo INSERT)
-- ============================================================

CREATE TABLE indices_confort (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_id      UUID             NOT NULL,
    valor        DOUBLE PRECISION NOT NULL CHECK (valor >= 0 AND valor <= 100),
    calculado_en TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_confort_aula
        FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT
);

CREATE TRIGGER trg_confort_solo_insert
    BEFORE UPDATE OR DELETE ON indices_confort
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

CREATE TRIGGER trg_confort_no_truncate
    BEFORE TRUNCATE ON indices_confort
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- ============================================================
-- INDICES
-- (Las restricciones UNIQUE ya crean su propio indice, por eso no se repiten.)
-- ============================================================

CREATE INDEX idx_dispositivos_aula        ON dispositivos(aula_id);
CREATE INDEX idx_sensores_tipo            ON sensores(tipo_sensor_id);
CREATE INDEX idx_mediciones_sensor_fecha  ON mediciones(sensor_id, medido_en DESC);
CREATE INDEX idx_mediciones_fecha         ON mediciones(medido_en DESC);
CREATE INDEX idx_alertas_estado_fecha     ON alertas(estado, generada_en DESC);
CREATE INDEX idx_alertas_rango            ON alertas(rango_sensor_id);
CREATE INDEX idx_confort_aula_fecha       ON indices_confort(aula_id, calculado_en DESC);

-- ============================================================
-- VISTAS (para el dashboard y el historial)
-- ============================================================

CREATE VIEW vw_mediciones_detalle AS
SELECT
    m.id,
    m.sensor_id,
    s.dispositivo_id,
    d.aula_id,
    ts.nombre AS tipo_sensor,
    ts.unidad,
    m.valor,
    m.medido_en
FROM mediciones AS m
JOIN sensores     AS s  ON s.id  = m.sensor_id
JOIN dispositivos AS d  ON d.id  = s.dispositivo_id
JOIN tipos_sensor AS ts ON ts.id = s.tipo_sensor_id;

-- Muestra el rango historico (snapshot), no el rango actual editable.
CREATE VIEW vw_alertas_detalle AS
SELECT
    a.id,
    a.estado,
    a.tipo,
    a.mensaje,
    a.generada_en,
    a.resuelta_en,
    d.aula_id,
    au.codigo AS aula_codigo,
    s.dispositivo_id,
    m.sensor_id,
    ts.nombre AS tipo_sensor,
    ts.unidad,
    m.valor,
    a.valor_minimo_aplicado AS valor_minimo,
    a.valor_maximo_aplicado AS valor_maximo,
    m.medido_en
FROM alertas AS a
JOIN mediciones   AS m  ON m.id  = a.medicion_id
JOIN sensores     AS s  ON s.id  = m.sensor_id
JOIN dispositivos AS d  ON d.id  = s.dispositivo_id
JOIN aulas        AS au ON au.id = d.aula_id
JOIN tipos_sensor AS ts ON ts.id = s.tipo_sensor_id;

