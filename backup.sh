#!/bin/bash

date=$(date +%Y-%m-%d-%H_%M_%S)
backup_file_name=$date.backup.tar.gz
storage_account_name=$AZURE_STORAGE_ACCOUNT_NAME
storage_container=$AZURE_STORAGE_CONTAINER_NAME
volumes=("files" "mysql" "postgres" "redis" "caddy")
project=$(basename $PWD)
mysql_databases=("directory" "owncloud")
postgres_databases=("synapse" "keycloak")

if docker compose --help; then
    DC_CMD="docker compose"
else
    DC_CMD="docker-compose"
fi

mkdir -p ./backups || true

# This ensures that only the most recent backup is kept on-server.
rm ./backups/*.tar.gz
rm ./backups/*.tar.gz.gpg

for volume in ${volumes[@]}; do
    volume_name="${project}_${volume}"
    docker run \
        --rm \
        --volume $volume_name:/data \
        --volume $(pwd)/backups:/backup \
        ubuntu \
        tar -cvzf /backup/$volume-$backup_file_name /data

    gpg \
        --batch \
        --passphrase "$GPG_PASSPHRASE" \
        --output ./backups/$volume-$backup_file_name.gpg \
        --symmetric ./backups/$volume-$backup_file_name

    if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
        docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
            /usr/local/bin/az \
            storage \
            blob \
            upload \
            --sas-token="$AZURE_BLOB_SAS" \
            --account-name=$storage_account_name \
            --container-name=$storage_container \
            --overwrite \
            --tier=Archive \
            --file=./backups/$volume-$backup_file_name.gpg \
            --name=backups/$volume-$backup_file_name.gpg

        sleep 1
    fi

    echo "Backed up volume $volume_name."
done

# $DC_CMD exec mariadb \
#     sh -c 'exec mysqldump --all-databases -uroot -p"$MYSQL_ROOT_PASSWORD"' > ./backups/all-databases.my.sql

# I could not put these in a loop, because it would get too complicated to
# interpolate $db, but not $MYSQL_ROOT_PASSWORD in the single-quoted string below.

$DC_CMD exec -t mariadb \
    sh -c 'exec mysqldump  -uroot -p"$MYSQL_ROOT_PASSWORD" directory' > ./backups/directory-$date.my.sql

$DC_CMD exec -t mariadb \
    sh -c 'exec mysqldump  -uroot -p"$MYSQL_ROOT_PASSWORD" owncloud' > ./backups/owncloud-$date.my.sql

tar -cvzf ./backups/mysql-dump-$date.tar.gz \
    ./backups/directory-$date.my.sql \
    ./backups/owncloud-$date.my.sql

gpg \
    --batch \
    --passphrase "$GPG_PASSPHRASE" \
    --output ./backups/mysql-dump-$date.tar.gz.gpg \
    --symmetric ./backups/mysql-dump-$date.tar.gz

if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
    docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
        /usr/local/bin/az \
        storage \
        blob \
        upload \
        --sas-token="$AZURE_BLOB_SAS" \
        --account-name=$storage_account_name \
        --container-name=$storage_container \
        --overwrite \
        --tier=Archive \
        --file=./backups/mysql-dump-$date.tar.gz.gpg \
        --name=backups/mysql-dump-$date.tar.gz.gpg
fi

echo "Backed up MySQL Dump."

# $DC_CMD exec -t postgres pg_dumpall -c -U postgres > ./backups/all-databases.pg.sql

$DC_CMD exec -t postgres pg_dump --no-owner -U postgres synapse > ./backups/synapse-$date.pg.sql
$DC_CMD exec -t postgres pg_dump --no-owner -U postgres keycloak > ./backups/keycloak-$date.pg.sql

tar -cvzf ./backups/postgres-dump-$date.tar.gz \
    ./backups/synapse-$date.pg.sql \
    ./backups/keycloak-$date.pg.sql

gpg \
    --batch \
    --passphrase "$GPG_PASSPHRASE" \
    --output ./backups/postgres-dump-$date.tar.gz.gpg \
    --symmetric ./backups/postgres-dump-$date.tar.gz

if [[ ! -z "$AZURE_BLOB_SAS" ]]; then
    docker run -v $PWD/backups:/backups mcr.microsoft.com/azure-cli \
        /usr/local/bin/az \
        storage \
        blob \
        upload \
        --sas-token="$AZURE_BLOB_SAS" \
        --account-name=$storage_account_name \
        --container-name=$storage_container \
        --overwrite \
        --tier=Archive \
        --file=./backups/postgres-dump-$date.tar.gz.gpg \
        --name=backups/postgres-dump-$date.tar.gz.gpg
fi

echo "Backed up Postgres Dump."

if [[ ! -z "$ADMINISTRATOR_EMAIL" ]]; then
    printf "Backup of the family stack complete. SHA-1 hashes of the backup files are as follows:\n\n" > hashes.txt
    sha1sum ./backups/*.tar.* >> hashes.txt
    cat hashes.txt | mail -s "Backup of the family stack complete" $ADMINISTRATOR_EMAIL
fi
