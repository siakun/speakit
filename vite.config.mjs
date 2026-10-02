import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDeck, sourceRoot } from './scripts/content.mjs';
import { USING_SAMPLE } from './scripts/content-config.mjs';

const virtualId = 'virtual:interview-deck';
const resolvedId = `\0${virtualId}`;
const detailsId = 'virtual:interview-details';
const detailPrefix = 'virtual:interview-topic/';
let deckPromise;
const getDeck = () => deckPromise ??= loadDeck();

export default defineConfig({
  // GitHub Pages의 하위 경로(/speakit/)와 로컬 미리보기의 루트에서 같은 산출물이 동작하도록 자산 경로를 상대 경로로 만든다.
  base: './',
  // 노트 전체를 웹 루트로 열지 않고, 학습에 필요한 필드만 빌드에 포함한다.
  server: { fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  build: { target: 'safari16.4', rolldownOptions: { output: { chunkFileNames: 'assets/[hash].js' } } },
  plugins: [{
    name: 'interview-content',
    config(_, { command }) {
      // 배포 빌드가 질문 노트를 받지 못한 채 샘플 덱을 사이트로 내보내지 않도록 멈춘다.
      if (command === 'build' && process.env.CI && USING_SAMPLE) throw new Error('CI 빌드는 SPEAKIT_CONTENT_DIR로 질문 노트 폴더를 지정해야 합니다. 샘플 덱은 배포하지 않습니다.');
    },
    configResolved(config) {
      if (USING_SAMPLE) config.logger.info(`질문 노트 폴더(SPEAKIT_CONTENT_DIR)를 지정하지 않아 샘플 덱을 사용합니다: ${sourceRoot}`);
    },
    resolveId(id) { if (id === virtualId || id === detailsId || id.startsWith(detailPrefix)) return `\0${id}`; },
    async load(id) {
      if (!id.startsWith('\0virtual:interview-')) return;
      const { topics, files } = await getDeck();
      files.forEach((file) => this.addWatchFile(file));
      if (id === resolvedId) {
        return `export default ${JSON.stringify(topics.map(({ id, category, title, question, hasPastQuestion }) => ({ id, category, title, question, hasPastQuestion })))}`;
      }
      // 말하기 시작 전에는 질문 목록만 필요하다. 현재 카드의 평가 기준과 비교 답변을 따로 읽는다.
      if (id === `\0${detailsId}`) {
        return `export default {${topics.map((topic) => `${JSON.stringify(topic.id)}:()=>import(${JSON.stringify(detailPrefix + encodeURIComponent(topic.id))})`).join(',')}}`;
      }
      const topic = topics.find((topic) => topic.id === decodeURIComponent(id.slice(detailPrefix.length + 1)));
      if (!topic) throw new Error('비교 답변의 원본 주제를 찾지 못했습니다.');
      const { id: topicId, category, title, question, hasPastQuestion, ...details } = topic;
      return `export default ${JSON.stringify(details)}`;
    },
    configureServer(server) {
      server.watcher.add(sourceRoot);
      const refresh = (file) => {
        const relative = path.relative(sourceRoot, file);
        if (relative.split(path.sep).length !== 2 || !file.endsWith('.md')) return;
        deckPromise = undefined;
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.startsWith('\0virtual:interview-')) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('change', refresh).on('add', refresh).on('unlink', refresh);
    },
  }],
});
