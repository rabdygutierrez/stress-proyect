import { sleep } from 'k6';
import { getK6Test } from '../services/k6TestService.js';
import { loadScenarioConfig } from '../common/configLoader.js'; 

const scenarioConfig = loadScenarioConfig();
export let options = scenarioConfig.options;
const { baseURL } = scenarioConfig.urls;
export function setup(){
    // Aquí puedes añadir cualquier configuración inicial que necesites
    // Por ejemplo, si necesitas autenticarte o preparar el entorno antes de las pruebas

    return{
        // Puedes devolver un objeto que se pasará a la función main
        // como el contexto de la prueba, si es necesario
    };  

}

export default function () {
  const res = getK6Test(baseURL);

  if (res.status !== 200) {
    console.log(`Request failed with status ${res.status}: ${res.body}`);
  }

  sleep(1);
}