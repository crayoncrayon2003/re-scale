# Re:Scale

近年、都市では自然災害への備えが求められています。近く感じる場所であっても、ハザードを考慮すると移動のしやすさが変わる場合があります。

Re:Scale（リスケール）は、「移動コスト」というスケールに置き換え、移動のしやすさを可視化するアプリです。

首都圏の公共交通機関に対して、通常時とハザード考慮時の駅からの到達範囲や都市全体のつながり方の変化を可視化します。

公開サイト：[Re:Scale](https://crayoncrayon2003.github.io/re-scale/)

[公共交通オープンデータチャレンジ2026](https://challenge2026.odpt.org/)に向けたアプリです。

本アプリに関するお問い合わせは、本リポジトリの[Issues](https://github.com/crayoncrayon2003/re-scale/issues)へお願いします。


## 基本的な使い方
公開サイト上の[使い方](https://crayoncrayon2003.github.io/re-scale/manual.html)を参照してください。

## Re:Scaleの仕組み
公開サイト上の[Re:Scaleの仕組み](https://crayoncrayon2003.github.io/re-scale/mechanism.html)を参照してください。

## 開発
### 起動と検証

```bash
npm ci
npm run dev
npm test
npm run build
```

背景地図とハザードの表示および線路との重なりの評価にはネットワーク接続が必要です。

公開する `data/` には、画面表示と計算に必要な加工済みデータだけを置いています。取得した生データ、生成途中のデータ、データ作成用スクリプトは公開対象に含めていません。

現在の距離計算では、リアルタイム情報、運休、遅延、列車頻度、運賃、追加料金を使用しません。出典と利用条件は[利用データ](https://crayoncrayon2003.github.io/re-scale/data.html)を参照してください。
