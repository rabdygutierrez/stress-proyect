import { sleep } from 'k6';
import { loadScenarioConfig } from '../common/configLoader.js'; 
import { postAuthenticate } from '../services/postAuthenticate.js';
import { postInfoUser } from '../services/postInfoUser.js';
import { SharedArray } from 'k6/data';

const users = new SharedArray('usuarios', () =>
  JSON.parse(open('../data/users_10.json')).usuarios
);
const scenarioConfig = loadScenarioConfig();
export let options = scenarioConfig.options;
const { baseURL } = scenarioConfig.urls;

export default function () {
const user = users[Math.floor(Math.random() * users.length)];
  if (!user) {
    console.warn("Usuario no válido");
    return;
  }
  const resAuthenticate = postAuthenticate(baseURL, user);
  
  sleep(1);

  const resInfoUser = postInfoUser(baseURL, resAuthenticate.token)
  sleep(1);



}