
#include <Arduino.h>
#include <Wire.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <time.h>
#include <math.h>

// ============================================================
// SMART CLASSROOM - UNIVERSIDAD DE EL SALVADOR
// ESP32 + DHT22 + LCD I2C + BACKEND RUST + SUPABASE
// ============================================================
//
// FUNCIONES:
// 1. Leer temperatura y humedad relativa.
// 2. Mostrar lecturas en pantalla LCD 16x2.
// 3. Conectarse automaticamente al Wi-Fi.
// 4. Sincronizar fecha y hora de El Salvador.
// 5. Realizar mediciones cada minuto.
// 6. Seleccionar aula segun modo de operacion.
// 7. Enviar JSON mediante HTTP POST.
// 8. Conservar mediciones pendientes en RAM.
// 9. Reintentar envios fallidos.
// 10. Conservar fecha original cuando hay NTP.
//
// Los calculos termodinamicos y las alertas
// automaticas se realizan en el backend Rust.
//
// ============================================================
// 1. CONFIGURACION DEL SENSOR DHT22
// ============================================================

#define DHT_PIN 4
#define DHT_TIPO DHT22

// ============================================================
// 2. CONFIGURACION DE PANTALLA LCD I2C
// ============================================================

#define SDA_PIN 21
#define SCL_PIN 22

#define LCD_DIRECCION 0x27
#define LCD_COLUMNAS 16
#define LCD_FILAS 2

// ============================================================
// 3. CONFIGURACION WIFI
// ============================================================
//
// Wi-Fi original del proyecto.
// El ESP32 y la computadora deben estar
// conectados a la misma red local.
//
// ============================================================

const char* WIFI_SSID = "Redmi Note 14 Pro+ 5G";
const char* WIFI_PASSWORD = "qians5zi6";

// ============================================================
// 4. CONFIGURACION DEL BACKEND RUST
// ============================================================
//
// IP actual de Windows confirmada con ipconfig:
//
// 10.203.28.33
//
// IP del ESP32 observada anteriormente:
//
// 10.203.28.187
//
// ============================================================

const char* BACKEND_IP = "10.203.28.33";

const uint16_t BACKEND_PUERTO = 3000;

const char* API_URL =
    "http://10.203.28.33:3000/api/mediciones";

const char* DISPOSITIVO_ID = "esp32-a101";

// ============================================================
// 5. CONFIGURACION DE OPERACION
// ============================================================

// true  = enviar mediciones al backend.
// false = solo leer sensor y mostrar LCD.

const bool HABILITAR_ENVIO_HTTP = true;

// false = modo de pruebas cualquier dia.
// true  = modo oficial lunes y miercoles.

const bool EXIGIR_HORARIO_OFICIAL = true;

// Aula utilizada en modo de pruebas.

const char* AULA_PRUEBAS = "AULA-PRUEBAS";

// Aulas del modo oficial.

const char* AULA_LUNES = "AULA-2B";
const char* AULA_MIERCOLES = "AULA-A6";

// ============================================================
// 6. INTERVALOS DE FUNCIONAMIENTO
// ============================================================

// Bienvenida LCD durante 15 segundos.

const unsigned long TIEMPO_BIENVENIDA = 15000UL;

// Una medicion cada 60 segundos.

const unsigned long INTERVALO_MEDICION = 60000UL;

// Alternar temperatura y humedad cada 3 segundos.

const unsigned long INTERVALO_PANTALLA = 3000UL;

// Reintentar conexion Wi-Fi cada 10 segundos.

const unsigned long INTERVALO_WIFI = 10000UL;

// Reintentar HTTP cada 5 segundos.

const unsigned long INTERVALO_REINTENTO = 5000UL;

// ============================================================
// 7. HORA DE EL SALVADOR
// ============================================================

// El Salvador utiliza UTC-6 sin horario de verano.

const long GMT_OFFSET_SEGUNDOS = -6L * 3600L;

const int DAYLIGHT_OFFSET_SEGUNDOS = 0;

const char* NTP_SERVIDOR_1 = "pool.ntp.org";
const char* NTP_SERVIDOR_2 = "time.google.com";

// Considerar valido el reloj a partir de 2025.

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

// Identificador del ultimo minuto registrado.

time_t ultimoMinutoRegistrado = -1;

// ============================================================
// 10. COLA TEMPORAL DE MEDICIONES
// ============================================================
//
// Hasta 120 mediciones pendientes.
//
// Se almacenan en RAM.
//
// IMPORTANTE:
// Si se reinicia el ESP32, esta cola se pierde.
//
// ============================================================

const int CAPACIDAD_COLA = 120;

struct MedicionPendiente {

    float temperatura;
    float humedad;

    String aula;

    // Fecha UTC original.
    // Cero indica que no habia hora NTP valida.

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
// 12. CONVERTIR FECHA UTC A ISO 8601
// ============================================================
//
// Ejemplo:
//
// 2026-11-14T17:01:56Z
//
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
// 13. AGREGAR MEDICION A LA COLA
// ============================================================

bool agregarACola(
    float T,
    float HR,
    const String& aula,
    time_t fechaUTC
) {

    if (cantidadCola >= CAPACIDAD_COLA) {

        Serial.println();
        Serial.println(
            "ADVERTENCIA: Cola de mediciones llena."
        );

        Serial.println(
            "No se almacenara la nueva medicion."
        );

        return false;
    }

    int posicion =
        (inicioCola + cantidadCola) % CAPACIDAD_COLA;

    cola[posicion].temperatura = T;
    cola[posicion].humedad = HR;
    cola[posicion].aula = aula;
    cola[posicion].fechaUTC = fechaUTC;

    cantidadCola++;

    Serial.print("Medicion agregada a cola. Pendientes: ");
    Serial.println(cantidadCola);

    return true;
}

// ============================================================
// 14. ELIMINAR PRIMERA MEDICION CONFIRMADA
// ============================================================

void eliminarPrimeraMedicion() {

    if (cantidadCola == 0) {
        return;
    }

    cola[inicioCola].aula = "";
    cola[inicioCola].fechaUTC = 0;

    inicioCola =
        (inicioCola + 1) % CAPACIDAD_COLA;

    cantidadCola--;
}

// ============================================================
// 15. CONEXION WIFI
// ============================================================

void conectarWiFi() {

    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    Serial.println();
    Serial.println("==============================");
    Serial.println("CONEXION WIFI");
    Serial.println("==============================");

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

        Serial.println("WIFI: CONECTADO");

        Serial.print("IP ESP32: ");
        Serial.println(WiFi.localIP());

        Serial.print("Puerta de enlace: ");
        Serial.println(WiFi.gatewayIP());

        Serial.print("Senal: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

    } else {

        Serial.println(
            "WIFI: CONEXION FALLIDA"
        );
    }

    ultimoIntentoWiFi = millis();
}

// ============================================================
// 16. PROBAR CONEXION TCP AL BACKEND
// ============================================================

void probarConexionBackend() {

    Serial.println();
    Serial.println("==============================");
    Serial.println("PRUEBA TCP AL BACKEND RUST");
    Serial.println("==============================");

    if (WiFi.status() != WL_CONNECTED) {

        Serial.println("TCP: SIN WIFI");
        return;
    }

    Serial.print("IP BACKEND: ");
    Serial.println(BACKEND_IP);

    Serial.print("PUERTO: ");
    Serial.println(BACKEND_PUERTO);

    WiFiClient cliente;

    if (
        cliente.connect(
            BACKEND_IP,
            BACKEND_PUERTO,
            3000
        )
    ) {

        Serial.println(
            "TCP: CONEXION EXITOSA"
        );

        cliente.stop();

    } else {

        Serial.println(
            "TCP: CONEXION FALLIDA"
        );

        Serial.println(
            "Verificar IP, firewall y SERVER_HOST."
        );
    }
}

// ============================================================
// 17. SINCRONIZAR HORA NTP
// ============================================================

bool sincronizarHora() {

    if (WiFi.status() != WL_CONNECTED) {
        return false;
    }

    Serial.println();
    Serial.println(
        "Sincronizando hora de El Salvador..."
    );

    configTime(
        GMT_OFFSET_SEGUNDOS,
        DAYLIGHT_OFFSET_SEGUNDOS,
        NTP_SERVIDOR_1,
        NTP_SERVIDOR_2
    );

    struct tm fecha;

    if (!getLocalTime(&fecha, 5000)) {

        Serial.println(
            "ADVERTENCIA: NTP no disponible."
        );

        return false;
    }

    if (!relojValido()) {

        Serial.println(
            "ADVERTENCIA: Reloj sin fecha valida."
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
// 18. SELECCION AUTOMATICA DE AULA
// ============================================================
//
// Lunes     -> AULA-2B
// Miercoles -> AULA-A6
//
// ============================================================

String obtenerAulaActual() {

    if (!relojValido()) {
        return "";
    }

    struct tm fecha;

    if (!getLocalTime(&fecha, 100)) {
        return "";
    }

    // Lunes.

    if (fecha.tm_wday == 1) {
        return String(AULA_LUNES);
    }

    // Miercoles.

    if (fecha.tm_wday == 3) {
        return String(AULA_MIERCOLES);
    }

    return "";
}

// ============================================================
// 19. VERIFICAR HORARIO OFICIAL
// ============================================================
//
// Se permite:
//
// Lunes y miercoles.
//
// Desde las 09:00:00 hasta las 12:00:00.
//
// La lectura de las 12:00 esta incluida.
//
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
//
// Compatible con NuevaMedicion del backend Rust.
//
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

    // Conservar fecha original cuando existe NTP.

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
// 21. ENVIAR MEDICIONES AL BACKEND
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

        WiFiClient cliente;
        HTTPClient http;

        if (!http.begin(cliente, API_URL)) {

            Serial.println(
                "ERROR: No se pudo iniciar HTTP."
            );

            return;
        }

        http.setConnectTimeout(5000);
        http.setTimeout(15000);

        http.addHeader(
            "Content-Type",
            "application/json"
        );

        Serial.println();
        Serial.println("==============================");
        Serial.println("ENVIANDO AL BACKEND RUST");
        Serial.println("==============================");

        Serial.println(json);

        int codigo = http.POST(json);

        Serial.print("Codigo HTTP: ");
        Serial.println(codigo);

        // Aceptar 200 OK o 201 Created.
        //
        // No eliminar mediciones cuando
        // no exista confirmacion de exito.

        if (codigo == 200 || codigo == 201) {

            Serial.println(
                "EXITO: Medicion aceptada."
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

                if (codigo >= 400 && codigo < 500) {

                    Serial.println(
                        "ERROR DE VALIDACION O AUTORIZACION."
                    );

                    Serial.println(
                        "Revisar aula, dispositivo y JSON."
                    );
                }

            } else {

                Serial.print("Error de conexion HTTP: ");

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

    Serial.print("Mediciones pendientes: ");
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

        Serial.println();
        Serial.println(
            "ERROR: Lectura invalida del DHT22."
        );

        return;
    }

    temperatura = nuevaTemperatura;
    humedad = nuevaHumedad;

    medicionValida = true;

    Serial.println();
    Serial.println("==============================");
    Serial.println("SMART CLASSROOM - MEDICION");
    Serial.println("==============================");

    Serial.printf(
        "Temperatura: %.2f C\n",
        temperatura
    );

    Serial.printf(
        "Humedad relativa: %.2f %%\n",
        humedad
    );

    // Si HTTP esta desactivado, solamente
    // mostrar las lecturas localmente.

    if (!HABILITAR_ENVIO_HTTP) {
        return;
    }

    String aula;

    if (EXIGIR_HORARIO_OFICIAL) {

        if (!estaEnHorarioOficial()) {

            Serial.println(
                "Fuera del horario oficial."
            );

            return;
        }

        aula = obtenerAulaActual();

        if (aula.isEmpty()) {

            Serial.println(
                "ERROR: Aula no identificada."
            );

            return;
        }

    } else {

        // Modo de pruebas.

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

        Serial.print("Aula seleccionada: ");
        Serial.println(aula);

        if (fechaMedicion > 0) {

            Serial.print("Fecha UTC: ");

            Serial.println(
                fechaISO8601(fechaMedicion)
            );

        } else {

            Serial.println(
                "Sin NTP: backend asignara hora."
            );
        }
    }
}

// ============================================================
// 23. MEDICION SINCRONIZADA POR MINUTO
// ============================================================

void controlarMedicionPorMinuto() {

    struct tm fecha;

    // Sin NTP se utiliza millis().

    if (!relojValido() ||
        !getLocalTime(&fecha, 100)) {

        unsigned long ahora = millis();

        if (
            ahora - ultimaMedicion >=
            INTERVALO_MEDICION
        ) {

            ultimaMedicion = ahora;

            realizarMedicion();
        }

        return;
    }

    time_t tiempoActual = time(nullptr);

    time_t minutoActual = tiempoActual / 60;

    if (minutoActual == ultimoMinutoRegistrado) {
        return;
    }

    // Tomar una lectura al comienzo del minuto.
    // Se toleran los primeros dos segundos.

    if (fecha.tm_sec > 2) {
        return;
    }

    ultimoMinutoRegistrado = minutoActual;

    ultimaMedicion = millis();

    Serial.println();
    Serial.println("==============================");

    Serial.printf(
        "MEDICION PROGRAMADA: %02d:%02d:%02d\n",
        fecha.tm_hour,
        fecha.tm_min,
        fecha.tm_sec
    );

    Serial.println("==============================");

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

    while (texto.length() < LCD_COLUMNAS) {
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

    Serial.println();
    Serial.println(
        "BIENVENIDO A SMART CLASSROOM"
    );

    delay(TIEMPO_BIENVENIDA);
}

// ============================================================
// 26. ACTUALIZAR PANTALLA LCD
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
// 27. CONFIGURACION INICIAL
// ============================================================

void setup() {

    Serial.begin(115200);

    delay(500);

    // Iniciar I2C.

    Wire.begin(
        SDA_PIN,
        SCL_PIN
    );

    // Iniciar sensor DHT22.

    dht.begin();

    // Iniciar pantalla LCD.

    lcd.init();
    lcd.backlight();

    Serial.println();
    Serial.println("================================");
    Serial.println(" SMART CLASSROOM - UES");
    Serial.println(" Monitor ambiental IoT");
    Serial.println("================================");

    Serial.println("DHT22: GPIO 4");
    Serial.println("LCD SDA: GPIO 21");
    Serial.println("LCD SCL: GPIO 22");

    Serial.println(
        "MEDICION: CADA MINUTO"
    );

    Serial.print("BACKEND: ");
    Serial.println(API_URL);

    if (HABILITAR_ENVIO_HTTP) {

        Serial.println(
            "ENVIO HTTP: ACTIVADO"
        );

    } else {

        Serial.println(
            "ENVIO HTTP: DESACTIVADO"
        );
    }

    if (EXIGIR_HORARIO_OFICIAL) {

        Serial.println(
            "MODO: HORARIO OFICIAL"
        );

        Serial.println(
            "LUNES: AULA-2B"
        );

        Serial.println(
            "MIERCOLES: AULA-A6"
        );

    } else {

        Serial.println(
            "MODO: PRUEBAS"
        );

        Serial.print("AULA: ");
        Serial.println(AULA_PRUEBAS);
    }

    // Pantalla de bienvenida.

    mostrarBienvenida();

    // Conectar Wi-Fi.

    conectarWiFi();

    // Probar conexion al backend.

    probarConexionBackend();

    // Sincronizar reloj NTP.

    if (WiFi.status() == WL_CONNECTED) {

        sincronizarHora();
    }

    // Esperar al siguiente minuto.

    ultimaMedicion = millis();

    Serial.println();
    Serial.println(
        "Esperando el siguiente minuto..."
    );

    // Mostrar estado inicial en LCD.

    actualizarLCD();

    ultimaPantalla = millis();

    ultimoIntentoHTTP =
        millis() - INTERVALO_REINTENTO;
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

            probarConexionBackend();

            sincronizarHora();
        }
    }

    // --------------------------------------------------------
    // MEDICION CADA MINUTO
    // --------------------------------------------------------

    controlarMedicionPorMinuto();

    ahora = millis();

    // --------------------------------------------------------
    // ACTUALIZAR LCD CADA 3 SEGUNDOS
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
}
