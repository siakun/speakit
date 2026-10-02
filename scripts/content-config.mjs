import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 이 저장소는 질문 노트를 갖지 않는다. 노트의 위치는 이 파일에서만 정하고, 앱은 빌드하는 순간에만 노트를 읽는다.
// deploy.yml은 이 파일을 import할 수 없어 CONTENT_REPOSITORY와 CONTENT_PREFIX의 사본을 둔다.
export const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));
export const CONTENT_REPOSITORY = 'siakun-private/notes';
export const CONTENT_PREFIX = 'speakit/public';
export const SAMPLE_CONTENT_DIR = path.join(PROJECT_DIR, 'sample-content');

// 로컬에서는 Git에서 제외한 .env.local에 노트 경로를 적어 두면 실행할 때마다 지정하지 않아도 된다.
const localEnv = path.join(PROJECT_DIR, '.env.local');
if (process.env.SPEAKIT_CONTENT_DIR === undefined && existsSync(localEnv)) process.loadEnvFile(localEnv);

const configured = process.env.SPEAKIT_CONTENT_DIR?.trim();
// 노트를 지정하지 않으면 형식 확인용 샘플 덱으로 실행한다. CI 빌드는 이 폴백을 막는다(vite.config.mjs).
export const USING_SAMPLE = !configured;
export const CONTENT_DIR = configured ? path.resolve(PROJECT_DIR, configured) : SAMPLE_CONTENT_DIR;
