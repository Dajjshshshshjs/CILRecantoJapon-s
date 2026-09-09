const CURRICULUM = [
  { id: 'foundation', level: 'Fundamentos', jlpt: 'Pré-N5', duration: '0–3 meses', color: '🌱', description: 'Construa leitura, pronúncia e as primeiras frases do dia a dia.', lessons: [
    ['hiragana', 'Hiragana completo', 'Reconheça e escreva os 46 símbolos básicos.'], ['katakana', 'Katakana completo', 'Leia palavras estrangeiras e nomes próprios.'], ['sounds', 'Sons, ritmo e entonação', 'Pratique vogais longas, ん, っ e combinações.'], ['first-sentences', 'Primeiras frases', 'Apresente-se, faça perguntas e use partículas は・の・を.'],
  ]},
  { id: 'n5', level: 'Iniciante', jlpt: 'JLPT N5', duration: '3–9 meses', color: '🍙', description: 'Entenda expressões frequentes e situações simples.', lessons: [
    ['n5-grammar', 'Gramática essencial', 'Domine です・ます, adjetivos e partículas básicas.'], ['n5-verbs', 'Verbos no presente e passado', 'Fale de rotina, gostos, horários e ações.'], ['n5-vocabulary', 'Vocabulário cotidiano', 'Aprenda cerca de 800 palavras de alta frequência.'], ['n5-listening', 'Escuta e conversa curta', 'Compreenda diálogos lentos e responda com segurança.'],
  ]},
  { id: 'n4', level: 'Básico', jlpt: 'JLPT N4', duration: '9–15 meses', color: '🌸', description: 'Conecte ideias e descreva experiências do cotidiano.', lessons: [
    ['n4-forms', 'Formas verbais', 'Use て-forma, potencial, intenção, obrigação e permissão.'], ['n4-kanji', 'Kanji de sobrevivência', 'Leia os aproximadamente 300 kanji mais úteis.'], ['n4-reading', 'Leitura guiada', 'Entenda avisos, cardápios, e-mails e textos curtos.'], ['n4-speaking', 'Conversas reais', 'Peça informações, explique planos e conte experiências.'],
  ]},
  { id: 'n3', level: 'Intermediário', jlpt: 'JLPT N3', duration: '16–24 meses', color: '🎐', description: 'Passe da frase isolada para a comunicação independente.', lessons: [
    ['n3-grammar', 'Conectores e nuances', 'Expresse causa, contraste, condição e opinião com naturalidade.'], ['n3-kanji', 'Leitura intermediária', 'Amplie para aproximadamente 650 kanji em contexto.'], ['n3-media', 'Notícias e mídia simples', 'Leia textos graduados e acompanhe vídeos com apoio.'], ['n3-writing', 'Escrita prática', 'Produza mensagens, relatos e textos de opinião curtos.'],
  ]},
  { id: 'n2', level: 'Avançado', jlpt: 'JLPT N2', duration: '25–36 meses', color: '⛩️', description: 'Navegue estudos, trabalho e mídia com menos apoio.', lessons: [
    ['n2-grammar', 'Gramática avançada', 'Diferencie registros, formalidade e estruturas complexas.'], ['n2-kanji', 'Kanji para vida real', 'Leia aproximadamente 1.000 kanji em textos autênticos.'], ['n2-business', 'Japonês profissional', 'Escreva e-mails, participe de reuniões e apresente ideias.'], ['n2-immersion', 'Imersão orientada', 'Use podcasts, dramas, jornais e conversas semanais.'],
  ]},
  { id: 'n1', level: 'Proficiência', jlpt: 'JLPT N1', duration: '37–48 meses', color: '🏯', description: 'Compreenda linguagem abstrata, técnica e rápida.', lessons: [
    ['n1-grammar', 'Nuances de alto nível', 'Interprete implicações, estilo e gramática formal.'], ['n1-kanji', 'Leitura extensa', 'Consolide 2.000+ kanji por meio de leitura diária.'], ['n1-argumentation', 'Argumentação e escrita', 'Defenda pontos de vista em textos e apresentações.'], ['n1-listening', 'Escuta sem roteiro', 'Acompanhe discussões, palestras e noticiários.'],
  ]},
  { id: 'fluency', level: 'Fluência contínua', jlpt: 'Além do N1', duration: '4 anos ou mais', color: '🗾', description: 'Transforme conhecimento em uso espontâneo, cultural e profissional.', lessons: [
    ['fluency-speaking', 'Conversação semanal', 'Mantenha trocas frequentes com falantes e receba feedback.'], ['fluency-culture', 'Cultura e pragmática', 'Entenda humor, contexto social, keigo e comunicação indireta.'], ['fluency-specialty', 'Seu japonês de área', 'Desenvolva vocabulário para trabalho, faculdade ou interesses.'], ['fluency-portfolio', 'Projeto de imersão', 'Crie um diário, clube de leitura ou projeto inteiramente em japonês.'],
  ]},
];

const LESSON_IDS = new Set(CURRICULUM.flatMap(level => level.lessons.map(([id]) => id)));
module.exports = { CURRICULUM, LESSON_IDS };
