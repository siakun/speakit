import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDeck, SAMPLE_CONTENT_DIR } from './scripts/content.mjs';
import { DECK_FORMAT, DECK_VERSION, parseDeck, serializeDeck } from './src/deckFile.ts';

const sampleId = 'virtual:sample-deck';
const resolvedSampleId = `\0${sampleId}`;

export default defineConfig({
  // GitHub Pages의 하위 경로(/speakit/)와 로컬 미리보기의 루트에서 같은 산출물이 동작하도록 자산 경로를 상대 경로로 만든다.
  base: './',
  server: { fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  build: { target: 'safari16.4', rolldownOptions: { output: { chunkFileNames: 'assets/[hash].js' } } },
  plugins: [{
    // 사이트에 함께 배포하는 질문은 가짜 샘플 덱뿐이다. 실제 질문은 사용자가 고른 파일이나 링크로만 들어온다.
    name: 'sample-deck',
    resolveId(id) { if (id === sampleId) return resolvedSampleId; },
    async load(id) {
      if (id !== resolvedSampleId) return;
      const { topics, files } = await loadDeck(SAMPLE_CONTENT_DIR);
      files.forEach((file) => this.addWatchFile(file));
      // 샘플도 사용자 파일과 같은 형식으로 만들어, 형식 오류가 있으면 빌드에서 멈추게 한다.
      return `export default ${JSON.stringify(serializeDeck(parseDeck({ format: DECK_FORMAT, version: DECK_VERSION, title: '샘플 덱', topics })))}`;
    },
    configureServer(server) {
      server.watcher.add(SAMPLE_CONTENT_DIR);
      const refresh = (file) => {
        const relative = path.relative(SAMPLE_CONTENT_DIR, file);
        if (relative.split(path.sep).length !== 2 || !file.endsWith('.md')) return;
        const module = server.moduleGraph.getModuleById(resolvedSampleId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('change', refresh).on('add', refresh).on('unlink', refresh);
    },
  }],
});
