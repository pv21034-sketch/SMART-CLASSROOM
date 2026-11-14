-- SMART CLASSROOM - Migracion 002: adaptacion termodinamica
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor, despues de revisar el respaldo.
-- Conserva aulas, dispositivos, usuarios y sensores de temperatura/humedad.
-- Elimina TODOS los registros de prueba en mediciones e indices_confort.
-- Requiere que alertas y rangos_sensor esten vacios.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.alertas) THEN
    RAISE EXCEPTION 'Se detuvo la migracion: alertas no esta vacia';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rangos_sensor) THEN
    RAISE EXCEPTION 'Se detuvo la migracion: rangos_sensor no esta vacia';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tipos_sensor
    WHERE lower(nombre) NOT IN ('temperatura', 'humedad', 'iluminacion', 'ruido')
  ) THEN
    RAISE EXCEPTION 'Se detuvo la migracion: hay tipos de sensor adicionales; revisar manualmente';
  END IF;
  IF (SELECT count(*) FROM public.mediciones) <> 4
     OR (SELECT count(*) FROM public.indices_confort) <> 1 THEN
    RAISE EXCEPTION 'Se detuvo la migracion: los conteos de prueba cambiaron';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tipos_sensor
    WHERE lower(nombre) IN ('iluminacion','ruido')
    GROUP BY lower(nombre) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tipos duplicados: revisar antes de continuar';
  END IF;
END $$;

DELETE FROM public.mediciones;
DELETE FROM public.indices_confort;
DELETE FROM public.sensores
WHERE tipo_sensor_id IN (
  SELECT id FROM public.tipos_sensor WHERE lower(nombre) IN ('iluminacion', 'ruido')
);
DELETE FROM public.tipos_sensor WHERE lower(nombre) IN ('iluminacion', 'ruido');

-- Los resultados derivados corresponden a una pareja de lecturas de un mismo muestreo.
-- El backend debe verificar que ambas pertenecen al mismo dispositivo y aula.
CREATE TABLE IF NOT EXISTS public.resultados_termodinamicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id UUID NOT NULL REFERENCES public.aulas(id) ON DELETE RESTRICT,
  medicion_temperatura_id UUID NOT NULL REFERENCES public.mediciones(id) ON DELETE RESTRICT,
  medicion_humedad_id UUID NOT NULL REFERENCES public.mediciones(id) ON DELETE RESTRICT,
  punto_rocio_c DOUBLE PRECISION NOT NULL,
  humedad_absoluta_g_m3 DOUBLE PRECISION NOT NULL,
  presion_vapor_kpa DOUBLE PRECISION NOT NULL,
  variacion_termica_c_min DOUBLE PRECISION,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resultado_par UNIQUE (medicion_temperatura_id, medicion_humedad_id),
  CONSTRAINT chk_resultado_mediciones_distintas CHECK (medicion_temperatura_id <> medicion_humedad_id),
  CONSTRAINT chk_resultado_finitos CHECK (
    punto_rocio_c > '-Infinity'::float8 AND punto_rocio_c < 'Infinity'::float8 AND
    humedad_absoluta_g_m3 >= 0 AND humedad_absoluta_g_m3 < 'Infinity'::float8 AND
    presion_vapor_kpa >= 0 AND presion_vapor_kpa < 'Infinity'::float8 AND
    (variacion_termica_c_min IS NULL OR
      (variacion_termica_c_min > '-Infinity'::float8 AND variacion_termica_c_min < 'Infinity'::float8))
  )
);
CREATE INDEX IF NOT EXISTS idx_resultados_termo_aula_fecha
  ON public.resultados_termodinamicos(aula_id, calculado_en DESC);

COMMIT;

-- Verificacion (solo lectura):
SELECT 'mediciones' AS tabla, count(*) AS registros FROM public.mediciones
UNION ALL SELECT 'indices_confort', count(*) FROM public.indices_confort
UNION ALL SELECT 'sensores', count(*) FROM public.sensores
UNION ALL SELECT 'tipos_sensor', count(*) FROM public.tipos_sensor
UNION ALL SELECT 'resultados_termodinamicos', count(*) FROM public.resultados_termodinamicos;
