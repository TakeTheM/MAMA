import type { Channel } from "@/lib/campaign-status";
import { type ChannelCopy, CHANNEL_LIMITS } from "./model";

/*
 * 채널별 게시물 길이. 글자 수 표시와 '검수 요청' 버튼이 같은 계산을 쓴다.
 * 플랫폼에는 캡션 다음 줄에 해시태그가 같이 올라가므로 해시태그도 길이에 넣는다.
 */

/** 플랫폼에 실제로 올라가는 글 (캡션 + 줄바꿈 + 해시태그) */
export function postText(copy: ChannelCopy): string {
  const tags = copy.hashtags.join(" ");
  return [copy.caption, tags].filter(Boolean).join("\n");
}

/**
 * X 글자 수 규칙 (https://docs.x.com/fundamentals/counting-characters)
 * - 링크는 길이와 관계없이 23자
 * - 라틴 문자·일반 문장부호 범위는 1자, 그 밖(한글·한자·일본어 등)은 2자
 * - 이모지는 여러 코드로 이뤄져도 2자
 * 링크는 http(s):// 또는 www. 로 시작하는 것만 링크로 센다(도메인만 쓴 글은 X보다 길게 셀 수 있다).
 */
export const X_URL_LENGTH = 23;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/gi;

function isLightCodePoint(code: number) {
  return code <= 0x10ff || (code >= 0x2000 && code <= 0x200d) || (code >= 0x2010 && code <= 0x201f) || (code >= 0x2032 && code <= 0x2037);
}
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}
function xWeight(text: string): number {
  let total = 0;
  for (const grapheme of graphemes(text)) {
    if (/\p{Extended_Pictographic}/u.test(grapheme)) { total += 2; continue; }
    for (const char of grapheme) total += isLightCodePoint(char.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return total;
}
export function xLength(text: string): number {
  const normalized = text.normalize("NFC");
  const urls = normalized.match(URL_PATTERN) ?? [];
  return urls.length * X_URL_LENGTH + xWeight(normalized.replace(URL_PATTERN, ""));
}

/** 채널 기준 길이. X는 X 규칙, 인스타그램·틱톡은 보이는 글자(코드 포인트) 수 */
export function channelLength(channel: Channel, copy: ChannelCopy): number {
  const text = postText(copy);
  return channel === "X" ? xLength(text) : Array.from(text.normalize("NFC")).length;
}
export function isOverLimit(channel: Channel, copy: ChannelCopy): boolean {
  return channelLength(channel, copy) > CHANNEL_LIMITS[channel];
}
/** 글자 수 아래 안내: 어떻게 세는지 */
export const LENGTH_RULE: Record<Channel, string> = {
  X: "X는 해시태그까지 합쳐 세고, 한글·이모지는 2자, 링크는 길이와 관계없이 23자로 세요.",
  인스타그램: "해시태그까지 합친 글자 수예요.",
  틱톡: "해시태그까지 합친 글자 수예요.",
};
