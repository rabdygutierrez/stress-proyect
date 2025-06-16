# Comando para acceder a la CLI

Abre tu terminal (PowerShell en Windows, o Bash en Linux/macOS) y ejecuta el siguiente comando. 
Asegúrate de reemplazar admin y adminpassword con las credenciales configuradas para tu instancia de InfluxDB si son diferentes.

# docker exec -it influxdb-k6 influx -username admin -password adminpassword

Una vez conectado, verás un prompt similar a este, indicando que estás en el shell de InfluxDB:

 - Connected to http://localhost:8086 version 1.8.10
    InfluxDB shell version: 1.8.10
    >

# Verificación de Bases de Datos

Una vez dentro de la CLI, puedes listar las bases de datos disponibles para confirmar que k6_metrics (la base de datos donde K6 envía sus datos) existe.

# Comando:
# SHOW DATABASES

# Salida esperada:
    - name: databases
    name
    ----
    k6_metrics
    _internal
>

# Inspección de Claves de Etiquetas (Tag Keys) de las Métricas de K6

Para asegurarte de que tus métricas de K6 están almacenando la información que necesitas (como la URL del endpoint), puedes verificar las claves de etiquetas asociadas a una medida específica, por ejemplo, http_req_duration.

# Comando:
# USE k6_metrics;

Luego, muestra las claves de etiquetas para la medida http_req_duration:

# Comando:
# SHOW TAG KEYS FROM "http_req_duration"

# Salida esperada:

 - name: http_req_duration
    tagKey
    ------
    error
    error_code
    expected_response
    method
    name
    proto
    scenario
    status
    tls_version
    >


# Comando para salir de la conexión:
# exit