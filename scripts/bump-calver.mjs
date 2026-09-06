// CalVer (YYYY.MM.MICRO) のバージョンを算出し、package.json に書き込む。
// 同じ年月の既存タグ (v<year>.<month>.*) がある場合はMICROを+1し、
// 月が変わった場合はMICROを0にリセットする。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const now = new Date();
const year = now.getUTCFullYear();
const month = now.getUTCMonth() + 1;

const existingTags = execFileSync("git", ["tag", "-l", `v${year}.${month}.*`], {
	encoding: "utf8",
})
	.split("\n")
	.map((tag) => tag.trim())
	.filter(Boolean);

const micros = existingTags
	.map((tag) => tag.match(/^v\d+\.\d+\.(\d+)$/))
	.filter(Boolean)
	.map((match) => Number(match[1]));

const nextMicro = micros.length > 0 ? Math.max(...micros) + 1 : 0;
const version = `${year}.${month}.${nextMicro}`;

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);

console.log(version);
