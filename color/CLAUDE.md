# color/ — カラーグレーディング / HDR / LUT

## リスク
- GPU シェーダーとの整合性が必要\n- 色空間変換の精度がプロ品質に直結

## ルール
- LUT は 3D テクスチャで GPU 適用\n- HDR メタデータは ITU-R BT.2100 準拠\n- 色計算は linear light で行い、最後に display transform

## ファイル
- grading-engine.ts
- hdr-engine.ts
- lut-manager.ts
