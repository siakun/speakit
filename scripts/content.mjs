import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_DIR } from './content-config.mjs';

export const sourceRoot = CONTENT_DIR;

// 원본을 고치거나 답을 추정하지 않는다. 비교용 답변과 평가 기준을 서로 다른 필드로 유지한다.
function sections(text, level) {
  const pattern = new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm');
  const headings = [...text.matchAll(pattern)];
  return headings.map((heading, index) => ({
    title: heading[1].trim(),
    text: text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length).trim(),
  }));
}

function clean(text) {
  return text.replace(/<!--[^]*?-->/g, '').replace(/\r\n/g, '\n').trim();
}

export function parseTopic(markdown, source) {
  const text = clean(markdown);
  const blocks = sections(text, 2);
  const get = (title) => blocks.find((block) => block.title === title)?.text ?? '';
  const question = get('기초질문').match(/^>\s*(.+)$/m)?.[1]?.trim();
  if (!question) throw new Error(`${source}: 기초질문 인용문이 없습니다.`);
  const checklistBlock = get('평가 체크리스트');
  const entries = [...checklistBlock.matchAll(/^- \[[ x]\] \*\*(.+?)\*\*[:：]\s*(.+)$/gm)];
  const checklist = entries.map((entry, index) => {
    const body = checklistBlock.slice(entry.index + entry[0].length, entries[index + 1]?.index ?? checklistBlock.length);
    const detail = body.match(/^\s+- 알아야 할 내용:\s*(.+)$/m)?.[1]?.trim();
    const followup = body.match(/^\s+- 빠뜨리면:\s*(.+)$/m)?.[1]?.trim();
    if (!detail || !followup) throw new Error(`${source}: ${entry[1]} 항목에 설명 또는 꼬리 질문이 없습니다.`);
    return { id: entry[1], label: entry[1], criterion: entry[2], detail, followup };
  });
  if (!checklist.length) throw new Error(`${source}: 평가 기준이 없습니다.`);

  const examples = sections(get('1질문 3답변'), 3).map((block) => {
    const paragraphs = block.text.split('\n').filter((line) => line.startsWith('>')).map((line) => line.replace(/^>\s?/, '')).join('\n');
    const metadata = block.text.split('\n').filter((line) => !line.startsWith('>')).join('\n').trim();
    return { title: block.title, answer: paragraphs, metadata };
  });
  const followups = sections(get('꼬리 질문'), 3).map((block) => ({ question: block.title, answer: block.text }));
  return {
    id: source.replace(/\.md$/, ''),
    category: source.split('/')[0],
    title: text.match(/^# (.+)$/m)?.[1] ?? source,
    question,
    checklist,
    examples,
    followups,
    answerDraft: get('답변'),
    references: get('참고자료'),
    hasPastQuestion: Boolean(get('기출')),
  };
}

export async function loadDeck(root = sourceRoot) {
  const topics = [];
  const files = [];
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') throw new Error(`질문 노트 폴더가 없습니다: ${root}`);
    throw error;
  });
  const directories = entries.filter((entry) => entry.isDirectory());
  for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
    const categoryRoot = path.join(root, directory.name);
    for (const file of (await readdir(categoryRoot)).filter((name) => name.endsWith('.md')).sort()) {
      const fullPath = path.join(categoryRoot, file);
      topics.push(parseTopic(await readFile(fullPath, 'utf8'), `${directory.name}/${file}`));
      files.push(fullPath);
    }
  }
  if (!topics.length) throw new Error(`연습할 질문이 없습니다. 질문 노트 폴더를 확인해 주세요: ${root}`);
  return { topics, files };
}
