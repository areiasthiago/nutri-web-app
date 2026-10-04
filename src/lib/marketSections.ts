import { foodKey } from './shopping'

// Seções do mercado para organizar a lista de compras, na ordem em que
// normalmente se anda pela loja. A seção de cada item vem de palavras-chave
// (sem IA, igual para todos); a pessoa pode mudar e a escolha fica guardada.

export type SectionKey = 'hortifruti' | 'padaria' | 'carnes' | 'laticinios' | 'mercearia' | 'temperos' | 'bebidas' | 'congelados' | 'outros'

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'hortifruti', label: 'Hortifrúti' },
  { key: 'padaria', label: 'Padaria' },
  { key: 'carnes', label: 'Carnes e peixes' },
  { key: 'laticinios', label: 'Frios, laticínios e ovos' },
  { key: 'mercearia', label: 'Mercearia' },
  { key: 'temperos', label: 'Temperos' },
  { key: 'bebidas', label: 'Bebidas' },
  { key: 'congelados', label: 'Congelados' },
  { key: 'outros', label: 'Outros' },
]

// Ordem importa: o mais específico primeiro ("molho de tomate" antes de
// "tomate", "peito de peru" antes de "peito", "água de coco" antes de "coco").
const RULES: [RegExp, SectionKey][] = [
  [/\b(congelad|polpa|sorvete|acai)/, 'congelados'],
  [/\b(agua|suco|refrigerante|kombucha|isotonico|cha gelado|leite de (amendoa|aveia|soja|arroz)|bebida vegetal)\b/, 'bebidas'],
  [/\b(leite de coco|molho|extrato|polpa de tomate|passata|pasta de amendoim|leite condensado|creme de leite|leite em po|atum|sardinha|milho em conserva|ervilha em conserva|palmito|azeitona)\b/, 'mercearia'],
  [/\b(peito de peru|presunto|salame|mortadela|blanquet)\b/, 'laticinios'],
  [/\b(ovos?|leite|iogurte|queijo|requeijao|manteiga|margarina|ricota|cottage|mussarela|muzzarela|parmesao|coalhada|kefir|nata)\b/, 'laticinios'],
  [/\b(carne|frango|peito|coxa|sobrecoxa|asa|patinho|acem|alcatra|maminha|musculo|lagarto|coxao|fraldinha|picanha|contra.?file|file|bife|moida|suino|lombo|pernil|costela|linguica|bacon|peixe|tilapia|salmao|merluza|pescada|bacalhau|camarao|figado|hamburguer)\b/, 'carnes'],
  [/\b(pao|paes|torrada|bisnaguinha|broa|wrap|rap10|bolo|croissant|baguete)\b/, 'padaria'],
  [/\b(sal|oregano|pimenta do reino|cominho|paprica|colorau|acafrao|curcuma|louro|canela|noz.?moscada|tempero|caldo|ervas finas|alecrim|tomilho|chimichurri|lemon pepper)\b/, 'temperos'],
  [/\b(arroz|feijao|lentilha|grao de bico|aveia|granola|macarrao|massa|espaguete|farinha|fuba|cuscuz|tapioca|goma|quinoa|chia|linhaca|acucar|adocante|mel|cafe|cha|achocolatado|cacau|azeite|oleo|vinagre|castanha|amendoim|nozes|amendoa|whey|proteina|biscoito|bolacha|cereal|pipoca|gelatina|uva passa|ameixa seca|damasco)\b/, 'mercearia'],
  [/\b(banana|maca|mamao|laranja|morango|uva|abacaxi|melao|melancia|manga|pera|kiwi|limao|abacate|goiaba|maracuja|tangerina|mexerica|ponkan|caqui|ameixa|pessego|coco|tomate|alface|rucula|agriao|espinafre|couve|repolho|brocolis|couve.?flor|cenoura|beterraba|abobrinha|abobora|berinjela|chuchu|pepino|pimentao|cebola|alho|batata|mandioca|aipim|macaxeira|inhame|quiabo|vagem|milho|cheiro verde|salsa|salsinha|coentro|cebolinha|hortela|manjericao|gengibre|salada|legumes?|verduras?|folhas?|cogumelo|champignon|rabanete|jilo|maxixe|acelga|erva.?doce|frutas?)\b/, 'hortifruti'],
]

/** Seção padrão de um item pelo nome (sem IA). */
export function defaultSection(name: string): SectionKey {
  const k = foodKey(name)
  for (const [re, section] of RULES) if (re.test(k)) return section
  return 'outros'
}

export const sectionLabel = (key: SectionKey) => SECTIONS.find((s) => s.key === key)?.label ?? 'Outros'
