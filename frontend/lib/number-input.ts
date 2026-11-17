/*
 * 숫자 입력칸의 쉼표 처리.
 * 쉼표가 없는 숫자(50000)나 세 자리마다 쉼표를 넣은 숫자(50,000)만 받는다.
 * 쉼표를 모두 지우고 바꾸면 '50,00'(오타)이 5,000원으로, '1,5'가 15일로 저장되므로 그런 입력은 오류로 본다.
 */
const PLAIN = /^\d+(\.\d+)?$/;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/** 형식이 맞으면 숫자, 비었거나 형식이 틀리면 null */
export function parseNumberInput(value: string): number | null {
  const text = value.trim();
  if (!PLAIN.test(text) && !GROUPED.test(text)) return null;
  return Number(text.replace(/,/g, ""));
}

/** 쉼표 위치가 틀렸을 때 칸 아래에 보여 줄 안내. 비었거나 형식이 맞으면 null(빈 칸·음수 등은 서버 검사에 맡긴다). */
export function numberFormatError(value: string): string | null {
  const text = value.trim();
  if (!text.includes(",") || GROUPED.test(text)) return null;
  return "쉼표는 세 자리마다 넣어 주세요. 예: 50,000";
}
