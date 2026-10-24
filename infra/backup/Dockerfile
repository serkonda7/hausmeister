FROM alpine:3
RUN apk add --no-cache restic sqlite bash ca-certificates curl
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
