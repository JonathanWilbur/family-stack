#!/bin/bash
apt install -y git gpg sendmail mailutils
openssl req -x509 -sha256 -days 1000 -nodes -out ./meerkat/cert.pem -keyout ./meerkat/key.pem -sub "/CN=$(hostname)"
cat Caddyfile | sed -e "s|HOSTNAME|$(hostname)|g" > Caddyfile
cat mysql-init.sql.tmpl | sed -e "s|DIRECTORY_USER_PASSWORD|${DIRECTORY_DB_PASSWORD}|g" > mysql-init.sql
cat mysql-init.sql | sed -e "s|OWNCLOUD_USER_PASSWORD|${OWNCLOUD_DB_PASSWORD}|g" > mysql-init.sql
cat postgres-init.sql.tmpl | sed -e "s|SYNAPSE_USER_PASSWORD|${SYNAPSE_DB_PASSWORD}|g" > postgres-init.sql
cat postgres-init.sql | sed -e "s|KEYCLOAK_USER_PASSWORD|${KEYCLOAK_DB_PASSWORD}|g" > postgres-init.sql
cat ./family-stack.service | sed -e "s|/CHANGEME|${PWD}|g" > ./family-stack.service
cp ./family-stack.service /etc/systemd/system/family-stack.service
systemctl enable family-stack
# Backup every Sunday at 03:13 (system time).
echo "13 3  * * 0   root    cd $PWD && ./backup.sh" >> /etc/crontab
