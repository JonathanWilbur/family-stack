#!/usr/bin/env node

/**
 * This was an experiment at doing the whole backup job in JavaScript. It is
 * not complete and may never be completed.
 */

import * as os from "node:os";
import * as cp from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as dotenv from "dotenv";
import * as DockerClient from "dockerode";

const MYSQL_DATABASES = ["directory", "owncloud"];
const POSTGRES_DATABASES = ["synapse", "keycloak"];
// const DC_COMMAND = 

function run (cmd) {
    const child = cp.spawnSync(cmd);
    if ((typeof child.status === "number") && (child.status !== 0)) {
        console.error(child.stdout);
        if (child.stderr) {
            console.error(child.stderr);
        }
        return false;
    }
    return true;
}

// if docker compose --help; then
//     DC_CMD="docker compose"
// else
//     DC_CMD="docker-compose"
// fi

function backup (docker, fileName) {
    const GPG_COMMAND = [
        "gpg",
        "--batch",
        `--passphrase ${process.env.GPG_PASSPHRASE}`,
        `--output ./backups/${fileName}.gpg`,
        "--symmetric",
        `./backups/${fileName}`,
    ].join(" ");

    if (!run(GPG_COMMAND)) {
        console.error(`Failed to encrypt file ${fileName}.`);
        process.exit(25519);
    }

    if (
        process.env.AZURE_BLOB_SAS
        && process.env.AZURE_STORAGE_ACCOUNT_NAME
        && process.env.AZURE_STORAGE_CONTAINER_NAME
    ) {
        const UPLOAD_CMD = [
            "/usr/local/bin/az",
            "storage",
            "blob",
            "upload",
            `--sas-token='${process.env.AZURE_BLOB_SAS}'`,
            `--account-name=${process.env.AZURE_STORAGE_ACCOUNT_NAME}`,
            `--container-name=${process.env.AZURE_STORAGE_CONTAINER_NAME}`,
            "--overwrite",
            "--tier=Archive",
            `--file=./backups/${fileName}.gpg`,
            `--name=backups/${fileName}.gpg`,
        ].join(" ");
        docker.run("mcr.microsoft.com/azure-cli", UPLOAD_CMD, process.stdout, {
            HostConfig: {
                AutoRemove: true,
                Mounts: [
                    {
                        Type: "volume",
                        Source: relevantVolumes.Name,
                        Target: "/data",
                        ReadOnly: true,
                    },
                    {
                        Type: "volume",
                        Source: path.posix.join(process.cwd(), "backups"),
                        Target: "/backup",
                        ReadOnly: false,
                    },
                ],
            },
        });
    }
    // if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
    //     docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
    //         /usr/local/bin/az \
    //         storage \
    //         blob \
    //         upload \
    //         --sas-token="$AZURE_BLOB_SAS" \
    //         --account-name=$storage_account_name \
    //         --container-name=$storage_container \
    //         --overwrite \
    //         --tier=Archive \
    //         --file=./backups/$volume-$backup_file_name.gpg \
    //         --name=backups/$volume-$backup_file_name.gpg

    //     sleep 1
    // fi
}

async function main () {

    dotenv.config();

    const DATE = (new Date()).toISOString().replaceAll(":", "_");
    const BACKUP_SUFFIX = `${DATE}.backup.tar.gz`;
    const STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;
    const PROJECT_NAME = path.basename(process.cwd());

    fs.mkdirSync("backups", { recursive: true });

    // Delete all existing backups.
    const entries = fs.readdirSync("backups");
    for (const e of entries) {
        if (e.indexOf(".tar.gz") > -1) {
            fs.rmSync(e);
        }
    }

    const docker = new DockerClient();
    const volumes = await docker.listVolumes();
    const relevantVolumes = volumes.Volumes
        .filter((v) => v.Name.startsWith(PROJECT_NAME + "_"));
    for (const v of relevantVolumes) {
        const UNENCRYPTED_BACKUP_NAME = `${v}-${BACKUP_SUFFIX}`;
        // docker run \
        //     --rm \
        //     --volume $volume_name:/data \
        //     --volume $(pwd)/backups:/backup \
        //     ubuntu \
        //     tar -cvzf /backup/$volume-$backup_file_name /data
        const ARCHIVE_CMD = ["tar", "-cvzf", `/backup/${UNENCRYPTED_BACKUP_NAME}`, "/data"].join(" ");
        await docker.run("ubuntu", ARCHIVE_CMD, process.stdout, {
            HostConfig: {
                AutoRemove: true,
                Mounts: [
                    {
                        Type: "volume",
                        Source: relevantVolumes.Name,
                        Target: "/data",
                        ReadOnly: true,
                    },
                    {
                        Type: "volume",
                        Source: path.posix.join(process.cwd(), "backups"),
                        Target: "/backup",
                        ReadOnly: false,
                    },
                ],
            },
        });
        backup(docker, UNENCRYPTED_BACKUP_NAME);
        // await docker.createContainer({
        //     Image: "ubuntu",
        //     Cmd: ["tar", "-cvzf", `/backup/${UNENCRYPTED_BACKUP_NAME}`, "/data"],
        //     HostConfig: {
        //         AutoRemove: true,
        //         Mounts: [
        //             {
        //                 Type: "volume",
        //                 Source: relevantVolumes.Name,
        //                 Target: "/data",
        //                 ReadOnly: true,
        //             },
        //             {
        //                 Type: "volume",
        //                 Source: path.posix.join(process.cwd(), "backups"),
        //                 Target: "/backup",
        //                 ReadOnly: false,
        //             },
        //         ],
        //     },
        // });
        // gpg \
        //     --batch \
        //     --passphrase "$GPG_PASSPHRASE" \
        //     --output ./backups/$volume-$backup_file_name.gpg \
        //     --symmetric ./backups/$volume-$backup_file_name

        const GPG_COMMAND = [
            "gpg",
            "--batch",
            `--passphrase ${process.env.GPG_PASSPHRASE}`,
            `--output ./backups/${UNENCRYPTED_BACKUP_NAME}.gpg`,
            "--symmetric",
            `./backups/${UNENCRYPTED_BACKUP_NAME}`,
        ].join(" ");

        if (!run(GPG_COMMAND)) {
            console.error(`Failed to encrypt volume ${v.Name}.`);
            process.exit(25519);
        }

        if (
            process.env.AZURE_BLOB_SAS
            && process.env.AZURE_STORAGE_ACCOUNT_NAME
            && process.env.AZURE_STORAGE_CONTAINER_NAME
        ) {
            const UPLOAD_CMD = [
                "/usr/local/bin/az",
                "storage",
                "blob",
                "upload",
                `--sas-token='${process.env.AZURE_BLOB_SAS}'`,
                `--account-name=${process.env.AZURE_STORAGE_ACCOUNT_NAME}`,
                `--container-name=${process.env.AZURE_STORAGE_CONTAINER_NAME}`,
                "--overwrite",
                "--tier=Archive",
                `--file=./backups/${UNENCRYPTED_BACKUP_NAME}.gpg`,
                `--name=backups/${UNENCRYPTED_BACKUP_NAME}.gpg`,
            ].join(" ");
            docker.run("mcr.microsoft.com/azure-cli", UPLOAD_CMD, process.stdout, {
                HostConfig: {
                    AutoRemove: true,
                    Mounts: [
                        {
                            Type: "volume",
                            Source: relevantVolumes.Name,
                            Target: "/data",
                            ReadOnly: true,
                        },
                        {
                            Type: "volume",
                            Source: path.posix.join(process.cwd(), "backups"),
                            Target: "/backup",
                            ReadOnly: false,
                        },
                    ],
                },
            });
        }
        // if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
        //     docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
        //         /usr/local/bin/az \
        //         storage \
        //         blob \
        //         upload \
        //         --sas-token="$AZURE_BLOB_SAS" \
        //         --account-name=$storage_account_name \
        //         --container-name=$storage_container \
        //         --overwrite \
        //         --tier=Archive \
        //         --file=./backups/$volume-$backup_file_name.gpg \
        //         --name=backups/$volume-$backup_file_name.gpg

        //     sleep 1
        // fi
    }

    // # $DC_CMD exec mariadb \
    // #     sh -c 'exec mysqldump --all-databases -uroot -p"$MYSQL_ROOT_PASSWORD"' > ./backups/all-databases.my.sql
    
    // # I could not put these in a loop, because it would get too complicated to
    // # interpolate $db, but not $MYSQL_ROOT_PASSWORD in the single-quoted string below.
    
    // $DC_CMD exec -t mariadb \
    //     sh -c 'exec mysqldump  -uroot -p"$MYSQL_ROOT_PASSWORD" directory' > ./backups/directory-$date.my.sql
    
    // $DC_CMD exec -t mariadb \
    //     sh -c 'exec mysqldump  -uroot -p"$MYSQL_ROOT_PASSWORD" owncloud' > ./backups/owncloud-$date.my.sql
    
    // tar -cvzf ./backups/mysql-dump-$date.tar.gz \
    //     ./backups/directory-$date.my.sql \
    //     ./backups/owncloud-$date.my.sql
    
    // gpg \
    //     --batch \
    //     --passphrase "$GPG_PASSPHRASE" \
    //     --output ./backups/mysql-dump-$date.tar.gz.gpg \
    //     --symmetric ./backups/mysql-dump-$date.tar.gz
    
    // if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
    //     docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
    //         /usr/local/bin/az \
    //         storage \
    //         blob \
    //         upload \
    //         --sas-token="$AZURE_BLOB_SAS" \
    //         --account-name=$storage_account_name \
    //         --container-name=$storage_container \
    //         --overwrite \
    //         --tier=Archive \
    //         --file=./backups/mysql-dump-$date.tar.gz.gpg \
    //         --name=backups/mysql-dump-$date.tar.gz.gpg
    // fi
    
    // echo "Backed up MySQL Dump."
    
    // # $DC_CMD exec -t postgres pg_dumpall -c -U postgres > ./backups/all-databases.pg.sql
    
    // $DC_CMD exec -t postgres pg_dump --no-owner -U postgres synapse > ./backups/synapse-$date.pg.sql
    // $DC_CMD exec -t postgres pg_dump --no-owner -U postgres keycloak > ./backups/keycloak-$date.pg.sql
    
    // tar -cvzf ./backups/postgres-dump-$date.tar.gz \
    //     ./backups/synapse-$date.pg.sql \
    //     ./backups/keycloak-$date.pg.sql
    
    // gpg \
    //     --batch \
    //     --passphrase "$GPG_PASSPHRASE" \
    //     --output ./backups/postgres-dump-$date.tar.gz.gpg \
    //     --symmetric ./backups/postgres-dump-$date.tar.gz
    
    // if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
    //     docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
    //         /usr/local/bin/az \
    //         storage \
    //         blob \
    //         upload \
    //         --sas-token="$AZURE_BLOB_SAS" \
    //         --account-name=$storage_account_name \
    //         --container-name=$storage_container \
    //         --overwrite \
    //         --tier=Archive \
    //         --file=./backups/postgres-dump-$date.tar.gz.gpg \
    //         --name=backups/postgres-dump-$date.tar.gz.gpg
    // fi
    
    // echo "Backed up Postgres Dump."
    
    // if [[ ! -z "$ADMINISTRATOR_EMAIL" ]]; then
    //     printf "Backup of the family stack complete. SHA-1 hashes of the backup files are as follows:\n\n" > hashes.txt
    //     sha1sum ./backups/*.tar.* >> hashes.txt
    //     cat hashes.txt | mail -s "Backup of the family stack complete" $ADMINISTRATOR_EMAIL
    // fi

}

main();
