# CLAUDE.md — lupa-mcp 세션 인수인계

> 최종 갱신: 2026-08-26. 본체: `/Volumes/WD_NVMe_1T/DEV/Lupa` (macOS 앱).
> **문서 규칙: 작업 MD는 최상위 폴더에** (본체와 같은 규칙).

## 1. 무엇인가

Lupa의 동봉 CLI(`lupa-search`)를 감싸는 **로컬 stdio MCP 서버**. 목적은 킬러 기능
("AI 에이전트 연합")을 Claude Code 하나가 아니라 **모든 MCP 클라이언트**로 넓히는 것.

- 도구 둘: `lupa_search`(검색) · `lupa_read`(인덱스 본문 읽기 = `--content`)
- Node ESM + `@modelcontextprotocol/sdk`. npm 배포(`npx -y lupa-mcp`) — `kordoc`과 같은 방식
- 스모크 테스트: `node test/smoke.js [검색어]` — 실제 클라이언트처럼 stdio로 말을 건다

## 2. 절대 어기면 안 되는 것

- **인덱싱을 여기서 하지 않는다.** 이 서버는 앱이 만든 인덱스를 **읽기만** 한다.
  자체 인덱서를 넣는 순간 (a) 전체 디스크 접근이 필요해지고 (b) **특허 청구항의 전제인
  "도구에 문서 접근 자격이 없다"가 깨진다.** 본체 `CLAUDE.md` §6의 규칙과 같다.
- **원격/호스팅 변형을 만들지 않는다.** 인덱스는 사용자 Mac에 있고, "네트워크 접근 자체가
  없다"가 제품의 정체성이다. stdio 로컬 전용.
- **기기 전용 경로 하드코딩 금지.** 탐색 순서는 `src/cli.js`의 `findLupaSearch()`:
  `LUPA_SEARCH_PATH` → `/Applications/Lupa.app` → `~/Applications` → `Lupa-dev.app` →
  `/usr/local/bin` → `/opt/homebrew/bin`. 예전에 하드코딩으로 옛 DB를 보는 사고가 났다(8/21).
- **과금 게이트를 넣지 않는다.** 게이트는 앱의 **인덱싱 시점**에 이미 걸린다(무료 5만 개).
  에이전트 통로는 무료로 연다 — 확산이 곧 특허 실시예이자 논문 사례다.

## 3. 알아둘 사실

- **`--content`는 앱 1.1부터** 들어간다. App Store v1.0.2에는 없어서 종료 코드 64가
  떨어진다. `supportsContent()`가 `--help`를 한 번 훑어 캐시하고, 없으면 업데이트 안내를
  낸다. **앱 1.1이 나가면 이 경로가 저절로 살아난다.**
- CLI 종료 코드 계약(본체 `CLI_GUIDE.md`): 0 정상 · 1 검색 실패 · 2 인덱스 없음 ·
  3 본문 없음 · 64 인자 오류. `src/cli.js`의 `EXIT_MESSAGES`가 이걸 사람 말로 옮긴다.
- 검색 문법 치트시트는 **도구 설명에 박아 넣었다**(`QUERY_SYNTAX`). Claude Code 플러그인은
  스킬로 가르치지만 다른 클라이언트에는 스킬이 없기 때문이다. **본체 문법이 바뀌면 여기도 고칠 것.**
- 토큰 효율은 이 서버의 존재 이유 중 하나다(특허 축 #2). `trimResult()`로 필드를 줄이고
  스니펫을 자른다. **결과에 필드를 늘릴 때는 토큰 비용을 먼저 생각할 것.**

## 4. 상태

- 스모크 테스트 6개 전부 통과 (App Store판·v2.0 CLI 양쪽에서 확인)
- **아직 npm에 배포하지 않았다.** 배포 전 할 일: GitHub 저장소 생성(`paeyoungpark-web/lupa-mcp`),
  LICENSE 파일 추가, `npm publish`
- 배포 후 본체 `CLAUDE.md` §1의 에이전트 연동 줄과 lupa.kr에 설치 안내 추가

## 5. 다음

1. npm 배포 + GitHub 공개
2. 앱 1.1 출시 후 `lupa_read` 실동작 재확인
3. 본체 문서·홈페이지에 설치 안내 반영
4. **특허 세션에 전달**: MCP 서버는 CLI·App Intents와 함께 **같은 발명의 세 번째 실시예**다.
   청구항을 "명령줄 도구"로 좁게 쓰면 이게 빠진다.
