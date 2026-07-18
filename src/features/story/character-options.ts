export const storyCharacters = [
  { id: "char01", name: "남자1" }, { id: "char02", name: "남자2" }, { id: "char03", name: "남자3" },
  { id: "char04", name: "딸" }, { id: "char05", name: "아들" }, { id: "char06", name: "아저씨1" },
  { id: "char07", name: "아저씨2" }, { id: "char08", name: "아줌마1" }, { id: "char09", name: "아줌마2" },
  { id: "char10", name: "여자1" }, { id: "char11", name: "여자2" }, { id: "char12", name: "여자3" },
  { id: "char13", name: "할머니1" }, { id: "char14", name: "할머니2" }, { id: "char15", name: "할아버지1" },
  { id: "char16", name: "할아버지2" },
] as const;

export const storyExpressions = [
  { id: "expr01", name: "곤란1" }, { id: "expr02", name: "곤란2" }, { id: "expr03", name: "곤란3" },
  { id: "expr04", name: "곤란4" }, { id: "expr05", name: "놀람1" }, { id: "expr06", name: "놀람2" },
  { id: "expr07", name: "눈물1" }, { id: "expr08", name: "눈물2" }, { id: "expr09", name: "못마땅" },
  { id: "expr10", name: "무표정" }, { id: "expr11", name: "미소" }, { id: "expr12", name: "분노1" },
  { id: "expr13", name: "분노2" }, { id: "expr14", name: "분노3" }, { id: "expr15", name: "분노4" },
  { id: "expr16", name: "분노5" }, { id: "expr17", name: "웃음" }, { id: "expr18", name: "정색" },
] as const;

export type CharacterOption = (typeof storyCharacters)[number];
export type ExpressionOption = (typeof storyExpressions)[number];
