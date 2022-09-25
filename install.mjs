#!/usr/bin/env node
import * as os from "node:os";
import * as cp from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as dotenv from "dotenv";

const CERT_PATH = path.join(path.resolve("."), "meerkat", "cert.pem");
const KEY_PATH = path.join(path.resolve("."), "meerkat", "key.pem");
const CREATE_CERTS = [
    "openssl",
    "req",
    "-x509",
    "-sha256",
    "-days 1000",
    "-nodes",
    "-out " + CERT_PATH,
    "-keyout " + KEY_PATH,
    `-subj /CN=${os.hostname}/`,
].join(" ");
const BACKUP_CRON_JOB_SCHEDULE = "13 3 * * 0"; // Every Sunday at 03:13.
const BACKUP_CRON_JOB_ACTION = `cd ${process.cwd()} && ./backup.sh`;

function main () {

    dotenv.config();

    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        const createCertsProcess = cp.spawnSync(CREATE_CERTS);
        if (typeof createCertsProcess.status === "number" && (createCertsProcess.status !== 0)) {
            console.error("Failed to create self-signed certificate.");
            console.error(createCertsProcess.stdout);
            if (createCertsProcess.stderr) {
                console.error(createCertsProcess.stderr);
            }
            process.exit(1);
        }
    } else {
        console.info("Self-signed certificate and key already exists. Skipping PKI creation.");
    }

    const caddyfileContents = fs.readFileSync("Caddyfile.tmpl", { encoding: "utf-8" });
    fs.writeFileSync("Caddyfile", caddyfileContents.replaceAll("HOSTNAME", os.hostname));

    const mysqlInitContents = fs.readFileSync("mysql-init.sql.tmpl", { encoding: "utf-8" });
    fs.writeFileSync("mysql-init.sql", mysqlInitContents
        .replaceAll("DIRECTORY_USER_PASSWORD", process.env.DIRECTORY_DB_PASSWORD)
        .replaceAll("OWNCLOUD_USER_PASSWORD", process.env.OWNCLOUD_DB_PASSWORD)
    );

    const postgresInitContents = fs.readFileSync("postgres-init.sql.tmpl", { encoding: "utf-8" });
    fs.writeFileSync("postgres-init.sql", postgresInitContents
        .replaceAll("SYNAPSE_USER_PASSWORD", process.env.SYNAPSE_DB_PASSWORD)
        .replaceAll("KEYCLOAK_USER_PASSWORD", process.env.KEYCLOAK_DB_PASSWORD)
    );

    if (process.platform === "linux") {
        const familyStackServiceContents = fs.readFileSync("family-stack.service.tmpl", { encoding: "utf-8" });
        fs.writeFileSync("family-stack.service", familyStackServiceContents.replaceAll("/CHANGEME", process.cwd()));
        fs.cpSync("family-stack.service", "/etc/systemd/system/family-stack.service");
        try {
            cp.execSync("systemctl enable family-stack");
        } catch (e) {
            console.error("Failed to enable family-stack service: ", e);
        }
        const crontabContents = fs.readFileSync("/etc/crontab", { encoding: "utf-8" });
        if (crontabContents.indexOf(BACKUP_CRON_JOB_ACTION) === -1) {
            // echo "13 3  * * 0   root    cd $PWD && ./backup.sh" >> /etc/crontab
            fs.appendFileSync(`\n# Backup job for the family-stack\n${BACKUP_CRON_JOB_SCHEDULE} root ${BACKUP_CRON_JOB_ACTION}\n`);
        }

        try {
            cp.execSync("systemctl start family-stack");
        } catch (e) {
            console.error("Failed to start family-stack service: ", e);
        }
    }

    console.info("Setup complete.");
    console.info(`X.500 Directory Web Admin Console: https://directory.${process.env.DOMAIN}`);
    console.info(`Keycloak Web Admin Console: https://k.${process.env.DOMAIN}`);
    console.info(`OwnCloud: https://cloud.${process.env.DOMAIN}`);
    console.info("The next step is to set up your directory with users.");
    console.info("Here is a tutorial on setting up the X.500 CLI: https://wildboar-software.github.io/directory/docs/tutorial01");
    console.info("Here is a tutorial on setting up the directory using the X.500 CLI: https://wildboar-software.github.io/directory/docs/tutorial02");
    
}

main();