#!/usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();
const child = cp.spawnSync("/bin/bash", "./backup.sh");
if ((typeof child.status === "number") && (child.status !== 0)) {
    console.error(child.stdout);
    if (child.stderr) {
        console.error(child.stderr);
    }
    process.exit(child.status);
}
