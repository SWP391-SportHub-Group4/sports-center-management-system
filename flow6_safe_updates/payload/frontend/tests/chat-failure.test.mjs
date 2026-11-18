import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chatFailureMessage as message } from '../src/features/member/chat-failure.mjs';
for (const role of ['member','coach']) {
  test(`${role} fallback follows question language for timeout, rate limit and connection`, () => {
    for (const e of [null, {status:504,code:'ai_provider_timeout'}, {status:503,code:'ai_provider_rate_limited'}, {status:429,code:'x'}]) {
      assert.match(message(e,'fallback','Lịch học của tôi?'), /tôi|vui lòng|dịch vụ/i);
      assert.match(message(e,'fallback','lich hoc cua toi?'), /tôi|vui lòng|dịch vụ/i);
      assert.match(message(e,'fallback','What is my schedule?'), /I |The AI/i);
    }
  });
}
test('unknown validation errors use provided fallback', () => assert.equal(message({status:400,code:'invalid'},'fallback','What?'),'fallback'));
