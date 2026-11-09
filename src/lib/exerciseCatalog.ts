// Catálogo de exercícios do modo treino: dica de execução e ilustração
// animada. O exercício do treino é achado pelo nome, então vale também para
// treino lido do PDF.
//
// Ilustrações: public/exercicios/<key>.webp, WebP animado de 360 px. Quase
// todas vêm dos GIFs do Gif do Treino (gifdotreino.com, "todos os direitos
// reservados"; uso só da família, decisão do Thiago em 09/11/2026). Prancha,
// prancha lateral e abdominal, que o site não tem, são as duas fotos do
// free-exercise-db (Unlicense) alternando. Sem arquivo, fica só a dica.
// Atividades aeróbicas têm o MET, usado no gasto da sessão sem IA.

export type CatalogEntry = {
  key: string
  /** Trechos do nome (sem acento, minúsculos). A ordem do catálogo decide: o mais específico vem antes. */
  match: string[]
  tip: string
  /** Tem ilustração em public/exercicios/<key>.webp. */
  image?: boolean
  met?: number
}

export const CATALOG: CatalogEntry[] = [
  {
    key: 'sentar-levantar',
    match: ['sentar e levantar', 'agachamento no banco', 'agachamento sentando'],
    tip: 'Pés na largura do quadril, braços à frente. Sente no banco devagar, encoste de leve e levante empurrando o chão com os calcanhares.',
    image: true,
  },
  {
    key: 'agachamento-goblet',
    match: ['goblet', 'agachamento com halter'],
    tip: 'Segure um halter em pé junto ao peito. Desça como se fosse sentar, costas retas e joelhos na direção dos pés.',
    image: true,
  },
  {
    key: 'agachamento-bulgaro',
    match: ['bulgaro'],
    tip: 'Peito do pé de trás apoiado no banco. Desça na vertical até a coxa da frente ficar quase paralela ao chão e suba pela perna da frente.',
    image: true,
  },
  {
    key: 'afundo',
    match: ['afundo', 'avanco', 'passada', 'split squat', 'lunge'],
    tip: 'Um pé à frente e outro atrás, tronco reto. Desça até o joelho de trás quase tocar o chão e suba pela perna da frente.',
    image: true,
  },
  {
    key: 'agachamento',
    match: ['agachamento', 'squat'],
    tip: 'Pés na largura dos ombros. Desça levando o quadril para trás, peito aberto e joelhos na direção dos pés; suba empurrando o chão.',
    image: true,
  },
  {
    key: 'flexao-inclinada',
    match: ['flexao com as maos no banco', 'flexao inclinada', 'flexao no banco', 'flexao apoiad'],
    tip: 'Mãos no banco um pouco mais abertas que os ombros, corpo reto da cabeça aos pés. Desça o peito até perto do banco e empurre.',
    image: true,
  },
  {
    key: 'flexao',
    match: ['flexao', 'push up', 'push-up'],
    tip: 'Mãos um pouco mais abertas que os ombros, corpo reto. Desça o peito até perto do chão e empurre. Pode apoiar os joelhos.',
    image: true,
  },
  {
    key: 'supino-halteres',
    match: ['supino'],
    tip: 'Deitado no banco, halteres na linha do peito. Empurre para cima sem bater um no outro e desça devagar, cotovelos a uns 45° do corpo.',
    image: true,
  },
  {
    key: 'crucifixo',
    match: ['crucifixo'],
    tip: 'Deitado no banco, braços quase esticados. Abra os braços até sentir o peito alongar e feche como se abraçasse uma árvore.',
    image: true,
  },
  {
    key: 'remada-unilateral',
    match: ['remada unilateral', 'serrote', 'remada com um braco'],
    tip: 'Joelho e mão do mesmo lado no banco, costas retas. Puxe o halter em direção ao quadril, cotovelo junto ao corpo, e desça devagar.',
    image: true,
  },
  {
    key: 'remada-curvada',
    match: ['remada'],
    tip: 'Tronco inclinado à frente, costas retas e joelhos levemente dobrados. Puxe os halteres até a cintura, apertando as escápulas.',
    image: true,
  },
  {
    key: 'desenvolvimento',
    match: ['desenvolvimento'],
    tip: 'Sentado no banco, halteres na altura dos ombros. Empurre para cima sem arquear a lombar e desça devagar.',
    image: true,
  },
  {
    key: 'elevacao-lateral',
    match: ['elevacao lateral'],
    tip: 'Em pé, halteres ao lado do corpo. Suba os braços para os lados até a altura dos ombros, cotovelos levemente dobrados.',
    image: true,
  },
  {
    key: 'elevacao-quadril',
    match: ['elevacao de quadril', 'elevacao pelvica', 'ponte', 'hip thrust', 'glute bridge'],
    tip: 'Deitado, joelhos dobrados e pés no chão. Suba o quadril apertando o bumbum até alinhar joelhos, quadril e ombros. Desça devagar.',
    image: true,
  },
  {
    key: 'terra-romeno',
    match: ['terra romeno', 'stiff', 'levantamento terra'],
    tip: 'Halteres à frente das coxas, joelhos levemente dobrados. Leve o quadril para trás descendo os halteres rente às pernas, costas retas, e volte.',
    image: true,
  },
  {
    key: 'rosca-martelo',
    match: ['rosca martelo'],
    tip: 'Em pé, halteres com as palmas viradas uma para a outra. Dobre os cotovelos sem mexer os ombros e desça devagar.',
    image: true,
  },
  {
    key: 'rosca',
    match: ['rosca', 'biceps'],
    tip: 'Em pé, cotovelos colados ao corpo. Suba os halteres girando as palmas para cima e desça devagar, sem balançar o tronco.',
    image: true,
  },
  {
    key: 'mergulho-banco',
    match: ['mergulho', 'triceps no banco', 'triceps banco'],
    tip: 'Mãos na beira do banco, pernas à frente. Desça dobrando os cotovelos para trás até uns 90° e empurre de volta.',
    image: true,
  },
  {
    key: 'triceps-testa',
    match: ['triceps testa'],
    tip: 'Deitado no banco, halteres acima do peito. Dobre só os cotovelos, levando os halteres para perto da cabeça, e estique de novo.',
    image: true,
  },
  {
    key: 'triceps-frances',
    match: ['frances', 'triceps'],
    tip: 'Halter seguro com as duas mãos acima da cabeça. Desça atrás da cabeça dobrando os cotovelos, que apontam para cima, e estique.',
    image: true,
  },
  {
    key: 'prancha-lateral',
    match: ['prancha lateral'],
    tip: 'De lado, apoiado no antebraço, cotovelo embaixo do ombro. Suba o quadril até o corpo ficar reto e segure.',
    image: true,
  },
  {
    key: 'prancha',
    match: ['prancha', 'plank'],
    tip: 'Antebraços no chão, cotovelos embaixo dos ombros, corpo reto da cabeça aos pés. Aperte o abdômen e não deixe o quadril cair.',
    image: true,
  },
  {
    key: 'abdominal',
    match: ['abdominal'],
    tip: 'Deitado, joelhos dobrados. Tire as escápulas do chão contraindo o abdômen, sem puxar o pescoço com as mãos.',
    image: true,
  },
  {
    key: 'perdigueiro',
    match: ['perdigueiro', 'bird dog'],
    tip: 'De quatro, mãos embaixo dos ombros e joelhos embaixo do quadril. Estique um braço e a perna oposta, segure 2 segundos e troque.',
    image: true,
  },
  {
    key: 'superman',
    match: ['superman'],
    tip: 'Deitado de bruços, braços à frente. Tire braços e pernas do chão ao mesmo tempo, segure um instante e desça.',
    image: true,
  },
  {
    key: 'panturrilha',
    match: ['panturrilha'],
    tip: 'Em pé, de preferência com a ponta dos pés num degrau. Suba na ponta dos pés o mais alto que der e desça devagar.',
    image: true,
  },
  {
    key: 'polichinelo',
    match: ['polichinelo'],
    tip: 'Pule abrindo pernas e braços ao mesmo tempo e volte. Para pegar leve, abra uma perna de cada vez, sem pular.',
    image: true,
    met: 8,
  },
  {
    key: 'esteira',
    match: ['esteira'],
    tip: 'Ritmo em que dá para falar frases inteiras, mas não para cantar. Postura reta, sem se apoiar nas barras.',
    image: true,
    met: 4.3,
  },
  {
    key: 'bicicleta',
    match: ['bicicleta', 'bike', 'ergometrica'],
    tip: 'Banco na altura em que a perna fica quase esticada embaixo. Pedalada constante, com carga em que dá para conversar.',
    image: true,
    met: 5.5,
  },
  {
    key: 'eliptico',
    match: ['eliptico', 'transport'],
    tip: 'Movimento contínuo, tronco reto. Ritmo em que dá para conversar.',
    image: true,
    met: 5,
  },
  {
    key: 'caminhada',
    match: ['caminhada'],
    tip: 'Passos firmes, braços acompanhando. Ritmo em que dá para conversar.',
    image: true,
    met: 3.5,
  },
]

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function findExercise(name: string): CatalogEntry | null {
  const n = fold(name)
  return CATALOG.find((e) => e.match.some((m) => n.includes(m))) ?? null
}

/** Caminho da ilustração animada, relativo à base do app. */
export function exerciseImage(entry: CatalogEntry): string | null {
  return entry.image ? `${import.meta.env.BASE_URL}exercicios/${entry.key}.webp` : null
}
