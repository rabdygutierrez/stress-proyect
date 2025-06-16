# k6-full-docker-stack

# Comando para inicializar el proyecto:

  - docker compose up -d influxdb grafana

# Comando para ejecutar k6

 - docker compose run --rm k6 run -e TYPE_TEST=<tipo_de_prueba> -e ENV=DEV <ambiente> /directorio/<nombre-del-archivo.js>

# Ejemplo de uso práctico

 - docker compose run --rm k6 run -e TYPE_TEST=smokeTest-e ENV=DEV /k6/scripts/scenarios/testK6.js

 - docker compose run --rm k6 run -e TYPE_TEST=loadTest -e ENV=DEV /k6/scripts/scenarios/testK6.js

 - docker compose run --rm k6 run -e TYPE_TEST=stressTest -e ENV=DEV /k6/scripts/scenarios/testK6.js

 - docker compose run --rm k6 run -e TYPE_TEST=testK6 -e ENV=DEV  /k6/scripts/scenarios/testK6.js