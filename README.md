This is a Next.js project bootstrapped with create-next-app.

Scopo dell'app
Una web app performante per l'analisi avanzata dei log (.log) con filtri, pin, visualizzazioni JSON avanzate e integrazione con l'AI per assistere nell'analisi (root cause, correlazioni, suggerimenti operativi).

Avvio locale (dev)
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev

Open http://localhost:3000 with your browser to see the result.

You can start editing the page by modifying app/page.tsx. The page auto-updates as you edit the file.

Production build
npm run build && npm run start

Docker
Build dell'immagine:
docker build -t log-chopper .

Esecuzione del container:
docker run --name log-chopper-container -d -p 3000:3000 log-chopper

Questa configurazione espone l'app su http://localhost:3000.

Note
- L'app utilizza Next.js (App Router), TypeScript, Tailwind e componenti Shadcn/UI.
- Le funzionalità AI richiedono una chiave API del provider scelto (OpenAI, OpenRouter, DeepSeek o Ollama locale) configurabile dalla sidebar della chat.
- È disponibile il supporto PWA con Service Worker e manifest per l'installazione su desktop/mobile.

Learn More
To learn more about Next.js, take a look at the following resources:

- Next.js Documentation - learn about Next.js features and API.
- Learn Next.js - an interactive Next.js tutorial.

You can check out the Next.js GitHub repository - your feedback and contributions are welcome!

Deploy on Vercel
The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out our Next.js deployment documentation for more details.