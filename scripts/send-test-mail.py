#!/usr/bin/env python3
"""Sendet eine Test-E-Mail mit Anhang an den lokalen GreenMail-Server."""

from __future__ import annotations

import argparse
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--host", default="127.0.0.1")
	parser.add_argument("--port", type=int, default=3025)
	parser.add_argument("--to", default="maildrop@localhost")
	parser.add_argument("--sender", default="tester@example.com")
	parser.add_argument("--subject", default="Testablage MailDrop")
	parser.add_argument(
		"--file",
		type=Path,
		default=None,
		help="Anhang-Datei (Standard: generiert eine kleine Textdatei)",
	)
	args = parser.parse_args()

	msg = MIMEMultipart()
	msg["From"] = args.sender
	msg["To"] = args.to
	msg["Subject"] = args.subject
	msg.attach(MIMEText("Testmail mit Anhang für die Nextcloud-App MailDrop.\n", "plain", "utf-8"))

	if args.file is None:
		payload = "Hallo von MailDrop – dies ist ein Testanhang.\n".encode("utf-8")
		filename = "test-anhang.txt"
	else:
		payload = args.file.read_bytes()
		filename = args.file.name

	attachment = MIMEApplication(payload, Name=filename)
	attachment["Content-Disposition"] = f'attachment; filename="{filename}"'
	msg.attach(attachment)

	with smtplib.SMTP(args.host, args.port) as smtp:
		smtp.sendmail(args.sender, [args.to], msg.as_string())

	print(f"E-Mail an {args.to} gesendet (SMTP {args.host}:{args.port}), Anhang: {filename}")


if __name__ == "__main__":
	main()
