import { expect, test } from "vitest";
import { numberFormatError, parseNumberInput } from "../lib/number-input";

test("쉼표가 없거나 세 자리마다 쉼표를 넣은 숫자만 숫자로 바꾼다", () => {
  expect(parseNumberInput("50000")).toBe(50000);
  expect(parseNumberInput(" 50,000 ")).toBe(50000);
  expect(parseNumberInput("1,234,567")).toBe(1234567);
  expect(parseNumberInput("12.5")).toBe(12.5);
  for (const bad of ["", "50,00", "1,5", "5,0000", ",500", "500,", "1,,000", "abc", "-1"]) expect(parseNumberInput(bad)).toBeNull();
});

test("쉼표 위치가 틀렸을 때만 안내한다", () => {
  expect(numberFormatError("50,00")).toBe("쉼표는 세 자리마다 넣어 주세요. 예: 50,000");
  expect(numberFormatError("1,5")).not.toBeNull();
  for (const ok of ["", "50000", "50,000", "abc"]) expect(numberFormatError(ok)).toBeNull();
});
