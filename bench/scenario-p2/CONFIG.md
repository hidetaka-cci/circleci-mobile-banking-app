# p2 実験構成パラメータ（確認事項）

実験実施前に以下を確定し、このファイルを更新すること。

## 1. coding agent とハーネス

現行ハーネス (`run-trial-p2.sh`) は **Claude Code CLI** (`claude -p`) を使用。
Step 1 / Step 2 と同じ。

変更する場合: `run-trial-p2.sh` の `claude -p ...` 行を置換。

## 2. モデル・temperature

`run-trial-p2.sh` は `claude -p` を呼び出し、モデルは Claude Code のデフォルト設定に委ねる。
Step 1/2 と揃えるなら、実行前に `ANTHROPIC_MODEL` 等の環境変数を設定するか、
`claude -p ... --model claude-sonnet-4-6` を追加する。

**記録用（実施時に埋める）:**
- Model ID: _______________
- Temperature: default (0 → Claude Code は変更不可)

## 3. cache TTL と料金係数

| 項目 | 値 |
|---|---|
| Claude API cache TTL | 5分（デフォルト）|
| input tokens | $3.00 / 1M |
| cache_creation tokens | $3.75 / 1M（inputの1.25×）|
| cache_read tokens | $0.30 / 1M（inputの0.1×）|
| output tokens | $15.00 / 1M |

上記は claude-sonnet-4-6 の2026年7月時点レート。
モデルまたは日付が変わった場合は公式価格表で確認し更新する。

cache TTL に関する注意:
- inner arm（サイドカー高頻度）: ターン間隔が短く TTL 切れはまれ
- outer arm（CI 待ち）: CI キュー待ちで 5 分超えが発生しうる
- run-trial-p2.sh はターン間ギャップを記録しないため、TTL 超えは wall-clock から推定する
  （ギャップ > 5 分 かつ cache_creation が急増した trial は注釈に記録）

## 4. 誤り誘発の具体ベクトル（実装済み）

### 機構1（環境依存 → 誤帰属）
- **方式**: env var `PAYMENT_REFUND_LIMIT_BP`
- **テストファイル**: `miniapps/payments/__tests__/limits.test.js`
- **失敗メッセージ**: `expected NaN to be 100` → 計算バグに見える
- **サイドカーゲート**: `PAYMENT_REFUND_LIMIT_BP=10000 npx jest --ci` に設定済み
- **outer CI**: env var 未設定 → limits.test.js が失敗

### 機構2（後発の誤り）
- **方式**: `calculateRefund(payment, 'partial')` の仕様の曖昧さ
- **曖昧点**: "half the payment amount" = `amountCents/2`（5000）か `totalCents/2`（5160）か
- **識別テスト**: `refundSummary(p, 'partial')` の期待値 `'•••• 4242 — refund $51.60'`
  - 間違い（`amountCents/2`）: `$50.00` → テスト失敗
  - 正解（`totalCents/2`）: `$51.60` → テスト通過
- **後発性**: `flat`（feeCents=0）のテストは両解釈で通過するため、
  `refundSummary` のテストに来て初めて失敗が現れる
