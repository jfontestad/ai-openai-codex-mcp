#!/usr/bin/env node
// 簡易クリーン: build/ を削除（クロスプラットフォーム対応のためNodeで実装）
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), 'build');
try {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[clean] removed: ${target}`);
  } else {
    console.log(`[clean] not found: ${target}`);
  }
  process.exit(0);
} catch (e) {
  console.error(`[clean] failed: ${e?.message ?? e}`);
  process.exit(1);
}

