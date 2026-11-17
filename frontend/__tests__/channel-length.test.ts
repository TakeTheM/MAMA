import { expect, test } from "vitest";
import { channelLength, postText, xLength } from "../features/campaigns/channel-length";

test("X 규칙: 라틴 1자, 한글 2자, 이모지 2자, 링크 23자", () => {
  expect(xLength("abc")).toBe(3);
  expect(xLength("가나다")).toBe(6);
  expect(xLength("👍")).toBe(2);
  expect(xLength("👨‍👩‍👧")).toBe(2);
  expect(xLength(`https://example.com/${"a".repeat(200)}`)).toBe(23);
  expect(xLength("상품 www.example.com/p")).toBe(4 + 1 + 23);
  expect(xLength("“따옴표”")).toBe(1 + 6 + 1);
});

test("해시태그도 게시물 길이에 넣는다", () => {
  const copy = { caption: "가나", hashtags: ["#a", "#b"] };
  expect(postText(copy)).toBe("가나\n#a #b");
  expect(channelLength("X", copy)).toBe(4 + 1 + 5);
  expect(channelLength("인스타그램", copy)).toBe(2 + 1 + 5);
  expect(channelLength("틱톡", { caption: "", hashtags: [] })).toBe(0);
});
