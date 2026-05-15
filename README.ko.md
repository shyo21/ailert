# ailert

[English](./README.md) | **한국어**

AI 서비스 상태 페이지의 업데이트를 Discord로 중계하는 Cloudflare Worker입니다.

두 가지 전송 방식을 지원합니다:

- **Webhook 중계** — Statuspage가 발송하는 webhook (Claude, GitHub) 을 Worker URL 에서 수신하여 포맷된 embed 로 Discord 에 전달합니다.
- **Polling** — webhook 을 제공하지 않는 서비스 (OpenAI) 는 2분마다 Statuspage 공개 API 를 폴링하며, KV 에 저장된 이전 상태와 비교하여 새 incident 또는 변경된 incident 만 Discord 로 전송합니다.

## 지원 서비스

| 서비스  | 방식    | Statuspage page ID |
| ------- | ------- | ------------------ |
| Claude  | Webhook | `tymt9n04zgry`     |
| GitHub  | Webhook | `kctbh9vrtdwd`     |
| OpenAI  | Polling | —                  |

서비스 추가는 `src/config.ts` 를 수정합니다 (webhook 기반은 `PAGE_CONFIG`, 폴링 기반은 `POLLING_TARGETS`).

## 요구 사항

- Workers 와 KV 가 활성화된 Cloudflare 계정
- Node.js 18 이상
- 중계할 서비스마다 사용할 Discord webhook URL

## 설치 및 설정

1. 의존성 설치:
   ```sh
   npm install
   ```

2. KV 네임스페이스 생성 후 `wrangler.jsonc` 의 `id` 값을 갱신합니다 (바인딩 이름: `STATUS_STORE`):
   ```sh
   npx wrangler kv namespace create STATUS_STORE
   ```

3. Discord webhook URL 을 Worker secret 으로 등록합니다:
   ```sh
   npx wrangler secret put DISCORD_WEBHOOK_CLAUDE
   npx wrangler secret put DISCORD_WEBHOOK_GITHUB
   npx wrangler secret put DISCORD_WEBHOOK_OPENAI
   ```

   로컬 개발 시에는 `.dev.vars` 파일에 동일한 키를 작성합니다 (이 파일은 gitignore 처리되어 있습니다):
   ```
   DISCORD_WEBHOOK_CLAUDE=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_GITHUB=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_OPENAI=https://discord.com/api/webhooks/...
   ```

4. Statuspage 구독 (Claude, GitHub) 설정에서 알림 대상으로 배포된 Worker URL 을 지정합니다.

## 스크립트

| 명령어               | 설명                                          |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | `wrangler dev` 로 Worker 를 로컬 실행         |
| `npm run deploy`     | Cloudflare Workers 로 배포                    |
| `npm run check`      | 타입 검사 (`tsc --noEmit`)                    |
| `npm run cf-typegen` | Cloudflare 바인딩 타입 재생성                 |

## 동작 방식

- `fetch` 핸들러: Statuspage 페이로드를 검증하고 `page.id` 로 서비스를 조회한 뒤, `incident` 또는 `component_update` embed 를 구성하여 해당 서비스에 매핑된 Discord webhook 으로 POST 합니다.
- `scheduled` 핸들러: 2분마다 (`*/2 * * * *`) 실행되며, 각 폴링 대상의 `incidents.json` 을 가져와 최신 10건을 KV (`STATUS_STORE`) 에 저장된 상태와 비교한 뒤 신규 또는 변경된 incident 만 전송합니다.

## 프로젝트 구조

```
src/
├── index.ts                  # Worker 진입점 (fetch + scheduled 핸들러)
├── config.ts                 # 서비스 레지스트리, 색상, 상태 라벨
├── discord.ts                # Discord webhook 송신
├── types.ts                  # Statuspage + Worker 환경 타입 정의
├── formatters/
│   ├── incident.ts           # Incident → Discord embed
│   └── component.ts          # Component update → Discord embed
└── polling/
    └── status-poller.ts      # KV 상태 기반 Statuspage API 폴러
```

## OCI Notifications (Oracle Cloud)

Oracle Cloud Infrastructure Monitoring 알람을 Discord로 받습니다.

### 일회성 설정

1. webhook 시크릿 생성: `openssl rand -hex 32`. 값을 기록해 둡니다.
2. 시크릿을 워커에 등록: `npx wrangler secret put OCI_WEBHOOK_SECRET` (프롬프트에 값 붙여넣기).
3. Discord webhook URL 등록: `npx wrangler secret put DISCORD_WEBHOOK_OCI`.
4. 배포: `npm run deploy`.

### 알람별 설정 (OCI 측)

1. OCI Notifications에서 **Topic**을 생성하거나 기존 Topic을 재사용합니다.
2. 해당 Topic에 **HTTPS Subscription**을 추가합니다. URL:
   `https://ailert.<cf-계정>.workers.dev/oci/<OCI_WEBHOOK_SECRET>`
   워커가 자동 confirm 하므로 몇 초 안에 `ACTIVE` 상태가 됩니다.
3. Monitoring **Alarm**을 만들고 destination을 위 Topic으로 지정합니다.

이 엔드포인트로 들어오는 모든 알람은 하나의 Discord 채널(`DISCORD_WEBHOOK_OCI`)로 전달됩니다.

## 라이선스

별도 명시된 라이선스가 없으며 기본적으로 모든 권리는 작성자에게 있습니다. OSS 라이선스 추가가 필요하시면 issue 를 열어 주세요.
