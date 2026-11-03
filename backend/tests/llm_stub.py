PRODUCT = {
    "product_name": "동네 빵", "product_description": "매일 굽는 빵",
    "product_category": "식품", "product_price": 3000, "goal": "방문 늘리기",
    "target_audience": "동네 주민", "channels": ["instagram", "x"],
    "initial_budget_amount": 100000, "initial_budget_days": 7,
}


def good_drafts(channels):
    return {"drafts": {channel: {"caption": f"{channel}에서 빵을 만나보세요", "hashtags": ["#빵"]} for channel in channels}}


class FakeLLM:
    def __init__(self, handler=None):
        self.calls = []
        self.handler = handler

    def complete(self, task, payload, output_type):
        self.calls.append((task, payload))
        value = self.handler(task, payload) if self.handler else good_drafts(payload["channels"])
        return output_type.model_validate(value)


