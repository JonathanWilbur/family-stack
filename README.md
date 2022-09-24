# Family Stack

This is a Docker-Compose-based stack of services that a family might want to
use, such as an [OwnCloud](https://owncloud.com/) server for file sharing,
calendars, and contacts, and [Keycloak](https://www.keycloak.org/) for Single
Sign-On (SSO), which is backed by
[Meerkat DSA](https://wildboar-software.github.io/directory/) as an identity
store.

This repo has a starter Docker-Compose app for the above purpose, which comes
pre-configured for automated, compressed, and encrypted backups to Azure Blob
Storage (archive-tier). Pull requests are welcome for other backup destinations.
Every weekly backup will send you an email containing the hashes of the
compressed and encrypted archives, which should help ensure integrity of the
encrypted backups on whatever object store you use.

Future versions will include support for Synapse, Wekan, CoreDNS, Email
(Postfix and Dovecot), and Fail2Ban, as well as other services.

## System Requirements

Not known currently, but you will definitely want more than 2 cores and 4 GB of
memory.

## Limitations

Do NOT move this repository after you've cloned it and set it up. Your system
setup will break if you do, so make sure you cloned the repo exactly where you
want it to be forever.

Encryption at rest will not be supported, because there is pretty high overhead
with doing this for databases, and it does not protect metadata in Owncloud.
But the backups are encrypted.

## Setup

1. Run `gpg --full-generate-key` and follow the prompts to create a GPG key.
2. Install Docker. New versions of Docker have a `compose` subcommand, but if
   yours does not, install `docker-compose` separately.
3. Set the Fully-Qualified Domain Name (FQDN) of your server. Use
   `hostnamectl set-hostname your.hostname.com` on SystemD-based systems.
   - This must be done because `sendmail` will refuse to send your backup
     notifications otherwise, and your FQDN is used to populate configuration.
4. Run `apt install -y git gpg sendmail mailutils`.
5. Run `cp example.env .env`.
6. Configure the app as you'd like in `.env`.
   - It is highly recommended that you generate secure passwords if your family
     stack will be exposed to the Internet. Try using `openssl rand -base64 12`
     to generate good passwords.
7. Run `docker run --rm -v $PWD:/asdf --env-file .env --hostname=$(hostname) -w /asdf ubuntu ./install.sh`.
   - This script is NOT idempotent. Do NOT run it twice or more!
8. Run `cp ./family-stack.service /etc/systemd/system/family-stack.service`.
9. Run `systemctl enable family-stack`.
10. Run `echo "13 3  * * 0   root    cd $PWD && ./backup.sh" >> /etc/crontab`.
   - The above runs the backup job every Sunday at 03:13 (server time)
11. Seed your X.500 Directory with data. See [these](https://wildboar-software.github.io/directory/docs/tutorial01)
   [tutorials](https://wildboar-software.github.io/directory/docs/tutorial02) for
   an idea of how to do this.
12. Log into OwnCloud as the administrator, download the LDAP plugin from the
   Marketplace, and configure it to use `ldap://directory:1389` as the LDAP
   server.
13. Log into Keycloak as the administrator, and configure an LDAP identity
   store that points to `ldap://directory:1389`.

## TODO

- [ ] Wekan (MongoDB)
- [ ] Matrix Chat (Maybe Dendrite?) (Postgres)
- [ ] Plex?
- [ ] Wiki? (Any relational)
- [ ] Gitea? (Any relational)
- [ ] Verdaccio (No database)
- [ ] Cargo Repo
- [ ] Docker Registry
- [ ] CoreDNS with Blocklist
- [ ] Automated updates
- [ ] Fail2Ban
- [ ] Testing
  - [ ] Backup Restoration
  - [ ] Service Restarts
  - [ ] System Restarts
