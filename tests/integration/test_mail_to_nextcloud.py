#!/usr/bin/env python3
"""Integrativer E2E-Test: SMTP → GreenMail → MailDrop → Nextcloud Files (WebDAV).

Voraussetzung: Docker-Compose-Stack aus dem Repo-Root läuft
(nextcloud, mail/GreenMail, app maildrop aktiv).

Umgebungsvariablen (optional):
  NEXTCLOUD_URL          default http://127.0.0.1:8080
  NEXTCLOUD_USER         default admin
  NEXTCLOUD_PASSWORD     default admin
  SMTP_HOST              default 127.0.0.1
  SMTP_PORT              default 3025
  IMAP_USER              default maildrop
  IMAP_PASSWORD          default maildrop
  SKIP_COMPOSE_CHECK     if 1, skip docker compose ps check
"""

from __future__ import annotations

import json
import os
import smtplib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]

NEXTCLOUD_URL = os.environ.get("NEXTCLOUD_URL", "http://127.0.0.1:8080").rstrip("/")
NEXTCLOUD_USER = os.environ.get("NEXTCLOUD_USER", "admin")
NEXTCLOUD_PASSWORD = os.environ.get("NEXTCLOUD_PASSWORD", "admin")
SMTP_HOST = os.environ.get("SMTP_HOST", "127.0.0.1")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "3025"))
IMAP_USER = os.environ.get("IMAP_USER", "maildrop")
IMAP_PASSWORD = os.environ.get("IMAP_PASSWORD", "maildrop")
TARGET_PATH = "/MailDrop-Integration"
DAV_NS = {"d": "DAV:"}


class TestFailure(Exception):
	pass


def log(message: str) -> None:
	print(f"[e2e] {message}", flush=True)


def run(
	cmd: list[str],
	*,
	check: bool = True,
	input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
	log("$ " + " ".join(cmd))
	result = subprocess.run(
		cmd,
		cwd=ROOT,
		input=input_text,
		text=True,
		capture_output=True,
	)
	if result.stdout.strip():
		print(result.stdout.rstrip(), flush=True)
	if result.stderr.strip():
		print(result.stderr.rstrip(), file=sys.stderr, flush=True)
	if check and result.returncode != 0:
		raise TestFailure(f"Command failed ({result.returncode}): {' '.join(cmd)}")
	return result


def docker_compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
	return run(["docker", "compose", *args], check=check)


def occ(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
	return docker_compose(
		"exec",
		"-T",
		"-u",
		"www-data",
		"nextcloud",
		"php",
		"occ",
		*args,
		check=check,
	)


def wait_for_http(url: str, timeout: int = 180) -> None:
	deadline = time.time() + timeout
	last_error = ""
	while time.time() < deadline:
		try:
			with urllib.request.urlopen(url, timeout=5) as response:
				if response.status == 200:
					body = response.read().decode("utf-8", errors="replace")
					if "installed" in body and "true" in body:
						log(f"Nextcloud ready: {url}")
						return
					last_error = body[:200]
		except Exception as exc:  # noqa: BLE001
			last_error = str(exc)
		time.sleep(3)
	raise TestFailure(f"Timeout waiting for {url}: {last_error}")


def wait_for_tcp(host: str, port: int, timeout: int = 60) -> None:
	deadline = time.time() + timeout
	while time.time() < deadline:
		try:
			with socket.create_connection((host, port), timeout=2):
				log(f"Port open: {host}:{port}")
				return
		except OSError:
			time.sleep(1)
	raise TestFailure(f"Timeout waiting for {host}:{port}")


def wait_for_app_enabled(timeout: int = 120) -> None:
	deadline = time.time() + timeout
	while time.time() < deadline:
		result = occ("app:list", "--enabled", check=False)
		if result.returncode == 0 and "maildrop" in result.stdout:
			log("App maildrop is enabled")
			return
		time.sleep(3)
	raise TestFailure("Timeout waiting for maildrop app to be enabled")


def configure_maildrop() -> None:
	# Zuerst Upgrade, sonst sind viele occ-Befehle gesperrt.
	occ("upgrade", check=False)
	occ("app:enable", "maildrop", check=False)
	occ("config:app:set", "maildrop", "enabled", "--value=yes")

	php = f"""<?php
require '/var/www/html/lib/base.php';
$config = \\OC::$server->get(\\OCA\\MailDrop\\Service\\ConfigService::class);
$mappings = $config->saveMappings([[
  'id' => 'e2e-default',
  'name' => 'E2E Mapping',
  'fetch_enabled' => true,
  'imap_host' => 'mail',
  'imap_port' => 3143,
  'imap_encryption' => 'none',
  'imap_user' => {json.dumps(IMAP_USER)},
  'imap_password' => {json.dumps(IMAP_PASSWORD)},
  'imap_folder' => 'INBOX',
  'target_user' => {json.dumps(NEXTCLOUD_USER)},
  'target_path' => {json.dumps(TARGET_PATH)},
  'mark_as_seen' => true,
  'delete_after_import' => false,
  'subject_filter' => '',
  'sender_filter' => '',
]]);
echo 'mappings=' . count($mappings) . PHP_EOL;
"""
	run(
		[
			"docker",
			"compose",
			"exec",
			"-T",
			"-u",
			"www-data",
			"nextcloud",
			"php",
		],
		input_text=php,
	)


def send_mail(marker: str, filename: str, content: bytes) -> None:
	subject = f"MailDrop E2E {marker}"
	msg = MIMEMultipart()
	msg["From"] = "e2e@example.com"
	msg["To"] = f"{IMAP_USER}@localhost"
	msg["Subject"] = subject
	msg.attach(MIMEText(f"Integrationstest {marker}\n", "plain", "utf-8"))

	attachment = MIMEApplication(content, Name=filename)
	attachment["Content-Disposition"] = f'attachment; filename="{filename}"'
	msg.attach(attachment)

	with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
		smtp.sendmail(msg["From"], [msg["To"]], msg.as_string())
	log(f"SMTP mail sent subject={subject!r} attachment={filename}")


def fetch_mail() -> None:
	result = occ("maildrop:fetch", check=False)
	if result.returncode != 0:
		php = """<?php
require '/var/www/html/lib/base.php';
$svc = \\OC::$server->get(\\OCA\\MailDrop\\Service\\MailFetchService::class);
$result = $svc->fetchAndStore();
echo json_encode($result), PHP_EOL;
exit($result['success'] ? 0 : 1);
"""
		result = run(
			[
				"docker",
				"compose",
				"exec",
				"-T",
				"-u",
				"www-data",
				"nextcloud",
				"php",
			],
			input_text=php,
			check=False,
		)
		if result.returncode != 0:
			raise TestFailure("MailDrop fetch failed")
	log("Fetch completed")


def dav_url(path: str) -> str:
	# Jedes Pfadsegment separat encoden (Leerzeichen in Mail-Ordnernamen)
	parts = [urllib.parse.quote(part, safe="") for part in path.strip("/").split("/") if part]
	suffix = "/".join(parts)
	return f"{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}/{suffix}"


def dav_request(
	method: str,
	path: str,
	data: bytes | None = None,
	headers: dict[str, str] | None = None,
) -> tuple[int, bytes]:
	url = dav_url(path)
	password_mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
	password_mgr.add_password(None, NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD)
	opener = urllib.request.build_opener(
		urllib.request.HTTPBasicAuthHandler(password_mgr),
	)
	req = urllib.request.Request(url, data=data, method=method)
	req.add_header("OCS-APIRequest", "true")
	for key, value in (headers or {}).items():
		req.add_header(key, value)
	try:
		with opener.open(req, timeout=30) as response:
			return response.status, response.read()
	except urllib.error.HTTPError as exc:
		return exc.code, exc.read()


def list_dav(path: str) -> list[str]:
	body = b"""<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname/></d:prop>
</d:propfind>
"""
	status, raw = dav_request(
		"PROPFIND",
		path,
		data=body,
		headers={"Depth": "1", "Content-Type": "application/xml"},
	)
	if status not in (207, 200):
		raise TestFailure(f"PROPFIND {path} failed: HTTP {status} {raw[:300]!r}")

	root = ET.fromstring(raw)
	names: list[str] = []
	for response in root.findall("d:response", DAV_NS):
		href = response.findtext("d:href", default="", namespaces=DAV_NS)
		name = urllib.parse.unquote(href.rstrip("/").split("/")[-1])
		if name and name != path.strip("/").split("/")[-1]:
			names.append(name)
	return names


def download_dav(path: str) -> bytes:
	status, raw = dav_request("GET", path)
	if status != 200:
		raise TestFailure(f"GET {path} failed: HTTP {status} {raw[:300]!r}")
	return raw


def assert_attachment_in_nextcloud(marker: str, filename: str, expected: bytes) -> None:
	occ(
		"files:scan",
		NEXTCLOUD_USER,
		f"--path=/{NEXTCLOUD_USER}/files{TARGET_PATH}",
		check=False,
	)

	deadline = time.time() + 60
	last_error = ""
	while time.time() < deadline:
		try:
			children = list_dav(TARGET_PATH)
			candidates = [name for name in children if marker in name]
			if not candidates:
				candidates = children
			for folder in candidates:
				files = list_dav(f"{TARGET_PATH}/{folder}")
				if filename in files:
					content = download_dav(f"{TARGET_PATH}/{folder}/{filename}")
					if content == expected:
						log(
							f"Attachment found via WebDAV: "
							f"{TARGET_PATH}/{folder}/{filename}"
						)
						return
					last_error = (
						f"content mismatch in {folder}/{filename}: got {content!r}"
					)
				else:
					last_error = f"{folder} has files {files}, expected {filename}"
			if not children:
				last_error = f"no folders under {TARGET_PATH}"
		except TestFailure as exc:
			last_error = str(exc)
		time.sleep(2)
	raise TestFailure(f"Attachment not found in Nextcloud: {last_error}")


def main() -> int:
	os.chdir(ROOT)
	marker = uuid4().hex[:12]
	filename = f"e2e-{marker}.txt"
	content = f"MailDrop integration payload {marker}\n".encode("utf-8")

	log("Starting MailDrop integration test")

	if os.environ.get("SKIP_COMPOSE_CHECK") != "1":
		status = docker_compose("ps", check=False)
		if "nextcloud" not in status.stdout:
			raise TestFailure(
				"Docker Compose stack does not seem to be running. "
				"Start with: docker compose up -d"
			)

	wait_for_http(f"{NEXTCLOUD_URL}/status.php")
	wait_for_tcp(SMTP_HOST, SMTP_PORT)
	wait_for_app_enabled()
	configure_maildrop()
	send_mail(marker, filename, content)
	time.sleep(2)
	fetch_mail()
	assert_attachment_in_nextcloud(marker, filename, content)

	log("SUCCESS: mail attachment arrived in Nextcloud")
	return 0


if __name__ == "__main__":
	try:
		sys.exit(main())
	except TestFailure as exc:
		print(f"[e2e] FAIL: {exc}", file=sys.stderr)
		sys.exit(1)
