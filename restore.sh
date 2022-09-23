#!/bin/sh

# Change these
volume="mysql"
backup_time=$(date +%Y-%m-%d-%H_%M_%S)

# Do not touch these
volume_name="$volume-$backup_time.tar.gz"
project=$(basename $PWD)
dc_volume_name="${project}_$volume"

# You'll be promted for a password after this command.
gpg --output $volume_name --decrypt $volume_name.gpg

docker run --rm  \
    --volume $dc_volume_name:/restore \
    --volume $PWD/backups:/backups ubuntu  \
    tar -xvzf /backups/$volume_name -C /restore --strip 1
