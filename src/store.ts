import type { PracticeStore, TopicSummary } from './types';

export const storageKey = 'cs-speaking-cards:v1';

export function shuffle(ids: string[]): string[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function eligible(topics: TopicSummary[], category: string, mode: PracticeStore['mode'], saved: string[]) {
  return topics.filter((topic) => (category === 'all' || topic.category === category) && (mode === 'all' || saved.includes(topic.id))).map((topic) => topic.id);
}

export function restore(topics: TopicSummary[]): PracticeStore {
  const defaults: PracticeStore = { version: 1, category: 'all', mode: 'all', saved: [], checked: {}, order: shuffle(topics.map((topic) => topic.id)), index: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!raw || raw.version !== 1) return defaults;
    const valid = new Set(topics.map((topic) => topic.id));
    const category = topics.some((topic) => topic.category === raw.category) ? raw.category : 'all';
    const mode = raw.mode === 'saved' ? 'saved' : 'all';
    const saved = Array.isArray(raw.saved) ? [...new Set<string>(raw.saved.filter((id: unknown) => typeof id === 'string' && valid.has(id)))] : [];
    const checked: Record<string, string[]> = {};
    for (const topic of topics) {
      const values = raw.checked?.[topic.id];
      if (Array.isArray(values)) checked[topic.id] = [...new Set<string>(values.filter((value: unknown) => typeof value === 'string'))];
    }
    const ids = eligible(topics, category, mode, saved);
    const order = Array.isArray(raw.order) ? [...new Set<string>(raw.order.filter((id: unknown) => typeof id === 'string' && ids.includes(id)))] : [];
    const current = Array.isArray(raw.order) ? raw.order[raw.index] : undefined;
    order.push(...shuffle(ids.filter((id) => !order.includes(id))));
    return { version: 1, category, mode, saved, checked, order, index: Math.max(0, order.indexOf(current)) };
  } catch { return defaults; }
}
