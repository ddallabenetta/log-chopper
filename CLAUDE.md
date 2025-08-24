# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Log Chopper is a performant Next.js web app for advanced log file analysis (.log) with filtering, pinning, JSON visualization, and AI-powered analysis (root cause analysis, correlations, operational suggestions). It's built with TypeScript, Tailwind CSS, and Shadcn/UI components.

## Development Commands

```bash
# Development server
pnpm dev
# or npm run dev / yarn dev / bun dev

# Production build
pnpm build && pnpm start

# Linting
pnpm lint

# Docker
docker build -t log-chopper .
docker run --name log-chopper-container -d -p 3000:3000 log-chopper
```

## Architecture

- **Framework**: Next.js 15 with App Router (`src/app/`)
- **Main Component**: `LogViewer` in `src/components/LogViewer/` handles the core log analysis functionality
- **State Management**: React Context via `useLogState` hook for log operations (filtering, pinning, pagination)
- **File Processing**: Large file handling with IndexedDB storage via `large-file-index.ts`
- **AI Integration**: Chat sidebar for AI-powered log analysis with configurable providers (OpenAI, OpenRouter, DeepSeek, Ollama)

## Key Components Structure

- **LogViewer**: Main log viewing interface with tabs, filtering, and pagination
- **ChatSidebar**: AI assistant for log analysis and insights  
- **LogList**: Virtualized log line rendering with pinning capabilities
- **FileTabs**: Multi-file tab management system
- **Large File Index**: Efficient processing of large log files using Web Workers and IndexedDB

## Path Aliases

Use `@/` prefix for all imports from `src/` directory as configured in `tsconfig.json`.

## Technology Stack Requirements

Follow the detailed guidelines in `AI_RULES.md`:
- **UI**: Shadcn/UI components from `src/components/ui/` 
- **Styling**: Tailwind CSS utilities only
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation
- **State**: React Context API and hooks
- **Notifications**: Sonner toasts
- **Charts**: Recharts

## PWA Support

The app includes Service Worker and manifest configuration for desktop/mobile installation.