# Planner App

Este repositório contém uma versão do seu Planner (React + Firebase) com autenticação por email/senha e sincronização do estado do usuário no Firestore.

O que foi incluído
- App React (Vite)
- Tela de login / criar conta (email/senha)
- Componente PlannerApp (seu código adaptado)
- Integração mínima com Firebase (src/firebase.js)
- Exemplo de arquivo de configuração: src/firebaseConfig.example.js

Como usar (resumo):

1. Clone o repo

   git clone https://github.com/micromariaeduarda-creator/planner-app
   cd planner-app

2. Copie o arquivo de configuração e cole suas chaves do Firebase:

   cp src/firebaseConfig.example.js src/firebaseConfig.js
   # edite src/firebaseConfig.js e cole as chaves obtidas no Console Firebase (Project settings > Your apps > SDK config)

3. Instale e rode localmente

   npm install
   npm run dev

4. Firebase (Console):
   - Crie um projeto no https://console.firebase.google.com
   - Em Authentication → Sign-in method → habilite Email/Password
   - Em Firestore → criar banco (modo de teste para começar)
   - Registre um app Web (Your apps) e copie a configuração para src/firebaseConfig.js

5. Deploy (opcional):
   - Instale: npm install -g firebase-tools
   - firebase login
   - firebase init hosting (escolha o projeto e a pasta `dist` após build)
   - npm run build
   - firebase deploy

Notas de segurança
- As regras do Firestore deste template não são incluídas automaticamente. Recomendo aplicar regras para permitir que cada usuário leia/escreva apenas o seu documento `users/{uid}`.

Se quiser, posso também:
- configurar um workflow de deploy automático (GitHub Actions) e instruir como gerar o token FIREBASE_TOKEN para secrets
- ajustar visual/UX

