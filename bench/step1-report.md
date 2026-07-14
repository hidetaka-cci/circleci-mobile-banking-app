# Chunk Sidecar トークン・コスト効果 — Step 1 実測レポート

**日付:** 2026-07-14
**対象リポジトリ:** `hidetaka-cci/circleci-mobile-banking-app`（`AwesomeCICD/circleci-mobile-banking-app` のfork）
**統合元ファイル:** `bench/report.md`（n=10, 通常タスク）／`bench/report-flaky.md`（n=5, flakyタスク）／`bench/step1-crosscheck.md`（Step 0との横断比較）
**参照:** `bench/step0-report.md`（Step 0, feedbackテキスト単体のトークン測定。本レポートでは結論のみ引用し、詳細はStep 0側を参照）

---

## 0. 背景

CircleCI の Chunk Sidecar は、コーディングエージェント（Claude Code等）がコード変更をローカルで検証するための、リモートのサンドボックス環境（snapshotベース）を提供する機能である。

本レポートが比較しているのは以下の2つのループである。

- **inner loop（sidecar検証）**: エージェントがコードを変更するたびに、Chunk Sidecar（`chunk validate`）がlint・セキュリティスキャン・テスト・ビルドといったゲートをリモートで実行し、結果を即座に返す。
- **outer loop（従来のCI検証）**: エージェントはローカルで検証できず、コミット・pushしてCircleCIの結果を待ち、失敗したらフィードバックを受け取って再度pushする、という従来型のサイクル。

Step 1 では、実際のClaude Codeエージェント運用において、この2つのループでwall-clock・cost・tokenがどう変化するかを、コントロールされたA/Bベンチマークで測定する。

タスクは全trial共通で「Payments mini-appのホーム画面に、パーソナライズされたwelcome subtitleと、タップ可能なSend moneyボタンを追加する」という機能追加（`bench/scenario/TASK.md`）。両miniapp（Payments・Transfers）のESLint・Jest・iOSバンドルのゲートをすべて通過することが完了条件。

---

## 1. 検証した論点の全体像

| # | 論点 | 何を比較するか | データソース | 結論のステータス |
|---|---|---|---|---|
| 1 | 1発合格タスクでの総トークン消費 | inner vs outer、会話全体 | 本レポート §2 | 確定（n=10、既知の交絡あり） |
| 2 | 複数iteration発生時のマージナルコスト | 1回余分なCIループの追加コスト | 本レポート §3 | 確定（n=5、marginal costのみ） |
| 3 | フィードバックテキスト単体の重さ | RAW/CURATED/SIDECAR出力のトークン数 | Step 0（外部参照） | 確定（Step 0側で完了） |
| 4 | 上記3視点の関係性 | feedbackテキストが会話全体に占める割合 | 本レポート §4 | 確定 |
| 5 | sidecarのバージョン・環境が測定間で揺れていないか | Step 0とStep 1で同一snapshotか | 本レポート §5 | 確定（一致を直接確認） |

この5項目で、今回集めたデータの範囲を重複なく・漏れなく説明できる。

---

## 2. 1発合格タスクでの総トークン消費（n=10）

### 2.1 headline（全10 trialのmedian、error trial含む）

| Metric | inner | outer | outer ÷ inner |
|---|--:|--:|:--:|
| Wall-clock to green | 107 s | 172 s | 1.62× |
| Cost / change | $0.128 | $0.167 | 1.30× |
| Total tokens | 210,705 | 242,362 | 1.15× |
| Agent turns | 9 | 10 | 1.11× |
| CI compute | 2.6 min | 2.5 min | 0.96×（≈同等） |
| CI pipelines | 1 | 1 | 同等 |

> **この数字にはouter-2・outer-5（CI timeout、`is_error=true`）の2 trialが含まれている。** 除外した場合（有効8 trial）の値は次の通り。

| Metric | outer（8 trial、error除外） | outer（10 trial、全体） |
|---|--:|--:|
| Wall-clock median (s) | 116 | 172 |
| Total tokens median | 168,744 | 242,362 |
| Cost median ($) | 0.112 | 0.167 |

error trialを除外すると、tokens比は **outer÷inner ≈ 0.80×** まで縮小し、むしろinner（sidecar側）の方がトークンを多く使う逆転が起きる。これは効率の逆転ではなく、次項2.2のsidecar側テストゲートの詳細出力（verbosity）が原因である。

### 2.2 過去のn=5結果（2026-06-10実施）との比較——直接比較不可

| Metric | n=5（6/10） | n=10（7/14） | 変化 |
|---|--:|--:|---|
| inner tokens median | 93,570 | 210,705 | +125% |
| outer tokens median | 170,150 | 242,362 | +42% |
| outer÷inner比 | 1.82× | 1.15× | 縮小 |
| Wall-clock比 | 1.62× | 1.62× | 不変 |
| Cost比 | 1.39× | 1.30× | 縮小 |

この2つのランは **絶対値で直接比較できない**。理由は`bench/base`のコミットが異なり、以下の環境差がある。

| | n=5のbase | n=10のbase |
|---|---|---|
| sidecarのorgID設定 | 未設定→ローカルフォールバック | 設定済み→リモートsidecar |
| testゲートのコマンド | `circleci run testsuite`（要約1行を返す） | `npx jest --ci`（テストごとの詳細出力） |

`npx jest --ci`はテスト結果を1件ずつ詳細に出力するため、inner arm側のトークンが大きく増え、outer÷inner比が縮小した。つまりn=5→n=10の比率変化は、sidecarの効率が変わったことを示すものではなく、**testゲートの出力形式が変わったこと**による測定条件の変化である。

### 2.3 CI compute データ（事後修正済み）

当初、`collect-ci.mjs`は`bench/outer-6`〜`outer-10`および複数のinner armブランチでCIパイプラインを0件と報告していた。原因はスクリプト内のCircleCIプロジェクトslugが誤って`gh/AwesomeCICD/...`（fork元）のままになっており、正しい`gh/hidetaka-cci/...`（forkリポジトリ）を参照していなかったことによる。

slugを修正して`collect-ci.mjs`を当該trialのみ再実行した結果、**全20 trialで1 pipeline・2.2〜3.3 min**のデータが取得できた（median: inner 2.6 min、outer 2.5 min）。CI compute medianがほぼ同等（0.96×≈equal）なのは、全trialともCI 1回で合格しており、追加CIループによるcompute増加が発生していないためである。なお、`outer-ci-wait.mjs`によるリアルタイムのCI status判定（`ci=success`）自体は修正前から正しい。

---

## 3. 複数iteration発生時のマージナルコスト（n=5、flakyシナリオ）

### 3.1 flaky注入の仕組み

`BENCH_INJECT_FLAKY=1`により、outer armの1回目のCI結果を強制的に「成功→失敗」に書き換え、以下のメッセージをエージェントに返す。

> "Transient infrastructure timeout（ネットワークエラーによるテストランナー起動失敗）。これはコードの欠陥ではない。アプリケーションコードを変更するな。直前のコミットを`--no-edit`で amend して再度pushせよ。"

inner armはこの注入の影響を受けない（sidecar検証のみでCIに一切触れないため）。全5 inner trialは`iters=1`。全5 outer trialは`iters=2`（各iterationで別のcommit SHAが記録されていることをharnessログで確認済み）。

### 3.2 1回余分なCIループのマージナルコスト（本レポートの核心的な数字）

各outer trialは2つのClaude Codeセッション（iter-1: 通常の作業、iter-2: flaky再試行）に分離できる。

| | iter-1（通常作業） | iter-2（flaky再試行） |
|---|--:|--:|
| Tokens median | 約600K | **123,171** |
| Cost median | 約$0.44 | **$0.130** |
| Turns median | 21 | **3** |

**1回の一時的なCI失敗のマージナルコストは、約123K tokens／$0.13／3 turns（median）。**

iter-2のトークン消費は、ほぼ全てが直前20〜25turnの会話全体の再送信（`cache_read`）であり、新規の推論ではない。エージェントは「これはインフラ起因で、コードは正しい」というメッセージを受け取り、commitをamendしてpushし、3turnで完了する。

### 3.3 通常ラン（n=10, 1-A）との比較——直接比較には交絡がある

| シナリオ | bench/base | inner tokens (med) | outer tokens (med) | outer÷inner | outer iterations |
|---|---|--:|--:|:--:|--:|
| 通常（n=10, 7/14） | `9bcd59c` | 210,705 | 242,362 | 1.15× | 1 |
| flaky（n=5, 7/14） | `aced27c` | 482,349 | 699,943 | 1.45× | 2 |

> **この2ランは異なる`bench/base`コミットを使用している。** inner armのトークンだけで2.3倍（482K vs 211K）の差があるが、これはflaky注入の効果ではなく、`aced27c`が`TASK-flaky.md`（追加の指示文）を含み、bench/base自体の状態も異なるためである。したがって**outer÷inner比（1.15×→1.45×）の変化を「flakyの純効果」として読むことはできない**。信頼できる数字は§3.2の「iter-2単独のマージナルコスト」であり、これは同一ラン内でiter-1とiter-2を分離しているため、bench/base差の影響を受けない。

### 3.4 CI compute データの汚染（ブランチ再利用）

flakyランは通常ラン（n=10）と同じブランチ名（`bench/inner-1`〜`5`、`bench/outer-1`〜`5`）を再利用したため、`collect-ci.mjs`のブランチ名によるパイプライン検索が、両ランの履歴を混在させて返している。実際に期待されるパイプライン数はinner arm 0件（ローカル検証のみでCIに触れない）、outer arm 1trialあたり2件（iter-1 + iter-2）だが、レポート上の値はこれより大きく汚染されている。**このレポートのCI compute値は信頼できない**。リアルタイムのCI status（`outer-ci-wait.mjs`の判定：全5 outer trialでiter-1失敗→iter-2成功）は正しい。

---

## 4. 3視点の統合——feedbackテキストはfloor、実際のコストはceiling

Step 0（`bench/step0-report.md`）は、検証失敗時にエージェントへ返されるテキスト単体の重さを測定した。その数字と、本レポート§2・§3のセッション全体のトークン消費を並べる。

| 指標 | 値 | セッション全体に占める割合 |
|---|--:|--:|
| Step 0: CURATED feedback（要約済みCIログ）median | 130〜203 tokens | セッション全体（210K〜242K）の0.1%未満 |
| Step 0: SIDECAR feedback（sidecar完全出力）median | 2,079〜3,384 tokens | セッション全体の0.8〜1.4% |
| §2 output token差分（outer−inner, median） | +681 tokens | セッション全体の0.3% |
| §3.2 iter-2マージナルコスト（median） | 123,171 tokens | iter-2単独の100%（比較基準） |
| Step 0の各feedback値 ÷ iter-2マージナルコスト | 0.03〜1.4% | — |

**結論:** feedbackテキストそのものの重さ（数百〜数千トークン）は、実際のエージェント運用で発生するトークン消費の**フロア（下限）でしかなく、天井（実際のコスト）ではない**。実際に支配的な要因は、**turnをまたいで会話履歴全体が毎回再送信されるコスト（`cache_read`）** である。§2のn=10ランでは outer側の`cache_read`がinner側より median 28,204 tokens多く、§3のflakyランではiter-2のコストのほぼ全てがiter-1の会話全体の再送信で占められている。

したがって、「sidecarはCIログより出力が小さいから効率が良い」という説明だけでは、実際のトークン削減効果の大きさを説明できない。効果の実体は「CIループが1回増えるたびに、その時点までの会話履歴全体を再送信するコストを避けられる」という点にある。

---

## 5. 環境の同一性確認——sidecarバージョンの一致

Step 0、本レポート§2（n=10）、本レポート§3（flaky, n=5）の3つの測定が、同一のsidecar snapshotで行われたかを直接確認した。

`hidetaka-cci/circleci-mobile-banking-app`のリモートブランチを確認した結果:

| 確認対象 | ブランチ | 最終コミット時刻 | `.chunk/config.json`の`sidecarImage` |
|---|---|---|---|
| n=10ラン（通常） | `bench/inner-6`（※注参照） | 2026-07-14 02:32 | `55034c6c-0d19-4da4-a892-c4500dd8aaa0` |
| flakyラン | `bench/inner-1` | 2026-07-14 10:51 | `55034c6c-0d19-4da4-a892-c4500dd8aaa0` |
| Step 0（step0v2ブランチより直接確認） | `step0v2/a-1` | 2026-07-13 | `55034c6c-0d19-4da4-a892-c4500dd8aaa0` |

※注1: flakyランは通常ランと同じブランチ名（`bench/inner-1`〜`5`、`bench/outer-1`〜`5`）を再利用して上書きしたため（§3.4）、現在pushされている`inner-1`〜`5`はflakyランの状態を反映している。通常ラン単体の状態を確認するには、上書きされていない`inner-6`〜`10`を参照する必要がある。

※注2: `bench/step0-report.md`はベンチマーク実行中の`git clean`により削除されており（git未追跡のため復元不可）、Step 0レポートからの直接引用による確認はできない。代替として、Step 0の測定に使用したリモートブランチ（`step0v2/a-1`等）の`.chunk/config.json`を直接確認した。なお初期のStep 0試行（`step0/scenario-*`ブランチ、現在は廃棄）は別イメージ（`8318d301-5fbd-46eb-aaf5-5f11d162d18e`）を使用していたが、これらの測定値は本レポートでは参照していない。

**3つの測定はすべて同一snapshotを使用している。** したがって、Step 0とStep 1の間、あるいはn=10ランとflakyランの間に、sidecarバージョンの違いによる交絡は存在しない。§2.2で述べたtestゲートコマンドの変化（`circleci run testsuite`→`npx jest --ci`）は、sidecarのバージョン自体ではなく`.chunk/config.json`の設定変更によるものであり、これも上記の確認で同一設定であることが分かっている。

---

## 6. 確定した事実 一覧

- inner armは1発合格タスクにおいて、outer armよりwall-clockで1.62倍速く完了する（n=10、error trial含む）
- outer armの2 trial（outer-2, outer-5）はCI timeoutで`is_error=true`となった
- error trialを除外すると、outer÷innerのtokens比は0.80×まで逆転する
- 1回の一時的なCI失敗（flaky）の追加コストは、median 123,171 tokens／$0.130／3 turns
- feedbackテキスト単体（130〜3,384 tokens）は、セッション全体のトークン消費の1.4%未満にしか相当しない
- Step 0・n=10ラン・flakyランのsidecar snapshotは完全に一致している（`55034c6c-...`）
- n=5（旧base）とn=10（新base）の結果は、testゲートのコマンド変更により絶対値で直接比較できない
- flakyランとn=10ランは異なるbench/baseを使用しており、outer÷inner比の直接比較には交絡がある

## 7. 未確定・推測のまま残っている点

- 真のインフラ障害（本物のネットワーク断・外部サービス不達）でも、今回のflaky注入と同等のマージナルコストになるかは未検証（今回は人工的な注入）
- 複数モデル・複数タスク種別での再現性は未検証（claude-sonnet-4-6・単一タスクのみ）

## 8. 既知の限界・交絡要因（まとめ）

| 要因 | 影響範囲 | 対応状況 |
|---|---|---|
| bench/base混在（3種類: `d7c48af`, `9bcd59c`, `aced27c`） | n=5⇔n=10⇔flakyランの絶対値比較 | 交絡として明記、比較を避けている |
| testゲートのverbosity変化（`circleci run testsuite`→`npx jest --ci`） | n=5⇔n=10のinner側トークン | 原因を特定済み、n=5との直接比較を放棄 |
| error trial（outer-2, outer-5のtimeout）の扱い | n=10のheadline数値 | 含む/除く両方の値を明記 |
| ブランチ名の再利用によるCI compute汚染 | flakyランのCI compute値 | 「信頼できない」と明記、リアルタイムCI statusのみ採用 |
| 人工的なflaky注入（本物のインフラ障害ではない） | §3全体の外的妥当性 | 未検証点として§7に明記 |
| n数（flaky: n=5、Step 0シナリオc: n=2） | 統計的な安定性 | medianとrangeで報告、追加サンプルは今後の課題 |
| 単一モデル・単一タスク種別 | 結果の一般化可能性 | 未検証点として§7に明記 |

---

## 9. 次のステップ

- Step 2（Cursor）で同一シナリオを別ツールで比較し、効果がツール実装依存か仕組み依存かを切り分ける
- flakyシナリオを`9bcd59c`ベースに固定した上でn=10相当に再実行し、bench/base交絡を解消した上でouter÷inner比の変化を再測定する
- 本物のインフラ障害（外部サービス不達等）でのマージナルコストを、人工注入と比較する
- Step 0のシナリオ(c)を n=2→n=3以上に追加する
