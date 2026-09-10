# Nihongo

Aplicação de estudo de hiragana com conta de aluno, login seguro, logout e
progresso salvo em SQLite.

## Executar localmente

Requer Node.js 22.5 ou superior.

```bash
npm start
```

Abra [http://localhost:3000](http://localhost:3000). O arquivo do banco é
criado automaticamente em `data/nihongo.db` e não deve ser enviado ao Git.

## Recursos de conta

- criação de conta sem necessidade de foto de perfil, com validação de e-mail e senha de no mínimo 8 caracteres;
- senha derivada com `scrypt` e comparação em tempo constante;
- sessão persistida em cookie `HttpOnly` por 14 dias;
- login, logout e recuperação automática da sessão;
- progresso, sequência diária e itens errados gravados no SQLite por usuário.

## Trilha de longo prazo

A seção **Trilha completa** apresenta marcos do pré-N5 até além do JLPT N1,
incluindo hiragana/katakana, gramática, kanji, leitura, escuta, conversação,
escrita, japonês profissional e imersão. O sistema grava a conclusão de cada
marco por conta. A trilha é uma orientação para vários anos de estudo: fluência
exige prática consistente com conteúdo real e interação humana, não apenas uso
do aplicativo.
