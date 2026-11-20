/**
 * Integração do botão Excluir nas listagens do catálogo.
 *
 * Usa os módulos reais (home.js, recommendations.js, exclusao.js, sessao.js)
 * com sessionStorage de admin e fetch dublado. Prova que o botão aparece nos
 * cards da home, relacionados e sidebar, e que a exclusão atualiza a tela sem
 * depender dos painéis Meus vídeos / Admin.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const homeHtml = readFileSync(fileURLToPath(new URL("../home.html", import.meta.url)), "utf8");
const ADMIN = { usuario_id: "adm", nome: "Admin", email: "admin@edustream.com", role: "admin" };

const V1 = {
  video_id: "v-1",
  titulo: "Frações",
  views: 3,
  hls_url: "http://localhost:8000/videos/v-1/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v-1/thumbnail.jpg",
};
const V2 = {
  video_id: "v-2",
  titulo: "Geometria",
  views: 1,
  hls_url: "http://localhost:8000/videos/v-2/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v-2/thumbnail.jpg",
};

function flush(times = 6) {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    promise = promise.then(() => new Promise((resolver) => setTimeout(resolver, 0)));
  }
  return promise;
}

function respostaJson(corpo, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("edustream.usuario", JSON.stringify(ADMIN));
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("home — Excluir nos cards do catálogo", () => {
  test("admin vê Excluir em cada card; apagar remove o card e atualiza a contagem", async () => {
    let videos = [V1, V2];
    global.fetch = jest.fn(async (url, options = {}) => {
      const alvo = String(url);
      if (alvo.includes("/catalogo")) {
        return respostaJson({ videos, total: videos.length });
      }
      if (options.method === "DELETE" && alvo.includes("/videos/")) {
        const id = decodeURIComponent(alvo.split("/videos/")[1]);
        videos = videos.filter((video) => video.video_id !== id);
        return respostaJson({ video_id: id, mensagem: "Vídeo apagado com sucesso." });
      }
      return respostaJson({}, 404);
    });

    jest.resetModules();
    const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
    document.body.innerHTML = pagina.body.innerHTML;
    await import("../js/home.js");
    await flush();

    const botoes = document.querySelectorAll("#homeGrid .btn-excluir-card");
    expect(botoes).toHaveLength(2);
    expect(document.querySelector("#homeCount").textContent).toBe("2 vídeos");

    // O botão fica fora do link do vídeo (não é conteúdo interativo aninhado).
    expect(botoes[0].closest("a.home-card")).toBeNull();
    expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(2);

    botoes[0].click();
    await flush();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/videos/v-1",
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
    expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(1);
    expect(document.querySelector("#homeGrid a.home-card").getAttribute("href")).toBe("index.html?video=v-2");
    expect(document.querySelector("#homeCount").textContent).toBe("1 vídeo");
    expect(window.alert).not.toHaveBeenCalled();
  });

  test("estudante não vê botão de excluir na home", async () => {
    sessionStorage.setItem(
      "edustream.usuario",
      JSON.stringify({ usuario_id: "e1", email: "aluno@escola.com", role: "estudante" })
    );
    global.fetch = jest.fn(async () => respostaJson({ videos: [V1], total: 1 }));

    jest.resetModules();
    const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
    document.body.innerHTML = pagina.body.innerHTML;
    await import("../js/home.js");
    await flush();

    expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(1);
    expect(document.querySelectorAll("#homeGrid .btn-excluir-card")).toHaveLength(0);
  });
});

describe("relacionados e sidebar — Excluir para admin", () => {
  test("renderRecommendations e renderSidebar ganham botão e removem o wrapper ao apagar", async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === "DELETE") {
        return respostaJson({ video_id: "v-1", mensagem: "Vídeo apagado com sucesso." });
      }
      return respostaJson({}, 404);
    });

    jest.resetModules();
    const { renderRecommendations, renderSidebar } = await import("../js/recommendations.js");

    const relacionados = document.createElement("div");
    const sidebar = document.createElement("div");
    document.body.append(relacionados, sidebar);

    const videos = [
      { id: "v-1", title: "Frações", hlsUrl: "/videos/v-1/master.m3u8", pronta: true },
      { id: "demo-java", title: "Demo", demo: true },
    ];
    renderRecommendations(relacionados, videos);
    renderSidebar(sidebar, videos);

    expect(relacionados.querySelectorAll(".btn-excluir-card")).toHaveLength(1);
    expect(sidebar.querySelectorAll(".btn-excluir-card")).toHaveLength(1);
    expect(relacionados.querySelectorAll("article.video-card")).toHaveLength(2);

    relacionados.querySelector(".btn-excluir-card").click();
    await flush();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/videos/v-1",
      expect.objectContaining({ method: "DELETE" })
    );
    // O mesmo vídeo some das duas listagens da página.
    expect(relacionados.querySelectorAll('[data-video-id="v-1"]')).toHaveLength(0);
    expect(sidebar.querySelectorAll('[data-video-id="v-1"]')).toHaveLength(0);
    expect(relacionados.querySelectorAll("article.video-card")).toHaveLength(1);
    expect(sidebar.querySelectorAll("article.video-card")).toHaveLength(1);
  });
});
