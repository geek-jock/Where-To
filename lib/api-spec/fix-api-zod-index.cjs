const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../api-zod/src/index.ts");
let content = fs.readFileSync(p, "utf8");
content = content.replace(/^export \* from "\.\/generated\/types";\n?/m, "");
fs.writeFileSync(p, content);
console.log("Fixed api-zod/src/index.ts");
