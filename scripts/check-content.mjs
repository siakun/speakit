import { loadDeck } from './content.mjs';

const { topics } = await loadDeck();
console.log(JSON.stringify({
  topics: topics.length,
  categories: [...new Set(topics.map((topic) => topic.category))],
  checklistItems: topics.reduce((sum, topic) => sum + topic.checklist.length, 0),
  examples: topics.reduce((sum, topic) => sum + topic.examples.length, 0),
  topicsWithAnswerDraft: topics.filter((topic) => topic.answerDraft).length,
}, null, 2));
