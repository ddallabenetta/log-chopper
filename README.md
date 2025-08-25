```
 ██       ██████   ██████       ██████ ██   ██  ██████  ██████  ██████  ███████ ██████  
 ██      ██    ██ ██           ██      ██   ██ ██    ██ ██   ██ ██   ██ ██      ██   ██ 
 ██      ██    ██ ██   ███     ██      ███████ ██    ██ ██████  ██████  █████   ██████  
 ██      ██    ██ ██    ██     ██      ██   ██ ██    ██ ██      ██      ██      ██   ██ 
 ███████  ██████   ██████       ██████ ██   ██  ██████  ██      ██      ███████ ██   ██ 
```

# 🪵 Log Chopper

Una web app performante per l'analisi avanzata dei file di log (.log) con funzionalità di filtraggio, pinning, visualizzazione JSON e integrazione AI per assistere nell'analisi (root cause analysis, correlazioni e suggerimenti operativi).

## ✨ Caratteristiche principali

- 🔍 **Analisi avanzata dei log** con filtri dinamici e ricerca
- 📌 **Pinning delle righe** importanti per riferimenti rapidi
- 📊 **Visualizzazione JSON** strutturata per log complessi
- 🤖 **Integrazione AI** per root cause analysis e correlazioni
- ⚡ **Gestione file di grandi dimensioni** con indicizzazione ottimizzata
- 📱 **Supporto PWA** per installazione su desktop e mobile
- 🎨 **UI moderna** con componenti Shadcn/UI e dark mode

## 🚀 Avvio rapido

### Sviluppo locale

```bash
# Installa le dipendenze
pnpm install

# Avvia il server di sviluppo
pnpm dev
```

Apri [http://localhost:3000](http://localhost:3000) nel browser per vedere l'applicazione.

### Build di produzione

```bash
pnpm build && pnpm start
```

## 🐳 Docker

### Build dell'immagine

```bash
docker build -t log-chopper .
```

### Esecuzione del container

```bash
docker run --name log-chopper-container -d -p 3000:3000 log-chopper
```

L'applicazione sarà disponibile su [http://localhost:3000](http://localhost:3000).

## 🛠️ Stack tecnologico

- **Framework**: Next.js 15 con App Router
- **Linguaggio**: TypeScript
- **Styling**: Tailwind CSS
- **Componenti**: Shadcn/UI
- **Storage**: IndexedDB per file di grandi dimensioni
- **AI**: Supporto per OpenAI, OpenRouter, DeepSeek, Ollama

## ⚙️ Configurazione AI

Le funzionalità AI richiedono la configurazione di una chiave API. Provider supportati:

- **OpenAI** - Richiede API key OpenAI
- **OpenRouter** - Richiede API key OpenRouter  
- **DeepSeek** - Richiede API key DeepSeek
- **Ollama** - Server locale (nessuna API key richiesta)

Configura il provider dalla sidebar della chat nell'applicazione.

## 📁 Struttura del progetto

```
src/
├── app/                    # Next.js App Router
├── components/
│   ├── LogViewer/         # Componente principale per visualizzazione log
│   ├── ChatSidebar/       # Assistente AI per analisi log
│   ├── ui/                # Componenti UI Shadcn
│   └── ...
├── lib/                   # Utilità e configurazioni
└── types/                 # Definizioni TypeScript
```

## 🤝 Contribuire

1. Fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/amazing-feature`)
3. Commit delle modifiche (`git commit -m 'Add amazing feature'`)
4. Push del branch (`git push origin feature/amazing-feature`)
5. Apri una Pull Request

## 📄 Licenza

Questo progetto è distribuito sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.