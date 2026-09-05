// `Env` は `wrangler types` が wrangler.jsonc から生成する worker-configuration.d.ts のグローバル型。
// wrangler.jsonc の設定を変更したら `pnpm cf-typegen` を再実行すること。
export type Bindings = Env;
