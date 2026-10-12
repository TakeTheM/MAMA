# 1. 도메인 첫인상과 용어 사전

> 목표: 도메인을 그 일을 하거나 그 서비스를 쓰는 사람의 말로 설명할 수 있다.

## 1-1. 각자 적기 (검색 금지)

| 팀원 | 이 도메인에서 떠오르는 장면 1개 | 궁금한 점 1개 |
| --- | --- | --- |
| 임소리 | 포카 마켓 | 소상공인들이 가장 하기 귀찮거나 힘든 일은 무엇이 있을까? |
| 박하린 | 길거리노상 | 사장님들은 홍보를 보통 어떻게 하고 있을까? |
| 이규민 | 시장 국밥집 사장님 & 해운대 해리단길 분위기 있는 음식점 사장님 | 소상공인의 경제적 부담을 덜고 경제적 효과를 부각시키려면 어떻게 해야될까? |
| 윤미수 | 에이블리 | 당근마켓도 이커머스라고 할 수 있을까? |
| 김태훈 | 네이버 스마트 스토어 | 상품을 올리고 관리하는 일이 생각보다 얼마나 복잡할까? |

## 1-2. 도메인 용어 사전 (최소 10개, 계속 추가하기)

> 개발 용어가 아니라 현장에서 쓰는 말을 모읍니다. 비슷해 보이지만 다른 말을 찾으면 더 좋습니다.
> 예: 재고 vs 가용 재고, 결제 완료 vs 구매 확정(셀러 백오피스) / 페이스 vs 속도, 케이던스 vs 보폭(러닝 코칭) / 체류 기간 연장 vs 체류 자격 변경(다문화 가정 행정)

| 용어 | 뜻 (우리 말로) | 헷갈리는 비슷한 말 | 태그 | 출처 |
| --- | --- | --- | --- | --- |
| 소상공인 | 상시근로자 수 등 법에서 정한 기준을 충족하는 소규모 사업자. 업종별 기준이 다르다. | 소기업, 중소기업, 자영업자 (자영업자는 '혼자 일하는 사람'에 가까운 말이라 범위가 다름) | [사실] | law.go.kr 「소상공인기본법」 |
| 매출 | 손님에게 상품을 팔고 받은 금액 전체. 원가·수수료·배송비 같은 비용을 빼기 전 숫자라서, 매출만 보고는 얼마 남았는지 알 수 없다 | 정산금(플랫폼·PG사가 수수료를 떼고 실제로 보내주는 돈), 순이익(원가·운영비·세금까지 모두 뺀 마지막 남는 돈). 크기 순서: 매출 > 정산금 > 순이익 | [사실] | [토스페이먼츠 용어사전: 매출](https://docs.tosspayments.com/resources/glossary/revenue) |
| 마진 | 상품 하나를 팔 때 판매가에서 원가를 뺀 돈. 다만 온라인 판매에서는 플랫폼 수수료, 광고비, 배송비 등을 제외해야 실제 판매자가 얻는 이익을 알 수 있다.| 마크업(이 돈을 '원가'로 나눈 비율. 원가 18,000원·판매가 23,400원이면 마크업 30%, 마진율 약 23%). 이익(영업이익·순이익: 마진에서 운영비·세금까지 더 뺀 것). 온라인 판매는 수수료·배송비까지 빼야 실제로 남는 돈이 나온다 | [사실] | [마진율·마크업 계산 가이드](https://www.jptcalc.kr/blog/posts/margin-markup-guide.html), [기획재정부 시사경제용어사전: 영업이익](https://mofe.go.kr/sisa/dictionary/detail?idx=1843) |
| 객단가 | 고객 1명이 평균적으로 결제하는 금액. 손님이 그대로여도 객단가가 오르면 매출이 오른다 | 판매 단가(상품 하나의 가격), 객수(손님 수) | [사실] | [토스플레이스 사장님 스토리: 객단가](https://tossplace.com/story/average_transaction_value) |
| 노출수 | 광고나 상품이 손님 화면에 보인 횟수 | 클릭수(보고 눌러서 들어온 횟수), 클릭률(CTR = 클릭수 ÷ 노출수 × 100). 노출이 많아도 클릭률이 낮으면 손님이 안 들어온다 | [사실] | [오픈애즈(NHN AD): 광고 용어 제대로 이해하기](https://www.openads.co.kr/content/contentDetail?contsId=15572) |
| CPC | 광고를 한 번 클릭할 때마다 내는 돈(클릭당 비용). 보이기만 하면 돈이 안 나가고, 눌러야 돈이 나가는 방식 | CPM(광고가 1,000번 보일 때마다 내는 돈). 같은 광고비라도 무엇 기준으로 돈을 내는지가 다름 | [사실] | [Ahrefs 도움말: CPC](https://help.ahrefs.com/ko/articles/513580-cpc는-무엇의-약자입니까), [오픈애즈(NHN AD)](https://www.openads.co.kr/content/contentDetail?contsId=15572) |
| 전환율 | 광고나 상품 페이지 방문자 중 구매, 회원가입, 문의 등 원하는 행동을 한 비율. 어떤 행동을 전환으로 정하는지에 따라 계산 기준이 달라진다. 광고에서는 클릭 대비 구매율(CVR)을, 쇼핑몰에서는 방문자 대비 구매율을 사용하기도 한다. | 클릭률(보인 것 중 누른 비율). '전환'은 구매뿐 아니라 회원가입·장바구니 담기로 정하기도 해서, 무엇을 전환으로 셌는지 먼저 확인해야 함 | [사실] | [오픈애즈(NHN AD)](https://www.openads.co.kr/content/contentDetail?contsId=15572) |
| ROAS | 광고비 대비 광고로 생긴 매출. ROAS = 광고로 생긴 매출 ÷ 광고비 × 100. 300%면 광고비 1만 원으로 매출 3만 원. 실제 손익분기 ROAS는 상품 마진뿐 아니라 플랫폼 수수료, 배송비 등 비용 구조에 따라 달라진다. | ROI(매출이 아니라 '남은 돈' 기준). ROAS는 매출 기준이라 마진이 낮으면 ROAS가 높아도 손해일 수 있다 | [사실] | [오픈애즈(NHN AD)](https://www.openads.co.kr/content/contentDetail?contsId=15572) |
| 재구매율 | 기존 구매 고객 중 일정 기간 안에 다시 구매한 고객의 비율. 예: 6월 첫 구매자 중 7월에 다시 산 사람이 30%면 재구매율 30% | 재구매 고객 비중(이번 기간 전체 구매자 중 재구매자가 차지하는 비율), 재구매 주기(이번 구매와 직전 구매 사이 간격). '얼마 전 구매까지 볼지', '같은 달 여러 번 산 것을 몇 번으로 칠지'가 솔루션마다 달라 숫자를 비교하기 전에 기준부터 확인해야 함 | [사실] | [아임웹 고객 가이드: 재구매 분석 가이드](https://imweb.me/faq?category=29&category2=35&idx=72343&mode=view), [Shopify: Repeat Customers](https://www.shopify.com/blog/repeat-customers) |
| 리뷰 | 손님이 남긴 후기 글·사진·별점 | 협찬 리뷰·체험단 후기(돈·상품·할인을 받고 쓴 후기). 이때는 "상품 협찬", "광고비 지급"처럼 받은 것을 눈에 잘 띄는 곳에 표시해야 하며, 숨기면 표시광고법 위반(뒷광고)이 될 수 있다 | [사실] | [찾기쉬운 생활법령정보: 광고 표시 방법](https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=1575&ccfNo=2&cciNo=3&cnpClsNo=1), [국가법령정보센터: 추천·보증 등에 관한 표시·광고 심사지침](https://www.law.go.kr/LSW/admRulInfoR.do?admRulSeq=2100000280130) |

> AI에게 물어본 것 중 틀렸거나 애매했던 것은 [ai-check-log.md](ai-check-log.md)에 적습니다.

## 1-3. 검색어 설계

> 용어 사전에서 고른 말로 검색어를 만듭니다. 논문은 영어 검색어가 있어야 찾기 쉬우므로 한국어와 영어를 함께 적습니다. 이후의 논문·자료 조사는 이 검색어로 시작합니다. 찾아볼 곳은 [README.md](README.md#찾아볼-곳)에 있습니다.

| 관점 | 한국어 검색어 (2개 이상) | 영어 검색어 (2개 이상) | 먼저 찾아볼 곳 |
| --- | --- | --- | --- |
| ① 사람·이용 흐름 | 소상공인 온라인 마케팅 실태, 소상공인 SNS 마케팅 활용, 1인 셀러 광고 운영 방식 | small business digital marketing practices, micro-enterprise social media marketing, small online seller advertising behavior | RISS, KCI, 소상공인시장진흥공단 보고서 |
| ② 규칙·예외 | 추천·보증 표시·광고 심사지침 리뷰, 체험단 후기 경제적 이해관계 표시, 표시광고법 뒷광고 | sponsored review disclosure, endorsement guidelines influencer marketing, deceptive advertising online reviews | 국가법령정보센터(law.go.kr), 찾기쉬운 생활법령정보, 공정거래위원회 |
| ③ 데이터·외부 연동 | 네이버 검색광고 전환 추적, 스마트스토어 마케팅 통계 데이터, 키워드 광고 노출수 클릭수 | search advertising conversion tracking, e-commerce marketing analytics data, keyword advertising CTR CPC data | 각 광고 플랫폼 도움말·API 문서, 공공데이터포털 |
| ④ 기존 서비스·벤치마크 | 소상공인 마케팅 자동화 도구, 광고 성과 분석 서비스 ROAS, 리뷰 관리 서비스 비교 | marketing automation tools for small business, ad performance dashboard ROAS, online review management software | 기존 서비스 도움말·요금 안내, 기업 기술 블로그 |
| ⑤ 문제와 손해 | 소상공인 광고비 부담, 온라인 광고 ROAS 손실 마진, 소상공인 재구매율 고객 이탈 | advertising cost burden small business, unprofitable ROAS low margin, customer retention repurchase rate small retailers | KOSIS(소상공인실태조사), 중소벤처기업부 보도자료, DBpia |
