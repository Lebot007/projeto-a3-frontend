/**
 * Regressão: front aberto pelo Live Server em http://127.0.0.1:5500.
 *
 * O Live Server abre em 127.0.0.1 por padrão. Antes, o config.js (e o
 * fallback do js/api.js) apontavam a API SEMPRE para http://localhost:8000.
 * Como 127.0.0.1 e localhost são "sites" diferentes para o navegador, o
 * cookie de sessão (HttpOnly, SameSite=Lax) gravado no login nunca voltava
 * nas chamadas seguintes: a tela de login "passava", mas upload, excluir,
 * Meus vídeos e painel admin respondiam 401.
 *
 * A API precisa ficar no MESMO hostname da página (porta 8000).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://127.0.0.1:5500/home.html"}
 */
import { jest } from "@jest/globals";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireCjs = createRequire(import.meta.url);
const { evaluarScript } = requireCjs("./hls-real.cjs");
const caminhoConfig = fileURLToPath(new URL("../config.js", import.meta.url));

afterEach(() => {
  delete window.PLAYER_CONFIG;
  jest.restoreAllMocks();
});

test("config.js aponta a API para 127.0.0.1:8000 (mesmo hostname da página)", () => {
  delete window.PLAYER_CONFIG;

  evaluarScript(window, caminhoConfig);

  expect(window.location.hostname).toBe("127.0.0.1");
  expect(window.PLAYER_CONFIG.API_BASE_URL).toBe("http://127.0.0.1:8000");
});

test("js/api.js sem config.js também usa o mesmo hostname e manda o cookie", async () => {
  delete window.PLAYER_CONFIG;
  jest.resetModules();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));

  const api = await import("../js/api.js");
  expect(api.API_BASE_URL).toBe("http://127.0.0.1:8000");

  await api.buscarSessao();
  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/sessao",
    expect.objectContaining({ credentials: "include" })
  );
});
