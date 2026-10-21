/**
 * Appels à l'API de la pile de démo avec la session d'un compte fictif, pour préparer les données
 * d'un scénario avec les vraies règles de l'application.
 */
import { BASE_URL, DEMO_PASSWORD } from './config';

export type Api = <T = unknown>(path: string, body?: unknown, method?: string) => Promise<T>;

export async function session(username: string): Promise<Api> {
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ username, password: DEMO_PASSWORD }),
  });
  if (!login.ok) throw new Error(`Connexion de ${username} impossible : ${login.status}`);
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith('sid='))!.split(';')[0];
  return async <T>(path: string, body?: unknown, method?: string) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method ?? 'POST'} ${path} : ${res.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  };
}
