# AI のトークン消費を抑えるために、CI とローカル検証の粒度を整理する

AI コーディングエージェントは、コードを書くとすぐにコミットして CI に投げます。CI の結果が数分後に返る頃には、エージェントは次の作業に移っていて、失敗の文脈を失っています。エージェントはその失敗を読み直し、状況を再構築してから修正に入るため、CI を往復するたびにトークンを消費します。

この記事は、その往復で受け取るフィードバックの重さを実測したベンチマークの報告です。CI の生ログをそのままエージェントに渡す場合と、[Chunk sidecar](https://circleci.com/blog/chunk-sidecars/) の検証出力を渡す場合とで、フィードバック 1 回分のトークン数を比較しました。

:::note
これは CircleCI 自身の製品（Chunk sidecar）を対象にした計測です。自社ベンチマークは読者の不信を招きやすいため、比較の公平性・計測環境・再現手順をできる限り明示します。数値はすべて公開リポジトリ上で著者が実測したもので、全サンプルと手順は再現できる形で示します。
:::

## 要約

同一の失敗に対して、エージェントが受け取るフィードバックのトークン数を計測しました。少ないほど良い指標です。

- CI の生ログをそのまま渡す場合（RAW）: 中央値 20,000〜22,000 トークン
- Chunk sidecar の検証出力を渡す場合（SIDECAR）: 中央値 2,000〜3,400 トークン
- 差は **6.5〜9.9 倍**、フィードバック 1 回分で **約 85〜90% のトークン削減**

ただしこの削減率はフィードバック 1 回分のテキストに対する値であり、タスク全体のトークン削減とは別物です。後述の考察で、両者を混同しないための線引きを示します。

---

## 背景

AI エージェントがコードを高速に生成する結果、検証を通していないコミットが CI に大量に流れ込みます。CircleCI はこの状況を、パイプラインが詰まりトークンが浪費され、活動量と成果の乖離が広がる問題として説明しています。CI のフィードバックはエージェントが次に進んだ後に返るため、状況の再構築にトークンがかかります。

Chunk sidecar は、プロジェクトのスタックを写した軽量な Linux 環境を、ローカルの開発ループの中で走らせ、push なしで検証を回す仕組みです。ここで検証したのは、この sidecar が返すフィードバックが、CI の生ログと比べてどれだけ軽いかという 1 点です。

---

## 計測方法

### 比較の公平性

比較対象は「1 回の失敗に対してエージェントが受け取るフィードバックのテキスト」です。RAW と SIDECAR は、同一の失敗コミットから取得しています。トークン数は全サンプルで同一モデル（claude-sonnet-4-6）の `count_tokens` で測りました。異なる失敗どうしを比べる不公平（apples versus oranges）を避けるため、各サンプルで同じ失敗を発生させ、そのフィードバックを 2 通りの方法で取得しています。

RAW は、CI の生ログをそのままエージェントに渡す素朴な既定状態を表します。並列ジョブ全体・全ステップの出力を結合し、ANSI エスケープを除去したものです。加工した比較対象ではなく、最も出力量の多い無加工の状態を基準に置いています。

### 計測環境

計測は公開デモリポジトリ `AwesomeCICD/circleci-mobile-banking-app` を fork し、一部手順を簡略化した公開 fork 版（`hidetaka-cci/circleci-mobile-banking-app`）で実施しました。sidecar はローカルではなく、CI と同じ Linux 環境をリモートで用意して実行します。実際に確認したところ、ホストはローカルの macOS とは別で、Ubuntu 24.04 上で動いていました。

依存パッケージのキャッシュは snapshot で温めた状態に固定しています。snapshot はセットアップ後の環境を凍結してクラウドに保存する仕組みで、依存キャッシュ入りの sidecar から起動すると `~/.npm` に 113MB のキャッシュが復元され、`npm ci` はダウンロードなしに約 10 秒で完了します。全サンプルでこの温まった状態をそろえています。

### 計測した系列

フィードバックのテキストを 2 系列で測りました。主系列は次の 2 つです。

- RAW: CI の全ジョブ・全ステップの生ログを結合したもの
- SIDECAR(full): `chunk validate --remote` の出力そのもの（`npm ci` が出す非推奨警告を含む）

参考として、SIDECAR(full) から npm の警告と CLI のヘッダー行を除いた SIDECAR(clean) も測りました。その他の系列と全サンプルの数値は、公開リポジトリの計測記録にまとめています。

### 2 つの失敗シナリオ

失敗の原因によってフィードバックの中身が変わるため、代表的な 2 種類を選びました。

- シナリオ (a) アプリ起因: `miniapps/payments/src/` に ESLint の未使用変数違反を 1 件混入し、lint を失敗させます（n=3）。この検証は sidecar の gate に含まれるため、sidecar もこの失敗を検出します。
- シナリオ (b) インフラ起因: `.circleci/config.yml` に、未設定の環境変数を参照して `exit 1` するステップを追加します（n=5）。コードは変更しません。このステップは gate の外にあるため、sidecar は gate の範囲を全通過と報告します。

`count_tokens` は同一テキスト・同一モデルでは決定的な値を返すため、同じテキストを繰り返し測ることはしていません。反復の単位は失敗の作り直しで、揺れるのは入力側だけです。

### sidecar の gate 構成

`chunk validate` が実行する検証は `.chunk/config.json` で定義します。`role: gate` を付けた検証だけが pass/fail の判定に使われます。

```json
{
  "commands": [
    { "name": "install-payments",     "run": "cd miniapps/payments && npm ci",               "remote": true },
    { "name": "install-transfers",    "run": "cd miniapps/transfers && npm ci",               "remote": true },
    { "name": "lint-payments",        "run": "cd miniapps/payments && npm run lint",          "role": "gate", "remote": true },
    { "name": "lint-transfers",       "run": "cd miniapps/transfers && npm run lint",         "role": "gate", "remote": true },
    { "name": "scan-payments-trivy",  "run": "cd miniapps/payments && trivy fs --severity HIGH,CRITICAL --exit-code 1 ...", "role": "gate", "remote": true },
    { "name": "scan-transfers-trivy", "run": "cd miniapps/transfers && trivy fs ...",         "role": "gate", "remote": true },
    { "name": "test-payments",        "run": "cd miniapps/payments && npx jest --ci",         "role": "gate", "remote": true },
    { "name": "test-transfers",       "run": "cd miniapps/transfers && npx jest --ci",        "role": "gate", "remote": true },
    { "name": "bundle-payments",      "run": "cd miniapps/payments && npm run bundle:ios",    "role": "gate", "remote": true },
    { "name": "bundle-transfers",     "run": "cd miniapps/transfers && npm run bundle:ios",   "role": "gate", "remote": true }
  ],
  "validation": { "sidecarImage": "<snapshot-id>" },
  "orgID": "<org-id>"
}
```

ESLint・Trivy（HIGH/CRITICAL）・Jest・iOS メトロバンドルの 4 種類、payments と transfers の 2 アプリ分、計 8 gate です。シナリオ (b) のインフラステップ（未設定 env var の `exit 1`）は CI パイプライン固有のステップで gate の外にあるため、sidecar の判定には含まれません。

---

## 結果

RAW と SIDECAR(full) の中央値を並べると、フィードバック 1 回分のトークン数は sidecar 側が大きく下回ります。

（図: RAW と SIDECAR のトークン数を並べた棒グラフ。Qiita 公開時に画像として添付します）

数値は次のとおりです。範囲は最小〜最大で、サンプル間の揺れの小ささを示します。

| 指標 | (a) アプリ起因 ESLint（n=3） | (b) インフラ起因 env var（n=5） |
|---|--:|--:|
| RAW 中央値 | 20,537（20,208–20,568） | 22,121（21,885–22,362） |
| SIDECAR(full) 中央値 | 2,079（2,077–2,079） | 3,382（3,376–3,529） |
| RAW ÷ SIDECAR(full) | 9.9×（9.7–9.9） | 6.5×（6.2–6.6） |
| 削減率（RAW 基準・少ないほど良い） | 約 90% | 約 85% |

RAW ÷ SIDECAR の範囲は (a) が 9.7〜9.9、(b) が 6.2〜6.6 と、サンプルを作り直してもほとんど動きません。特定のサンプルを選んだ結果ではないことを示すために、中央値だけでなく n と範囲を併記しています。

### npm ノイズの内訳

SIDECAR(full) には `npm ci` が出す非推奨警告が含まれ、これがトークン数の相当部分を占めます。警告を除いた SIDECAR(clean) と比べると、その差が見えます。

| シナリオ | SIDECAR(full) 中央値 | SIDECAR(clean) 中央値 | full ÷ clean |
|---|--:|--:|--:|
| (a) アプリ起因 | 2,079 | 372 | 5.6× |
| (b) インフラ起因 | 3,382 | 1,675 | 2.0× |

シナリオ (a) は lint 失敗で早期終了するため、警告を除くと 372 トークンまで小さくなります。sidecar の出力をエージェントに渡す運用では、この警告ノイズの扱いも削減の余地になります。

参考として、CircleCI の CURATED フィードバック（失敗ステップのみを選別した要約ログ）との比較も示します。

| フィードバック種別 | (a) ESLint | (b) インフラ |
|---|--:|--:|
| RAW | 20,537 | 22,121 |
| SIDECAR(full) | 2,079 | 3,382 |
| SIDECAR(clean) | 372 | 1,675 |
| CURATED（要約CIログ） | 130 | 168 |

CURATED は失敗ジョブの末尾ログだけを抽出したもので最も小さいですが、シナリオ (b) では sidecar は gate 外のインフラ失敗を含まないため、エージェントに届く情報の内容が異なります。RAW・SIDECAR・CURATED は「軽さ」だけでなく「何を伝えるか」も異なります。

---

## 考察

### フィードバック 1 回分の削減と、タスク全体の削減は別物

フィードバック 1 回分のテキストは、生ログをそのまま渡す場合と比べて 6.5〜9.9 倍軽くなります。ただし、この 85〜90% がそのままタスク全体の削減になるわけではありません。フィードバックのテキストは、エージェントとの会話全体のごく一部にすぎないためです。

同一タスク（Payments のホーム画面に welcome subtitle と Send money ボタンを追加し、全 gate を通過させる）をエージェントに実行させ、2 つのアプローチで会話全体のトークンを比較しました。

- **inner loop（sidecar 検証）**: エージェントの Stop hook で `chunk validate` を実行し、失敗があれば次のターンに注入する。エージェントは CI に push せず、sidecar のみで検証を完結させる。
- **outer loop（従来 CI）**: エージェントは push のみ行い即座に停止。ハーネスが CircleCI の完了を待ち、失敗ログを `--resume` で注入する。エージェントはローカルで npm・jest・chunk を一切実行できない。

n=5 の単一タスク計測（2026-06-10 実施、bench/base = `d7c48af`）:

| 計測対象 | inner（sidecar）| outer（CI 待ち）| outer ÷ inner |
|---|--:|--:|--:|
| 会話全体のトークン（中央値） | 93,570 | 170,150 | 1.82× |
| wall-clock（中央値） | — | — | 1.62× slower |
| コスト（中央値） | — | — | 1.39× more |

error trial を除いた n=10 最新計測（2026-07-14、bench/base = `9bcd59c`）でも wall-clock 比は同じ 1.62× でした。

:::note
1.82× は単一タスク・単一モデル（claude-sonnet-4-6）の n=5 計測値です。API のトークン消費のみが対象で、CI の実行時間や人的コストは含みません。
:::

### なぜ「フィードバック 9.9 倍」がそのまま「セッション全体 9.9 倍」にならないのか

n=10 計測のトークン内訳を arm 別に集計すると、構造が見えます。

| トークン種別 | inner 中央値 | outer 中央値 | outer − inner |
|---|--:|--:|--:|
| fresh input | 10 | 11 | +1 |
| output | 1,631 | 2,312 | **+681** |
| cache_read | 197,396 | 225,600 | **+28,204** |
| cache_creation | 12,044 | 13,521 | +1,477 |
| **合計** | **210,705** | **242,362** | **+31,657** |

outer と inner の差（+31,657 トークン）の内訳:

- cache_read の差: +28,204（**差全体の 89%**）
- cache_creation の差: +1,477（5%）
- output の差: +681（2%）
- フィードバックテキスト本体: 130〜3,384 トークン（**差全体の 0.4〜11%**）

支配的な要因は**ターンをまたいで会話履歴全体が毎回再送信される cache_read** です。フィードバックテキストの重さは差全体のごく一部にしか相当しません。

1 ターンあたり 10〜26 トークンしかない fresh input がほぼ等しいこと（+1）は、両アームが同じ作業を行っていることの確認でもあります。

### 1 回の一時的な CI 失敗で何が起きるか（flaky シナリオ）

CI がたまたまインフラ障害で失敗し、コードは正しいにもかかわらず再 push が必要になった場合のコストを測りました（n=5、bench/base = `aced27c`）。outer arm の 1 回目の CI 成功を強制的に「失敗」に書き換え、以下のメッセージを注入します。

> "Transient infrastructure timeout（ネットワークエラーによるテストランナー起動失敗）。コードの欠陥ではない。アプリコードを変更するな。直前のコミットを `--no-edit` で amend して再度 push せよ。"

inner arm はこの注入の影響を受けません（CI に push せず sidecar のみで検証するため）。全 5 outer trial が 2 iteration（iter-1: 通常作業 + iter-2: flaky 再試行）になりました。iter-2 の実数:

| | outer-1 | outer-2 | outer-3 | outer-4 | outer-5 | **中央値** |
|---|--:|--:|--:|--:|--:|--:|
| iter-2 turns | 3 | 3 | 3 | 3 | 3 | **3** |
| iter-2 cost ($) | 0.1622 | 0.0981 | 0.1503 | 0.1165 | 0.1302 | **$0.130** |
| iter-2 tokens | 132,741 | 99,902 | 134,011 | 112,878 | 123,171 | **123,171** |
| iter-2 cache_read | 102,163 | 81,378 | 103,929 | 89,999 | 96,977 | **96,977** |

**1 回の一時的な CI 失敗のマージナルコスト: 約 123K tokens・$0.13・3 ターン・+200 秒**

iter-2 の 123K トークンのうち **97K（79%）が cache_read**、つまり iter-1 の 20〜25 ターン分の会話履歴をそのまま再送信しているコストです。新規推論（output トークン）は 255〜560 トークンにすぎません。エージェントは「インフラ起因だ、コードは変えるな」を読み取り、amend して push し、3 ターンで完了します。

これは Step 0 で測ったフィードバックテキスト（CURATED 130〜168、SIDECAR full 2,079〜3,384 トークン）と並べると、フィードバック本文が実際のマージナルコストの 0.1〜2.7% にすぎないことが分かります。

### インフラ起因の失敗で sidecar が返すもの

シナリオ (b) では、CI の生ログに `FATAL: XXX is not set` というインフラエラーが含まれるのに対し、sidecar は gate の範囲（lint / scan / test / bundle）の結果だけを返し、gate の外にある追加ステップのエラーは含みません。これは検証項目を gate として定義しているかどうかによる構成上の帰結です。

:::note
このフィードバックの差でエージェントが実際にどう振る舞うか（インフラ起因の失敗をコードのバグと取り違えるかどうか）は、本計測では確かめていません。構成上そうなりうるという観察にとどめ、エージェントの実挙動は別途計測する予定です。結果が出たらこの記事を更新します。
:::

### 限界事項

- シナリオ (b) は、未設定の環境変数で決定的に `exit 1` させた擬似的な失敗です。ネットワーク断のような本物の flaky なインフラ障害の揺れの代理ではありません。
- RAW は並列 2 ジョブの全出力を含みます。早期に失敗しても、もう一方の成功ジョブの出力が RAW を押し上げます。
- 削減率は無加工の生ログ（RAW）を基準にした値です。フィードバックを別途加工した場合の基準ではありません。
- 計測は単一モデルで、フィードバックのテキスト単体を対象にしています。エージェントの会話全体の挙動は別の計測です。
- n=10 計測では outer-2・outer-5 の 2 trial が CI timeout（wall-clock 1,018〜1,071 秒）で `is_error=true` となった。これらを含む median を headline に使用している。除外すると outer tokens median は 168,744（inner の 0.80×）まで縮小し、むしろ inner 側が多くなる。これは sidecar の `npx jest --ci` が詳細なテスト結果を 1 件ずつ出力するため inner 側の cache_read が膨らんでいることが原因で、効率の逆転ではない。
- n=5（旧 bench/base）と n=10（新 bench/base）・flaky ラン（別 bench/base）は絶対値で直接比較できない。bench/base が異なるとテストゲートのコマンド（`circleci run testsuite` vs `npx jest --ci`）と sidecar 設定が変わり、inner arm のトークン消費が大きく変動する。

### 検証の粒度をどう分けるか

この結果が示すのは、検証を内側ループと外側ループのどちらに置くかで、往復のたびに受け取るフィードバックの重さが変わることです。lint・ユニットテスト・フォーマットのようなコード単体で完結する基本チェックを内側ループ（sidecar）に寄せると、CI の往復回数が減り、往復ごとのフィードバックも軽くなります。結合テスト・E2E・セキュリティスキャン・コンプライアンスのような共有環境が必要な検証は、手元では再現できないため CI に残します。

これは CI を減らすための整理ではありません。CircleCI も、基本的な失敗を手元で直すことでパイプラインには重い検証に進める準備ができたコードだけが届き、CI は結合やデプロイという本来の役割に専念できると説明しています。sidecar は CI を置き換えるものではありません。

---

## 再現手順

同じ計測を再現する手順です。ソースは公開 fork [`hidetaka-cci/circleci-mobile-banking-app`](https://github.com/hidetaka-cci/circleci-mobile-banking-app)（fork 元は公開の [`AwesomeCICD/circleci-mobile-banking-app`](https://github.com/AwesomeCICD/circleci-mobile-banking-app)）にあります。

1. 失敗を作る。シナリオ (a) は `miniapps/payments/src/` に未使用変数を 1 件加えます。シナリオ (b) は `.circleci/config.yml` に未設定 env var を参照して `exit 1` するステップを加えます。
2. RAW を取る。CircleCI API v1.1 のジョブ出力から全ステップのログを結合し、ANSI を除去します。
3. SIDECAR を取る。同じ失敗コミットに対して `chunk validate --remote` を実行し、出力全文を保存します。
4. トークンを測る。各テキストを同一モデルの `count_tokens` に渡します。決定的なので、テキストごとに 1 回で確定します。

`.chunk/config.json` のどの検証を gate にするかで、sidecar が見る範囲が決まります（上記「sidecar の gate 構成」参照）。

（スクリーンショット: `chunk validate --remote` のリモート実行出力）

:::note
Chunk sidecar の提供状況は変わります。2026 年 7 月時点では、無料プランを含むすべての CircleCI プランで利用できます。当初は Performance / Scale プラン向けの Preview として提供されていました。最新の状況は公式の[製品ページ](https://chunk.ai/)および[変更履歴](https://circleci.com/changelog/)で確認してください。
:::

### A/B ベンチマーク（Step 1）の実行方法

フィードバックテキスト単体（Step 0）ではなく、エージェントの会話全体でトークンを比較したい場合のベンチマーク設計を示します。

#### アームの設計

2 つのアームを同一タスクで走らせます。

**inner arm（sidecar 検証）**

Claude Code の `.claude/settings.json` に Stop hook を設定し、毎ターン終了後に `chunk validate` を実行させます。npm・jest・eslint などのローカルコマンドはすべて Allow リストにあり、`chunk:*` のみ許可します。

```json
{
  "permissions": { "allow": ["Bash(chunk:*)"] },
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "chunk validate", "timeout": 600 }] }]
  }
}
```

エージェントは `chunk validate` の結果を受けて修正を繰り返し、全 gate 通過後に commit・push して終了します。ハーネスは 1 回のエージェント呼び出しで完結します。

**outer arm（従来 CI）**

ローカル検証コマンドをすべて Deny し、git 操作のみを許可します。Stop hook はありません。

```json
{
  "permissions": {
    "allow": ["Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)", "..."],
    "deny":  ["Bash(npm:*)", "Bash(npx:*)", "Bash(jest:*)", "Bash(chunk:*)"]
  }
}
```

エージェントは commit・push 後に停止します。ハーネスが `outer-ci-wait.mjs` で CircleCI の完了を待ち、失敗ログを `claude --resume` で注入します。CI が成功するまで繰り返します。

#### トークン計上の方法

Claude Code の `--output-format json` 出力は 4 フィールドを返します。

```
input_tokens          : 未キャッシュの新規入力（1 試行あたり 7〜26 トークン）
output_tokens         : エージェントの生成出力
cache_read_input_tokens  : キャッシュから読んだ入力（会話履歴の再送信が主体）
cache_creation_input_tokens : キャッシュ書き込み（新規コンテキストのキャッシュ化）
```

合計 = 4 フィールドの和として集計します。outer arm は複数 iteration になるため、全 `iter*.json` を合計します（最終 iteration のみのコピーを使うと cost が過小になる）。

#### bench/base による分離

各 trial は `bench/base` ブランチ（`origin/main` からカット、CI で green 確認済み）から切り出した throwaway ブランチで開始します。これにより全 trial が同一の開始コミットから始まり、タスク完了前の状態が baseline として固定されます。

---

## まとめと次のステップ

同一の失敗に対して、CI の生ログをそのまま渡す場合と Chunk sidecar の検証出力を渡す場合とで、フィードバック 1 回分のトークン数を比較すると、sidecar 側が 6.5〜9.9 分の 1 でした。ただしこれはフィードバック 1 回分の値で、タスク全体の削減（今回の単一タスクで約 45%）は主に CI の往復回数が減ることから生まれます。さらに、会話全体での outer−inner の差を分解すると、89% が cache_read（会話履歴の再送信コスト）であり、フィードバックテキスト本体は差全体の 0.4〜11% にすぎません。基本チェックを内側ループに寄せ、CI は共有環境が必要な検証に専念させる、という粒度の整理が要点です。

エージェントがインフラ起因の失敗をコードのバグと取り違えるかどうかの実挙動は、別途計測して本記事を更新します。生成 AI の出力は非決定的なため、ここで示した数値も含め、判断の前には自分の環境で計測して確かめることをおすすめします。

Chunk sidecar を試す手順です。

1. [Chunk CLI](https://github.com/CircleCI-Public/chunk-cli) を `brew install CircleCI-Public/circleci/chunk` でインストールする
2. `chunk auth set circleci` で認証し、プロジェクトで `chunk init` を実行する
3. `chunk validate --remote` でリモート検証を実行し、gate の範囲を確認する
4. どの検証を gate（内側）に置き、どれを CI（外側）に残すかを見直す

より詳しく学ぶには、次の公式記事が参考になります。

- 概要: [Introducing Chunk sidecars](https://circleci.com/blog/chunk-sidecars/)
- エージェントのフックと連携させる: [Wire Chunk sidecars into agent hooks](https://circleci.com/blog/chunk-sidecar-agent-hooks/)
- 環境の立ち上げを速くする: [Chunk sidecar snapshots](https://circleci.com/blog/chunk-sidecar-snapshots/)

---

## 付録: 全数値一覧（Step 0 フィードバックテキスト計測）

### シナリオ (a): ESLint 未使用変数（n=3）

| sample | RAW | SIDECAR(full) | SIDECAR(clean) | CURATED |
|---|--:|--:|--:|--:|
| 1 | 20,568 | 2,077 | 370 | 130 |
| 2 | 20,208 | 2,079 | 372 | — |
| 3 | 20,537 | 2,079 | 372 | — |
| **中央値** | **20,537** | **2,079** | **372** | **130** |

### シナリオ (b): インフラ起因 env var（n=5）

| sample | RAW | SIDECAR(full) | SIDECAR(clean) | CURATED |
|---|--:|--:|--:|--:|
| 1 | 21,885 | 3,376 | 1,673 | 168 |
| 2 | 22,362 | 3,376 | 1,675 | — |
| 3 | 22,121 | 3,529 | 1,675 | — |
| 4 | 22,016 | 3,376 | 1,673 | — |
| 5 | 22,148 | 3,382 | 1,675 | — |
| **中央値** | **22,121** | **3,382** | **1,675** | **168** |

> CURATED のサンプル数が少ない（各シナリオ n=1）のは、要約ログは決定的なテキストを 1 回測れば十分なためです。

### Step 1 per-trial トークン内訳（n=10 通常ラン、inner arm）

| trial | fresh_in | output | cache_read | cache_create | total |
|---|--:|--:|--:|--:|--:|
| 1 | 11 | 1,556 | 223,510 | 11,356 | 236,433 |
| 2 | 14 | 2,284 | 307,766 | 12,398 | 322,462 |
| 3 | 15 | 3,085 | 344,162 | 13,663 | 360,925 |
| 4 | 13 | 2,099 | 283,893 | 12,551 | 298,556 |
| 5 | 26 | 7,244 | 692,930 | 21,795 | 721,995 |
| 6 | 7 | 1,632 | 117,135 | 11,286 | 130,060 |
| 7 | 9 | 1,629 | 171,281 | 12,058 | 184,977 |
| 8 | 9 | 1,595 | 171,198 | 12,029 | 184,831 |
| 9 | 8 | 1,375 | 140,698 | 10,348 | 152,429 |
| 10 | 9 | 1,590 | 168,913 | 11,456 | 181,968 |

### Step 1 per-trial トークン内訳（n=10 通常ラン、outer arm）

| trial | fresh_in | output | cache_read | cache_create | total | error |
|---|--:|--:|--:|--:|--:|:-:|
| 1 | 18 | 6,395 | 448,443 | 18,827 | 473,683 | ✓ |
| 2 | 18 | 2,983 | 437,570 | 15,171 | 455,742 | ✗ timeout |
| 3 | 21 | 7,381 | 563,771 | 20,824 | 591,997 | ✓ |
| 4 | 21 | 12,391 | 558,294 | 24,526 | 595,232 | ✓ |
| 5 | 13 | 4,615 | 281,638 | 15,629 | 301,895 | ✗ timeout |
| 6 | 8 | 1,416 | 143,609 | 11,870 | 156,903 | ✓ |
| 7 | 8 | 1,268 | 142,482 | 10,927 | 154,685 | ✓ |
| 8 | 8 | 1,238 | 142,369 | 10,890 | 154,505 | ✓ |
| 9 | 8 | 1,571 | 141,703 | 10,686 | 153,968 | ✓ |
| 10 | 9 | 1,640 | 169,561 | 11,618 | 182,828 | ✓ |

outer-2 と outer-5 は CircleCI パイプラインが 900 秒のタイムアウト前に完了せず `is_error=true`。wall-clock はそれぞれ 1,071 秒・1,018 秒。

### Step 1 flaky ラン iter-2 の内訳（1 回余分な CI 失敗のマージナルコスト）

| trial | turns | cost ($) | output | cache_read | cache_create | total |
|---|--:|--:|--:|--:|--:|--:|
| outer-1 iter2 | 3 | 0.1622 | 1,498 | 102,163 | 29,075 | 132,741 |
| outer-2 iter2 | 3 | 0.0981 | 373 | 81,378 | 18,146 | 99,902 |
| outer-3 iter2 | 3 | 0.1503 | 560 | 103,929 | 29,517 | 134,011 |
| outer-4 iter2 | 3 | 0.1165 | 334 | 89,999 | 22,540 | 112,878 |
| outer-5 iter2 | 3 | 0.1302 | 255 | 96,977 | 25,934 | 123,171 |
| **中央値** | **3** | **$0.130** | **373** | **96,977** | **25,934** | **123,171** |

output トークン（実際の推論）は 255〜1,498 トークンで、ほぼ全コストが cache_read（iter-1 の会話履歴全体の再送信）。

---

*このドラフトは `bench/qiita-draft-enriched.md` として管理。元原稿は `bench/qiita-draft.md`（別ファイル）を参照。*
*計測データ: `bench/results/`（n=10 通常ラン）・`bench/results-flaky/`（flaky n=5）。詳細: `bench/step1-report.md`・`bench/step1-crosscheck.md`。*
