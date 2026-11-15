
#include <Arduino.h>
#include <Wire.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <math.h>

// ============================================================
// SMART CLASSROOM - UNIVERSIDAD DE EL SALVADOR
// ESP32 + DHT22 + LCD I2C + RUST + RENDER + SUPABASE
//
// VERSION DE PRUEBAS
//
// - Lecturas cada 60 segundos
// - Envio cualquier dia y hora
// - Aula AULA-PRUEBAS
// - Conexion HTTPS a Render
// - Reintentos de envio
// - Cola de mediciones pendientes
// - Fecha y hora mediante NTP
// - Pantalla LCD 16x2
// ============================================================

// ============================================================
// 1. SENSOR DHT22
// ============================================================

#define DHT_PIN 4
#define DHT_TIPO DHT22

// ============================================================
// 2. PANTALLA LCD I2C
// ============================================================

#define SDA_PIN 21
#define SCL_PIN 22

#define LCD_DIRECCION 0x27
#define LCD_COLUMNAS 16
#define LCD_FILAS 2

// ============================================================
// 3. CONFIGURACION WIFI ORIGINAL
// ============================================================

// Se conserva el nombre de tu red Wi-Fi.
// Coloca la misma contraseña de tu codigo original
// en la constante WIFI_PASSWORD.

const char* WIFI_SSID = "Redmi Note 14 Pro+ 5G";
const char* WIFI_PASSWORD = "qians5zi6";

// ============================================================
// 4. BACKEND RUST EN RENDER
// ============================================================

const char* API_URL =
    "https://smart-classroom-hitb.onrender.com/api/mediciones";

const char* DISPOSITIVO_ID = "esp32-a101";

// ============================================================
// 5. MODO DE OPERACION
// ============================================================

// Activar envio HTTP.
const bool HABILITAR_ENVIO_HTTP = true;

// false = pruebas cualquier dia y hora.
// true  = lunes y miercoles de 9:00 a 12:00.
const bool EXIGIR_HORARIO_OFICIAL = false;

// Aula para pruebas.
const char* AULA_PRUEBAS = "AULA-PRUEBAS";

// Aulas oficiales.
const char* AULA_LUNES = "AULA-2B";
const char* AULA_MIERCOLES = "AULA-A6";

// ============================================================
// 6. INTERVALOS
// ============================================================

const unsigned long TIEMPO_BIENVENIDA = 3000UL;

const unsigned long INTERVALO_MEDICION = 60000UL;

const unsigned long INTERVALO_PANTALLA = 3000UL;

const unsigned long INTERVALO_WIFI = 10000UL;

const unsigned long INTERVALO_REINTENTO = 5000UL;

// ============================================================
// 7. FECHA Y HORA
// ============================================================

const long GMT_OFFSET_SEGUNDOS = -6L * 3600L;

const int DAYLIGHT_OFFSET_SEGUNDOS = 0;

const char* NTP_SERVIDOR_1 = "pool.ntp.org";
const char* NTP_SERVIDOR_2 = "time.google.com";

const time_t TIEMPO_MINIMO_VALIDO = 1735689600;

// ============================================================
// 8. COMPONENTES
// ============================================================

DHT dht(DHT_PIN, DHT_TIPO);

LiquidCrystal_I2C lcd(
    LCD_DIRECCION,
    LCD_COLUMNAS,
    LCD_FILAS
);

// ============================================================
// 9. VARIABLES GENERALES
// ============================================================

float temperatura = NAN;
float humedad = NAN;

bool medicionValida = false;

unsigned long ultimaMedicion = 0;
unsigned long ultimaPantalla = 0;
unsigned long ultimoIntentoWiFi = 0;
unsigned long ultimoIntentoHTTP = 0;

int pantallaActual = 0;

time_t ultimoMinutoRegistrado = -1;

// ============================================================
// 10. COLA DE MEDICIONES
// ============================================================

// Hasta 120 mediciones pendientes en RAM.
// Si se reinicia el ESP32, se pierde la cola.

const int CAPACIDAD_COLA = 120;

struct MedicionPendiente {

    float temperatura;
    float humedad;

    String aula;

    time_t fechaUTC;
};

MedicionPendiente cola[CAPACIDAD_COLA];

int inicioCola = 0;
int cantidadCola = 0;

// ============================================================
// 11. VERIFICAR RELOJ
// ============================================================

bool relojValido() {

    time_t ahora = time(nullptr);

    return ahora >= TIEMPO_MINIMO_VALIDO;
}

// ============================================================
// 12. CONVERTIR FECHA A ISO 8601
// ============================================================

String fechaISO8601(time_t fechaUTC) {

    if (fechaUTC < TIEMPO_MINIMO_VALIDO) {
        return "";
    }

    struct tm fecha;

    if (gmtime_r(&fechaUTC, &fecha) == nullptr) {
        return "";
    }

    char buffer[32];

    strftime(
        buffer,
        sizeof(buffer),
        "%Y-%m-%dT%H:%M:%SZ",
        &fecha
    );

    return String(buffer);
}

// ============================================================
// 13. AGREGAR MEDICION A COLA
// ============================================================

bool agregarACola(
    float T,
    float HR,
    const String& aula,
    time_t fechaUTC
) {

    if (cantidadCola >= CAPACIDAD_COLA) {

        Serial.println(
            "ADVERTENCIA: Cola llena."
        );

        return false;
    }

    int posicion =
        (inicioCola + cantidadCola) %
        CAPACIDAD_COLA;

    cola[posicion].temperatura = T;
    cola[posicion].humedad = HR;
    cola[posicion].aula = aula;
    cola[posicion].fechaUTC = fechaUTC;

    cantidadCola++;

    Serial.print("Pendientes: ");
    Serial.println(cantidadCola);

    return true;
}

// ============================================================
// 14. ELIMINAR MEDICION CONFIRMADA
// ============================================================

void eliminarPrimeraMedicion() {

    if (cantidadCola == 0) {
        return;
    }

    cola[inicioCola].aula = "";
    cola[inicioCola].fechaUTC = 0;

    inicioCola =
        (inicioCola + 1) %
        CAPACIDAD_COLA;

    cantidadCola--;
}

// ============================================================
// 15. CONECTAR WIFI
// ============================================================

void conectarWiFi() {

    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    Serial.println();
    Serial.println("==========================");
    Serial.println("CONECTANDO WIFI");
    Serial.println("==========================");

    Serial.print("Red: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );

    unsigned long inicio = millis();

    while (
        WiFi.status() != WL_CONNECTED &&
        millis() - inicio < 15000UL
    ) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {

        Serial.println("WIFI CONECTADO");

        Serial.print("IP ESP32: ");
        Serial.println(WiFi.localIP());

        Serial.print("Senal: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

    } else {

        Serial.println("ERROR WIFI");
    }

    ultimoIntentoWiFi = millis();
}

// ============================================================
// 16. PROBAR CONEXION AL BACKEND RENDER
// ============================================================

void probarConexionBackend() {

    if (WiFi.status() != WL_CONNECTED) {

        Serial.println(
            "Sin WiFi: no se puede probar Render."
        );

        return;
    }

    Serial.println();
    Serial.println("==========================");
    Serial.println("PRUEBA HTTPS RENDER");
    Serial.println("==========================");

    WiFiClientSecure cliente;

    // SOLO PARA PRUEBAS.
    // No valida el certificado del servidor.
    cliente.setInsecure();

    HTTPClient http;

    if (!http.begin(cliente, API_URL)) {

        Serial.println(
            "No se pudo iniciar HTTPS."
        );

        return;
    }

    http.setConnectTimeout(8000);
    http.setTimeout(20000);

    // GET sobre una ruta que normalmente acepta POST.
    // 405 significa que el servidor respondio
    // pero no acepta este metodo.
    int codigo = http.GET();

    Serial.print("Respuesta HTTP: ");
    Serial.println(codigo);

    if (codigo > 0) {

        Serial.println(
            "Servidor HTTPS accesible."
        );

        Serial.println(http.getString());

    } else {

        Serial.println(
            http.errorToString(codigo)
        );
    }

    http.end();
}

// ============================================================
// 17. SINCRONIZAR HORA NTP
// ============================================================

bool sincronizarHora() {

    if (WiFi.status() != WL_CONNECTED) {
        return false;
    }

    Serial.println("Sincronizando NTP...");

    configTime(
        GMT_OFFSET_SEGUNDOS,
        DAYLIGHT_OFFSET_SEGUNDOS,
        NTP_SERVIDOR_1,
        NTP_SERVIDOR_2
    );

    struct tm fecha;

    if (!getLocalTime(&fecha, 5000)) {

        Serial.println(
            "NTP no disponible."
        );

        return false;
    }

    if (!relojValido()) {

        Serial.println(
            "Fecha NTP invalida."
        );

        return false;
    }

    Serial.printf(
        "Fecha: %04d-%02d-%02d\n",
        fecha.tm_year + 1900,
        fecha.tm_mon + 1,
        fecha.tm_mday
    );

    Serial.printf(
        "Hora: %02d:%02d:%02d\n",
        fecha.tm_hour,
        fecha.tm_min,
        fecha.tm_sec
    );

    return true;
}

// ============================================================
// 18. OBTENER AULA ACTUAL
// ============================================================

String obtenerAulaActual() {

    if (!relojValido()) {
        return "";
    }

    struct tm fecha;

    if (!getLocalTime(&fecha, 100)) {
        return "";
    }

    if (fecha.tm_wday == 1) {
        return String(AULA_LUNES);
    }

    if (fecha.tm_wday == 3) {
        return String(AULA_MIERCOLES);
    }

    return "";
}

// ============================================================
// 19. VERIFICAR HORARIO OFICIAL
// ============================================================

bool estaEnHorarioOficial() {

    if (!relojValido()) {
        return false;
    }

    struct tm fecha;

    if (!getLocalTime(&fecha, 100)) {
        return false;
    }

    bool diaPermitido =
        fecha.tm_wday == 1 ||
        fecha.tm_wday == 3;

    bool horaPermitida =
        (
            fecha.tm_hour >= 9 &&
            fecha.tm_hour < 12
        ) ||
        (
            fecha.tm_hour == 12 &&
            fecha.tm_min == 0
        );

    return diaPermitido && horaPermitida;
}

// ============================================================
// 20. CONSTRUIR JSON
// ============================================================

String construirJSON(
    const MedicionPendiente& medicion
) {

    String json = "{";

    json += "\"dispositivo_id\":\"";
    json += DISPOSITIVO_ID;
    json += "\",";

    json += "\"aula_codigo\":\"";
    json += medicion.aula;
    json += "\",";

    json += "\"temperatura\":";
    json += String(medicion.temperatura, 2);
    json += ",";

    json += "\"humedad\":";
    json += String(medicion.humedad, 2);

    String fecha = fechaISO8601(
        medicion.fechaUTC
    );

    if (!fecha.isEmpty()) {

        json += ",";
        json += "\"medido_en\":\"";
        json += fecha;
        json += "\"";
    }

    json += "}";

    return json;
}

// ============================================================
// 21. ENVIAR MEDICIONES A RENDER
// ============================================================

void enviarMedicionesPendientes() {

    if (!HABILITAR_ENVIO_HTTP) {
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (cantidadCola == 0) {
        return;
    }

    const int MAX_ENVIOS_POR_CICLO = 3;

    int enviados = 0;

    while (
        cantidadCola > 0 &&
        enviados < MAX_ENVIOS_POR_CICLO
    ) {

        MedicionPendiente& medicion =
            cola[inicioCola];

        String json = construirJSON(medicion);

        WiFiClientSecure cliente;

        // SOLO PARA PRUEBAS HTTPS.
        cliente.setInsecure();

        HTTPClient http;

        if (!http.begin(cliente, API_URL)) {

            Serial.println(
                "ERROR: No se pudo iniciar HTTPS."
            );

            return;
        }

        http.setConnectTimeout(8000);
        http.setTimeout(20000);

        http.addHeader(
            "Content-Type",
            "application/json"
        );

        Serial.println();
        Serial.println("==========================");
        Serial.println("ENVIANDO A RENDER");
        Serial.println("==========================");

        Serial.println(json);

        int codigo = http.POST(json);

        Serial.print("Codigo HTTP: ");
        Serial.println(codigo);

        if (codigo == 200 || codigo == 201) {

            Serial.println(
                "EXITO: Backend acepto medicion."
            );

            String respuesta = http.getString();

            Serial.println(
                "Respuesta del backend:"
            );

            Serial.println(respuesta);

            eliminarPrimeraMedicion();

            enviados++;

        } else {

            if (codigo > 0) {

                Serial.println(
                    "Respuesta del backend:"
                );

                Serial.println(
                    http.getString()
                );

                if (
                    codigo >= 400 &&
                    codigo < 500
                ) {

                    Serial.println(
                        "ERROR DE VALIDACION."
                    );

                    Serial.println(
                        "Revisar dispositivo, aula y JSON."
                    );
                }

            } else {

                Serial.print(
                    "Error de conexion: "
                );

                Serial.println(
                    http.errorToString(codigo)
                );
            }

            Serial.println(
                "Medicion conservada en cola."
            );

            http.end();

            return;
        }

        http.end();
    }

    Serial.print("Pendientes: ");
    Serial.println(cantidadCola);
}

// ============================================================
// 22. LEER TEMPERATURA Y HUMEDAD
// ============================================================

void realizarMedicion() {

    float nuevaTemperatura =
        dht.readTemperature();

    float nuevaHumedad =
        dht.readHumidity();

    if (
        !isfinite(nuevaTemperatura) ||
        !isfinite(nuevaHumedad) ||
        nuevaTemperatura < -40.0f ||
        nuevaTemperatura > 80.0f ||
        nuevaHumedad < 0.0f ||
        nuevaHumedad > 100.0f
    ) {

        medicionValida = false;

        Serial.println(
            "ERROR: Lectura invalida del DHT22."
        );

        return;
    }

    temperatura = nuevaTemperatura;
    humedad = nuevaHumedad;

    medicionValida = true;

    Serial.println();
    Serial.println("==========================");
    Serial.println("SMART CLASSROOM");
    Serial.println("==========================");

    Serial.printf(
        "Temperatura: %.2f C\n",
        temperatura
    );

    Serial.printf(
        "Humedad: %.2f %%\n",
        humedad
    );

    if (!HABILITAR_ENVIO_HTTP) {
        return;
    }

    String aula;

    if (EXIGIR_HORARIO_OFICIAL) {

        if (!estaEnHorarioOficial()) {

            Serial.println(
                "Fuera de horario oficial."
            );

            return;
        }

        aula = obtenerAulaActual();

        if (aula.isEmpty()) {

            Serial.println(
                "No se identifico el aula."
            );

            return;
        }

    } else {

        aula = String(AULA_PRUEBAS);
    }

    time_t fechaMedicion = 0;

    if (relojValido()) {
        fechaMedicion = time(nullptr);
    }

    if (agregarACola(
        temperatura,
        humedad,
        aula,
        fechaMedicion
    )) {

        Serial.print("Aula: ");
        Serial.println(aula);

        if (fechaMedicion > 0) {

            Serial.print("Fecha UTC: ");

            Serial.println(
                fechaISO8601(fechaMedicion)
            );

        } else {

            Serial.println(
                "Sin NTP: backend asignara fecha."
            );
        }
    }
}

// ============================================================
// 23. CONTROLAR MEDICION CADA MINUTO
// ============================================================

void controlarMedicionPorMinuto() {

    unsigned long ahora = millis();

    // Si no hay reloj NTP, utilizar millis().
    if (!relojValido()) {

        if (
            ahora - ultimaMedicion >=
            INTERVALO_MEDICION
        ) {

            ultimaMedicion = ahora;

            realizarMedicion();
        }

        return;
    }

    struct tm fecha;

    if (!getLocalTime(&fecha, 100)) {
        return;
    }

    time_t tiempoActual = time(nullptr);

    time_t minutoActual =
        tiempoActual / 60;

    // Evitar dos mediciones en el mismo minuto.
    if (
        minutoActual ==
        ultimoMinutoRegistrado
    ) {
        return;
    }

    // Medir una vez por minuto, sin depender
    // exclusivamente de los primeros 3 segundos.
    // Esto evita perder lecturas si Render tarda.
    if (
        ahora - ultimaMedicion <
        INTERVALO_MEDICION
    ) {
        return;
    }

    ultimoMinutoRegistrado = minutoActual;

    ultimaMedicion = ahora;

    Serial.printf(
        "MEDICION: %02d:%02d:%02d\n",
        fecha.tm_hour,
        fecha.tm_min,
        fecha.tm_sec
    );

    realizarMedicion();
}

// ============================================================
// 24. ESCRIBIR LINEA LCD
// ============================================================

void escribirLineaLCD(
    int fila,
    const String& contenido
) {

    String texto = contenido;

    if (texto.length() > LCD_COLUMNAS) {

        texto = texto.substring(
            0,
            LCD_COLUMNAS
        );
    }

    while (
        texto.length() < LCD_COLUMNAS
    ) {
        texto += " ";
    }

    lcd.setCursor(0, fila);
    lcd.print(texto);
}

// ============================================================
// 25. PANTALLA DE BIENVENIDA
// ============================================================

void mostrarBienvenida() {

    lcd.clear();

    escribirLineaLCD(
        0,
        "BIENVENIDO A"
    );

    escribirLineaLCD(
        1,
        "SMART CLASSROOM"
    );

    Serial.println(
        "BIENVENIDO A SMART CLASSROOM"
    );

    delay(TIEMPO_BIENVENIDA);
}

// ============================================================
// 26. ACTUALIZAR LCD
// ============================================================

void actualizarLCD() {

    escribirLineaLCD(
        0,
        "SMART CLASSROOM"
    );

    if (!medicionValida) {

        escribirLineaLCD(
            1,
            "Revisar DHT22"
        );

        return;
    }

    if (pantallaActual == 0) {

        String texto =
            "Temp: " +
            String(temperatura, 1) +
            " C";

        escribirLineaLCD(
            1,
            texto
        );

    } else {

        String texto =
            "Hum: " +
            String(humedad, 1) +
            " %";

        escribirLineaLCD(
            1,
            texto
        );
    }

    pantallaActual =
        (pantallaActual + 1) % 2;
}

// ============================================================
// 27. SETUP
// ============================================================

void setup() {

    Serial.begin(115200);

    delay(500);

    Wire.begin(
        SDA_PIN,
        SCL_PIN
    );

    dht.begin();

    lcd.init();
    lcd.backlight();

    Serial.println();
    Serial.println("==========================");
    Serial.println(" SMART CLASSROOM - UES");
    Serial.println(" MODO PRUEBAS RENDER");
    Serial.println("==========================");

    Serial.println("DHT22: GPIO 4");
    Serial.println("LCD SDA: GPIO 21");
    Serial.println("LCD SCL: GPIO 22");

    Serial.print("BACKEND: ");
    Serial.println(API_URL);

    Serial.print("AULA: ");
    Serial.println(AULA_PRUEBAS);

    Serial.println(
        "ENVIO HTTPS: ACTIVADO"
    );

    Serial.println(
        "HORARIO OFICIAL: DESACTIVADO"
    );

    mostrarBienvenida();

    conectarWiFi();

    if (WiFi.status() == WL_CONNECTED) {

        sincronizarHora();

        probarConexionBackend();
    }

    // Iniciar una medicion inmediatamente.
    // Asi no necesitas esperar un minuto
    // para comprobar el DHT22.
    ultimaMedicion = millis();

    realizarMedicion();

    if (relojValido()) {

        ultimoMinutoRegistrado =
            time(nullptr) / 60;
    }

    actualizarLCD();

    ultimaPantalla = millis();

    // Permitir el primer envio inmediatamente.
    ultimoIntentoHTTP =
        millis() - INTERVALO_REINTENTO;

    Serial.println();
    Serial.println(
        "Sistema iniciado correctamente."
    );
}

// ============================================================
// 28. LOOP PRINCIPAL
// ============================================================

void loop() {

    unsigned long ahora = millis();

    // --------------------------------------------------------
    // RECONEXION WIFI
    // --------------------------------------------------------

    if (
        WiFi.status() != WL_CONNECTED &&
        ahora - ultimoIntentoWiFi >=
        INTERVALO_WIFI
    ) {

        conectarWiFi();

        if (WiFi.status() == WL_CONNECTED) {

            sincronizarHora();

            probarConexionBackend();
        }
    }

    // --------------------------------------------------------
    // MEDICION CADA MINUTO
    // --------------------------------------------------------

    controlarMedicionPorMinuto();

    ahora = millis();

    // --------------------------------------------------------
    // ACTUALIZAR LCD
    // --------------------------------------------------------

    if (
        ahora - ultimaPantalla >=
        INTERVALO_PANTALLA
    ) {

        ultimaPantalla = ahora;

        actualizarLCD();
    }

    ahora = millis();

    // --------------------------------------------------------
    // ENVIAR MEDICIONES PENDIENTES
    // --------------------------------------------------------

    if (
        HABILITAR_ENVIO_HTTP &&
        cantidadCola > 0 &&
        ahora - ultimoIntentoHTTP >=
        INTERVALO_REINTENTO
    ) {

        ultimoIntentoHTTP = ahora;

        enviarMedicionesPendientes();
    }

    delay(10);
}
