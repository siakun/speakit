/// <reference types="vite/client" />
declare module 'virtual:interview-deck' {
  const topics: import('./types').TopicSummary[];
  export default topics;
}
declare module 'virtual:interview-details' {
  const loaders: Record<string, () => Promise<{ default: import('./types').TopicDetails }>>;
  export default loaders;
}
