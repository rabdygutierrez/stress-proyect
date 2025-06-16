// k6\scripts\common\configLoader.js

import { testTypes } from '../../config/TestTypes.js';
import { environments } from '../../config/Environments.js'; 

/**
 * Carga y valida la configuración del tipo de prueba y del entorno,
 * incluyendo todas las URLs base para el ambiente seleccionado.
 * @returns {object} Un objeto que contiene:
 * - options: El objeto de opciones de K6 para el escenario.
 * - urls: Un objeto con todas las URLs base para el entorno (baseURL, privateBaseURL, apiBaseURL).
 */
export function loadScenarioConfig() {

    const TYPE_TEST = __ENV.TYPE_TEST || 'smokeTest';
    const scenarioOptions = testTypes[TYPE_TEST];
    if (!scenarioOptions) {
        throw new Error(`Test type '${TYPE_TEST}' not found in testTypes configuration.`);
    }

    const ENV = __ENV.ENV || 'DEV';
    const urls = {
        baseURL: environments.baseURL[ENV],
        privateBaseURL: environments.privateBaseURL[ENV],
        apiBaseURL: environments.apiBaseURL[ENV]
    };
    if (!urls.baseURL) {
        throw new Error(`Primary BASE_URL for environment '${ENV}' not found or is empty in environments.js.`);
    }
    // if (!urls.privateBaseURL) {
    //     console.warn(`WARN: privateBaseURL for environment '${ENV}' is empty.`);
    // }
    // if (!urls.apiBaseURL) {
    //     console.warn(`WARN: apiBaseURL for environment '${ENV}' is empty.`);
    // }

    return {
        options: scenarioOptions,
        urls: urls
    };
}