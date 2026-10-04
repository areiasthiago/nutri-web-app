/** Termo de uso da IA, aceito uma vez antes do primeiro uso (ler PDF ou editar plano). */
export function AiTerms({ onAccept }: { onAccept: () => void }) {
  return (
    <>
      <p>Antes de usar a IA, leia como ela funciona:</p>
      <ul className="terms-list">
        <li>
          O PDF ou o plano, junto com o seu pedido, é enviado ao <strong>Claude</strong>, da empresa Anthropic, só
          para ser transcrito ou editado. O arquivo não fica guardado no app; só o resultado, até você salvar ou
          descartar.
        </li>
        <li>Pelas regras da Anthropic, o que é enviado pela API não é usado para treinar a IA.</li>
        <li>A IA pode errar. Você revisa e corrige tudo antes de salvar.</li>
        <li>A IA só transcreve ou aplica o que você pede: não cria dieta nem faz recomendações.</li>
      </ul>
      <button type="button" className="btn btn-primary" onClick={onAccept}>
        Entendi e aceito
      </button>
    </>
  )
}
