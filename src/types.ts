export interface Criterion {
  id: string;
  label: string;
  criterion: string;
  detail: string;
  followup: string;
}

export interface TopicSummary {
  id: string;
  category: string;
  title: string;
  question: string;
}

export interface TopicDetails {
  checklist: Criterion[];
  followups: { question: string; answer: string }[];
  references: string;
  examples: { title: string; answer: string; metadata: string }[];
  answerDraft: string;
}

export type Topic = TopicSummary & TopicDetails;

export interface PracticeStore {
  version: 1;
  category: string;
  mode: 'all' | 'saved';
  saved: string[];
  checked: Record<string, string[]>;
  order: string[];
  index: number;
}

export interface Followup {
  question: string;
  answer: string;
  label?: string;
}
