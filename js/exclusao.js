/**
 * Exclusão de vídeos pelos cards do catálogo (js/exclusao.js).
 *
 * O backend já expõe DELETE /videos/{video_id} e só aceita o dono ou admin.
 * Este módulo adiciona o botão "Excluir" nos cards quando o usuário da sessão
 * é admin, pede confirmação e chama a MESMA rota usada pelos painéis.
 *
 * Regras de UI:
 *  - estudante/professor visitante não vê o botão (o backend continua sendo a
 *    autoridade: uma chamada direta sem permissão recebe 403);
 *  - vídeos de demonstração não têm registro no banco, então não ganham botão;
 *  - clicar em Excluir não abre o vídeo nem dispara a seleção do card;
 *  - depois de apagar, remove o card de todas as listagens da página e emite
 *    `video-excluido` para a home recarregar a contagem e o player sair do
 *    vídeo que acabou de ser apagado.
 */
import { apagarVideo } from "./api.js";
import { papelDoUsuario, usuarioAtual } from "./sessao.js";

export const EVENTO_VIDEO_EXCLUIDO = "video-excluido";

function removerCardsDoVideo(videoId) {
  const id = String(videoId);
  for (const card of document.querySelectorAll("[data-video-id]")) {
    if (card.dataset.videoId !== id) continue;
    const alvo = card.closest("[data-card-exclusao]") || card;
    alvo.remove();
  }
}

function mensagemDeErro(erro) {
  if (erro?.status === 401) {
    return "Sua sessão expirou. Entre novamente para excluir o vídeo.";
  }
  if (erro?.status === 403) {
    return "Você não tem permissão para excluir este vídeo.";
  }
  if (erro?.status === 404) {
    return "Este vídeo já não existe. Atualize a lista e tente novamente.";
  }
  return "Não foi possível excluir o vídeo. Verifique a conexão e tente novamente.";
}

/**
 * Cria o botão de excluir para um card, ou null quando o usuário não é admin
 * ou o vídeo não é um registro real do banco.
 *
 * @param {object} video Card no formato da home/recommendations (`id`, `title`)
 *                       ou metadado do backend (`video_id`, `titulo`).
 * @param {object} [opcoes]
 * @param {Function} [opcoes.aoExcluir] Callback após a exclusão (ex.: recarregar
 *                                      a home para atualizar contagem/vazio).
 * @returns {HTMLButtonElement|null}
 */
export function criarBotaoExcluir(video, { aoExcluir } = {}) {
  const videoId = video?.id ?? video?.video_id;
  if (!videoId || video?.demo) return null;
  if (papelDoUsuario(usuarioAtual()) !== "admin") return null;

  const titulo = video?.title ?? video?.titulo ?? "Vídeo sem título";
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "btn-acao btn-acao-perigo btn-excluir-card";
  botao.textContent = "Excluir";
  botao.setAttribute("aria-label", `Excluir vídeo ${titulo}`);

  botao.addEventListener("click", async (event) => {
    // O card inteiro é clicável (link na home, article com role=button nos
    // relacionados). Excluir não pode navegar para a watch page nem trocar o
    // vídeo em reprodução.
    event.preventDefault();
    event.stopPropagation();

    if (botao.disabled) return;
    botao.disabled = true;

    const confirmou = window.confirm(
      `Excluir "${titulo}"?\n\n` +
        "O vídeo e seus arquivos serão apagados. Essa ação não pode ser desfeita."
    );
    if (!confirmou) {
      botao.disabled = false;
      return;
    }

    const textoOriginal = botao.textContent;
    botao.textContent = "Excluindo...";

    try {
      await apagarVideo(videoId);
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
      window.alert(mensagemDeErro(erro));
      return;
    }

    removerCardsDoVideo(videoId);
    window.dispatchEvent(
      new CustomEvent(EVENTO_VIDEO_EXCLUIDO, { detail: { videoId: String(videoId) } })
    );

    if (aoExcluir) {
      try {
        await aoExcluir(String(videoId));
      } catch (erro) {
        // A exclusão já aconteceu; falha ao atualizar a lista não deve virar
        // um alerta de "não foi possível excluir".
        console.error("Falha ao atualizar a lista após excluir o vídeo:", erro);
      }
    }
  });

  return botao;
}
