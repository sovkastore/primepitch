import { defineCloudflareConfig } from "@opennextjs/cloudflare";

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const originalWrite = fs.writeFileSync;
  const originalAppend = fs.appendFileSync;

  const dedupeFile = (filePath: any) => {
    if (typeof filePath === "string" && filePath.endsWith("next-env.mjs") && fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const uniqueLines = [...new Set(content.trim().split("\n"))].filter(Boolean);
        originalWrite.call(fs, filePath, uniqueLines.join("\n") + "\n");
      } catch {}
    }
  };

  fs.writeFileSync = function (...args: any[]) {
    const res = originalWrite.apply(this, args as any);
    dedupeFile(args[0]);
    return res;
  };

  fs.appendFileSync = function (...args: any[]) {
    const res = originalAppend.apply(this, args as any);
    dedupeFile(args[0]);
    return res;
  };
} catch {}

export default defineCloudflareConfig({});
