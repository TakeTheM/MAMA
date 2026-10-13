# 3-harinsd404-01 Meta 광고 성과는 광고 세트의 기여 설정 기준이고, 외부 구매는 전환 시점 기준으로 집계된다

| 항목 | 내용 |
| --- | --- |
| 관점 | ③ 데이터·외부 연동 |
| 자료 종류 | 서비스 문서 |
| 제목·저자(기관)·연도 | Insights API – Limits & Best Practices · Meta for Developers · 2026-10-13 열람 |
| 찾은 곳·링크 (DOI) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/best-practices.md |
| 직접 확인 | ☑ 직접 열어 확인함 (2026-10-13) · 확인한 위치: 문서 상단 Warning 상자 (2025년 6월 10일 변경 안내) |
| 확인한 내용 | "Beginning June 10, 2025, … API responses will mimic Ads Manager settings: Attributed `value`s will be based on ad set level attribution settings … Actions will be reported using `action_report_time=mixed`: on-Meta actions (e.g., Link Clicks) will use impression-based reporting time; whereas off-Meta actions (e.g., Web Purchases) will leverage conversion-based reporting time." |
| 우리 도메인에 주는 근거 한 줄 | 웹사이트 구매 같은 전환은 광고 노출 시점이 아니라 실제 구매 시점에 잡히므로, 캠페인이 끝난 뒤에도 전환 숫자가 늘 수 있다 → 종료 직후가 아니라 기여 기간이 지난 뒤 성과를 확정해야 한다 |
| 태그 변화 | 3-3 성과 평가 확정 시점 `[추정]` 유지, 근거 보강 (기여 기간의 기본값 일수는 이 문서에 없어 확인하지 못함) |
| 반영한 곳 | 03-rules-states-llm.md 3-2 종료 → 성과 평가 완료, 3-3 규칙 4번, 3-4 L3, 3-5 |
