/// <reference types="vite/client" />
// 빌드에 들어가는 질문은 샘플 덱뿐이다. 사용자 파일과 같은 검증(parseDeck)을 거치도록 형식을 단정하지 않는다.
declare module 'virtual:sample-deck' {
  const deck: unknown;
  export default deck;
}
