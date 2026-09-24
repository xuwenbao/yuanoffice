# Browser host and loopback control service.
# Run `make help` for the targets.

REPO := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PORT ?= 8787
ROOT ?= $(REPO)
STATIC ?= dist/web
RUN_DIR := $(REPO)/.run
PID_FILE := $(RUN_DIR)/serve-$(PORT).pid
LOG_FILE := $(RUN_DIR)/serve-$(PORT).log
META_FILE := $(RUN_DIR)/serve-$(PORT).meta
LAUNCHER := $(REPO)/packages/cli/bin/genoffice

.DEFAULT_GOAL := help
.PHONY: help init start stop status

help:
	@printf '%s\n' \
		'GenOffice web host' \
		'' \
		'  make init     install dependencies, then build the CLI and the web host' \
		'  make start    start the loopback control service in the background' \
		'  make stop     stop the control service' \
		'  make status   show whether the control service is running' \
		'  make help     show this message' \
		'' \
		'start reads these variables (defaults shown):' \
		'  PORT=$(PORT)' \
		'  ROOT=$(ROOT)' \
		'  STATIC=$(STATIC)' \
		'' \
		'Example:' \
		'  make start ROOT=$$HOME/Downloads/workspace PORT=8787'

init:
	cd "$(REPO)" && npm install
	cd "$(REPO)" && npm run build -w @genoffice/cli
	cd "$(REPO)" && npm run build:web -w @genoffice/docs
	cd "$(REPO)" && npm run build:web -w @genoffice/pdf
	cd "$(REPO)" && npm run build:web -w @genoffice/slides
	cd "$(REPO)" && npm run build:web -w @genoffice/sheets
	cd "$(REPO)" && npm run build:web -w @genoffice/shell

start:
	@set -eu; \
	cd "$(REPO)"; \
	if [ ! -x "$(LAUNCHER)" ]; then echo "missing CLI launcher; run make init"; exit 1; fi; \
	if [ ! -f "$(REPO)/$(STATIC)/index.html" ]; then echo "missing $(STATIC)/index.html; run make init"; exit 1; fi; \
	if [ ! -d "$(ROOT)" ]; then echo "ROOT does not exist: $(ROOT)"; exit 1; fi; \
	mkdir -p "$(RUN_DIR)"; \
	if [ -f "$(PID_FILE)" ]; then \
		old=$$(cat "$(PID_FILE)"); \
		if kill -0 "$$old" 2>/dev/null; then \
			echo "already running (pid $$old) — http://127.0.0.1:$(PORT)"; \
			exit 1; \
		fi; \
		rm -f "$(PID_FILE)"; \
	fi; \
	if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "port $(PORT) is already in use"; \
		exit 1; \
	fi; \
	: > "$(LOG_FILE)"; \
	nohup "$(LAUNCHER)" serve --root "$(ROOT)" --port "$(PORT)" --static "$(REPO)/$(STATIC)" >> "$(LOG_FILE)" 2>&1 & \
	echo $$! > "$(PID_FILE)"; \
	pid=$$(cat "$(PID_FILE)"); \
	ok=0; \
	i=0; \
	while [ "$$i" -lt 50 ]; do \
		if grep -q "genoffice serve http://" "$(LOG_FILE)"; then ok=1; break; fi; \
		if ! kill -0 "$$pid" 2>/dev/null; then break; fi; \
		i=$$((i + 1)); \
		sleep 0.1; \
	done; \
	if [ "$$ok" -ne 1 ]; then \
		echo "failed to start; see $(LOG_FILE)"; \
		tail -n 40 "$(LOG_FILE)" || true; \
		kill "$$pid" 2>/dev/null || true; \
		rm -f "$(PID_FILE)"; \
		exit 1; \
	fi; \
	printf 'port=%s\nroot=%s\nstatic=%s\npid=%s\n' "$(PORT)" "$(ROOT)" "$(STATIC)" "$$pid" > "$(META_FILE)"; \
	url=$$(grep "genoffice serve http://" "$(LOG_FILE)" | tail -n 1 | sed 's/.*http/http/'); \
	echo "started (pid $$pid) — $$url"

stop:
	@set -eu; \
	stopped=0; \
	if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat "$(PID_FILE)"); \
		if kill -0 "$$pid" 2>/dev/null; then \
			kill "$$pid" 2>/dev/null || true; \
			i=0; \
			while [ "$$i" -lt 30 ] && kill -0 "$$pid" 2>/dev/null; do \
				i=$$((i + 1)); \
				sleep 0.1; \
			done; \
			if kill -0 "$$pid" 2>/dev/null; then kill -9 "$$pid" 2>/dev/null || true; fi; \
			echo "stopped pid $$pid"; \
			stopped=1; \
		fi; \
		rm -f "$(PID_FILE)" "$(META_FILE)"; \
	fi; \
	if command -v lsof >/dev/null 2>&1; then \
		for pid in $$(lsof -nP -tiTCP:$(PORT) -sTCP:LISTEN 2>/dev/null || true); do \
			cmd=$$(ps -p "$$pid" -o command= 2>/dev/null || true); \
			case "$$cmd" in \
				*genoffice*) \
					kill "$$pid" 2>/dev/null || true; \
					echo "stopped listener pid $$pid on port $(PORT)"; \
					stopped=1; \
					;; \
			esac; \
		done; \
	fi; \
	rm -f "$(META_FILE)"; \
	if [ "$$stopped" -eq 0 ]; then echo "not running"; fi

status:
	@set -eu; \
	pid=""; \
	if [ -f "$(PID_FILE)" ]; then \
		recorded=$$(cat "$(PID_FILE)"); \
		if kill -0 "$$recorded" 2>/dev/null; then \
			pid="$$recorded"; \
		else \
			echo "stale pid file ($(PID_FILE), pid $$recorded)"; \
		fi; \
	fi; \
	listen=""; \
	if command -v lsof >/dev/null 2>&1; then \
		listen=$$(lsof -nP -tiTCP:$(PORT) -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' || true); \
	fi; \
	if [ -n "$$pid" ] || [ -n "$$listen" ]; then \
		echo "running"; \
		if [ -n "$$pid" ]; then echo "pid $$pid"; fi; \
		if [ -n "$$listen" ]; then echo "listening $$listen"; fi; \
		echo "url http://127.0.0.1:$(PORT)"; \
		if [ -f "$(META_FILE)" ]; then cat "$(META_FILE)"; fi; \
	else \
		echo "stopped"; \
	fi
