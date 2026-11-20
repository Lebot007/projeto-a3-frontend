/**
 * Testes do botão de excluir dos cards (js/exclusao.js).
 *
 * A rota DELETE /videos/{id} já existe no backend e é a mesma dos painéis.
 * Aqui validamos a camada de UI: permissão visual (só admin), confirmação,
 * não navegar/selecionar o vídeo ao clicar, remoção dos cards e tratamento de
 * erro sem remover o vídeo da tela quando a API falha.
 */
import { jest } from "@jest/globals";

const ADMIN = { usuario_id: "adm", email: "admin@edustream.com", role: "admin" };
const PROFESSOR = { usuario_id: "p1", email: "prof@escola.com", role: "professor" };
const ESTUDANTE = { usuario_id: "e1", email: "aluno@escola.com", role: "estudante" };
const VIDEO = { id: "v-1", title: "Aula de frações" };

async function importarModulo({ usuario = ADMIN, apagarVideo } = {}) {
  jest.resetModules();

  const apagar = apagarVideo || jest.fn(async () => ({ mensagem: "Vídeo apagado com sucesso." }));
  jest.unstable_mockModule("../js/api.js", () => ({ apagarVideo: apagar }));
  jest.unstable_mockModule("../js/sessao.js", () => ({
    usuarioAtual: jest.fn(() => usuario),
    papelDoUsuario: jest.fn((u) => u?.role || "estudante"),
  }));

  const api = await import("../js/api.js");
  const modulo = await import("../js/exclusao.js");
  return { modulo, api };
}

function cardNoDom(videoId, { wrapper = false } = {}) {
  const card = document.createElement("article");
  card.dataset.videoId = videoId;
  if (!wrapper) {
    document.body.appendChild(card);
    return card;
  }
  const alvo = document.createElement("div");
  alvo.dataset.cardExclusao = "1";
  alvo.appendChild(card);
  document.body.appendChild(alvo);
  return alvo;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("criarBotaoExcluir — visibilidade", () => {
  test("admin recebe botão Excluir com aria-label do título", async () => {
    const { modulo } = await importarModulo();
    const botao = modulo.criarBotaoExcluir(VIDEO);

    expect(botao).not.toBeNull();
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.type).toBe("button");
    expect(botao.textContent).toBe("Excluir");
    expect(botao.getAttribute("aria-label")).toBe("Excluir vídeo Aula de frações");
    expect(botao.classList.contains("btn-acao-perigo")).toBe(true);
  });

  test.each([
    ["estudante", ESTUDANTE],
    ["professor", PROFESSOR],
    ["sem sessão", null],
  ])("%s não vê o botão", async (_nome, usuario) => {
    const { modulo } = await importarModulo({ usuario });
    expect(modulo.criarBotaoExcluir(VIDEO)).toBeNull();
  });

  test("vídeo de demonstração não ganha botão (não existe no banco)", async () => {
    const { modulo } = await importarModulo();
    expect(modulo.criarBotaoExcluir({ id: "demo-java", title: "Demo", demo: true })).toBeNull();
  });

  test("vídeo sem id não ganha botão", async () => {
    const { modulo } = await importarModulo();
    expect(modulo.criarBotaoExcluir({ title: "Sem id" })).toBeNull();
  });

  test("aceita metadado do backend (video_id/titulo)", async () => {
    const { modulo } = await importarModulo();
    const botao = modulo.criarBotaoExcluir({ video_id: "v-9", titulo: "Aula 9" });
    expect(botao.getAttribute("aria-label")).toBe("Excluir vídeo Aula 9");
  });
});

describe("criarBotaoExcluir — interação", () => {
  test("cancelar a confirmação não chama a API e reabilita o botão", async () => {
    const { modulo, api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const botao = modulo.criarBotaoExcluir(VIDEO);

    botao.click();
    await Promise.resolve();

    expect(window.confirm).toHaveBeenCalled();
    expect(api.apagarVideo).not.toHaveBeenCalled();
    expect(botao.disabled).toBe(false);
    expect(botao.textContent).toBe("Excluir");
  });

  test("clique em Excluir não propaga para o card nem navega", async () => {
    const { modulo } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const botao = modulo.criarBotaoExcluir(VIDEO);
    const card = cardNoDom("v-1");
    card.appendChild(botao);

    let cardClicado = false;
    let defaultPrevented = false;
    card.addEventListener("click", () => { cardClicado = true; });
    botao.addEventListener("click", (event) => { defaultPrevented = event.defaultPrevented; });

    botao.click();
    await Promise.resolve();

    expect(cardClicado).toBe(false);
    expect(defaultPrevented).toBe(true);
  });

  test("confirmando chama DELETE, remove cards do mesmo id e emite evento", async () => {
    const { modulo, api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const aoExcluir = jest.fn();
    const botao = modulo.criarBotaoExcluir(VIDEO, { aoExcluir });

    cardNoDom("v-1", { wrapper: true });
    cardNoDom("v-1");
    cardNoDom("v-2");
    document.body.appendChild(botao);

    const eventos = [];
    window.addEventListener(modulo.EVENTO_VIDEO_EXCLUIDO, (event) => eventos.push(event.detail));

    botao.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.apagarVideo).toHaveBeenCalledWith("v-1");
    expect(document.querySelectorAll('[data-video-id="v-1"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-video-id="v-2"]')).toHaveLength(1);
    expect(eventos).toEqual([{ videoId: "v-1" }]);
    expect(aoExcluir).toHaveBeenCalledWith("v-1");
  });

  test("duplo clique enquanto exclui não dispara duas requisições", async () => {
    let resolver;
    const apagarVideo = jest.fn(() => new Promise((resolve) => { resolver = resolve; }));
    const { modulo, api } = await importarModulo({ apagarVideo });
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const botao = modulo.criarBotaoExcluir(VIDEO);

    botao.click();
    botao.click();
    expect(api.apagarVideo).toHaveBeenCalledTimes(1);
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toBe("Excluindo...");

    resolver({});
    await Promise.resolve();
    await Promise.resolve();
  });

  test("403 mostra alerta de permissão e mantém o card", async () => {
    const apagarVideo = jest.fn(async () => { throw { status: 403 }; });
    const { modulo } = await importarModulo({ apagarVideo });
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const botao = modulo.criarBotaoExcluir(VIDEO);
    const card = cardNoDom("v-1");
    card.appendChild(botao);

    botao.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.alert).toHaveBeenCalledWith("Você não tem permissão para excluir este vídeo.");
    expect(document.querySelectorAll('[data-video-id="v-1"]')).toHaveLength(1);
    expect(botao.disabled).toBe(false);
    expect(botao.textContent).toBe("Excluir");
  });

  test("falha de rede mostra mensagem genérica e não remove o card", async () => {
    const apagarVideo = jest.fn(async () => { throw new TypeError("Failed to fetch"); });
    const { modulo } = await importarModulo({ apagarVideo });
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const botao = modulo.criarBotaoExcluir(VIDEO);
    const card = cardNoDom("v-1");
    card.appendChild(botao);

    botao.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.alert).toHaveBeenCalledWith(
      "Não foi possível excluir o vídeo. Verifique a conexão e tente novamente."
    );
    expect(document.querySelectorAll('[data-video-id="v-1"]')).toHaveLength(1);
    expect(botao.disabled).toBe(false);
  });
});
